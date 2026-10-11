import ts from "typescript";
import type { ModelContextApi, Tool } from "../types.js";
import { getProperty, propertyName, resolveSymbolDeclaration, resolveValue, unwrap, walk } from "./ast.js";
import type { Project } from "./program.js";
import { toolFromObject } from "./tool.js";

const GLOBAL_OWNERS = new Set(["window", "globalThis", "self"]);
const API_GLOBALS = new Set<string>(["document", "navigator"]);

function memberName(node: ts.Node): { object: ts.Node; name: string } | null {
  if (ts.isPropertyAccessExpression(node)) return { object: node.expression, name: node.name.text };
  if (ts.isElementAccessExpression(node)) {
    const arg = unwrap(node.argumentExpression);
    if (ts.isStringLiteralLike(arg)) return { object: node.expression, name: arg.text };
  }
  return null;
}

function globalApi(project: Project, node: ts.Node, depth: number): ModelContextApi | null {
  if (depth > 8) return null;
  const expr = unwrap(node);
  if (ts.isIdentifier(expr)) {
    if (API_GLOBALS.has(expr.text) && !resolveSymbolDeclaration(project, expr)) return expr.text as ModelContextApi;
    const value = resolveValue(project, expr);
    return value === expr ? null : globalApi(project, value, depth + 1);
  }
  const member = memberName(expr);
  if (member && API_GLOBALS.has(member.name)) {
    const owner = unwrap(member.object);
    if (ts.isIdentifier(owner) && GLOBAL_OWNERS.has(owner.text)) return member.name as ModelContextApi;
  }
  return null;
}

export function modelContextApis(project: Project, node: ts.Node, depth = 0): ModelContextApi[] {
  if (depth > 8) return [];
  const expr = unwrap(node);
  const member = memberName(expr);
  if (member) {
    if (member.name !== "modelContext") return [];
    const api = globalApi(project, member.object, depth + 1);
    return api ? [api] : [];
  }
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (
      op === ts.SyntaxKind.QuestionQuestionToken ||
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      const right = modelContextApis(project, expr.right, depth + 1);
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return right;
      return unique([...modelContextApis(project, expr.left, depth + 1), ...right]);
    }
    return [];
  }
  if (ts.isConditionalExpression(expr)) {
    return unique([
      ...modelContextApis(project, expr.whenTrue, depth + 1),
      ...modelContextApis(project, expr.whenFalse, depth + 1),
    ]);
  }
  if (ts.isIdentifier(expr)) {
    const declaration = resolveSymbolDeclaration(project, expr);
    if (!declaration) return [];
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      return modelContextApis(project, declaration.initializer, depth + 1);
    }
    if (ts.isBindingElement(declaration)) return destructuredApis(project, declaration, depth);
  }
  return [];
}

function destructuredApis(project: Project, element: ts.BindingElement, depth: number): ModelContextApi[] {
  const key = element.propertyName ? propertyName(element.propertyName) : propertyName(element.name);
  if (key !== "modelContext") return [];
  const pattern = element.parent;
  const declaration = pattern.parent;
  if (!ts.isObjectBindingPattern(pattern) || !ts.isVariableDeclaration(declaration) || !declaration.initializer) {
    return [];
  }
  const api = globalApi(project, declaration.initializer, depth + 1);
  return api ? [api] : [];
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function toolObjects(project: Project, method: string, args: ts.NodeArray<ts.Expression>): ts.ObjectLiteralExpression[] {
  if (!args[0]) return [];
  const arg = resolveValue(project, args[0]);
  if (!ts.isObjectLiteralExpression(arg)) return [];
  if (method === "registerTool") return [arg];
  const tools = getProperty(arg, "tools");
  const list = tools && resolveValue(project, tools);
  if (!list || !ts.isArrayLiteralExpression(list)) return [];
  return list.elements
    .map((element) => resolveValue(project, element))
    .filter(ts.isObjectLiteralExpression);
}

export function discoverImperative(project: Project, sourceFile: ts.SourceFile): Tool[] {
  const tools: Tool[] = [];
  walk(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return;
    const member = memberName(unwrap(node.expression));
    if (!member || (member.name !== "registerTool" && member.name !== "provideContext")) return;
    const apis = modelContextApis(project, member.object);
    if (apis.length === 0) return;
    for (const object of toolObjects(project, member.name, node.arguments)) {
      const anchor = member.name === "registerTool" ? node : object;
      tools.push(
        toolFromObject(project, object, {
          style: "imperative",
          anchor,
          handlerKeys: ["execute"],
          schemaKeys: ["inputSchema"],
          apis,
        }),
      );
    }
  });
  return tools;
}
