import ts from "typescript";
import type { Tool } from "../types.js";
import { importSource, propertyName, resolveValue, unwrap, walk } from "./ast.js";
import type { Project } from "./program.js";
import { toolFromObject } from "./tool.js";

const NEXTJS = "nextjs-webmcp";
const REACT = "webmcp-react";

function libraryCall(project: Project, node: ts.Node, module: string, name: string): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const callee = unwrap(node.expression);
  const target = ts.isPropertyAccessExpression(callee) ? callee.expression : callee;
  const source = importSource(project, target);
  if (!source || (source.module !== module && !source.module.startsWith(`${module}/`))) return false;
  if (ts.isPropertyAccessExpression(callee)) return source.name === "*" && callee.name.text === name;
  return source.name === name;
}

function definition(project: Project, node: ts.Node): { object: ts.ObjectLiteralExpression; call: ts.CallExpression | null } | null {
  const value = resolveValue(project, node);
  if (libraryCall(project, value, NEXTJS, "tool")) {
    const arg = value.arguments[0] && resolveValue(project, value.arguments[0]);
    return arg && ts.isObjectLiteralExpression(arg) ? { object: arg, call: value } : null;
  }
  return ts.isObjectLiteralExpression(value) ? { object: value, call: null } : null;
}

function nextjsTool(project: Project, object: ts.ObjectLiteralExpression, anchor: ts.Node, name: string | null): Tool {
  return toolFromObject(project, object, {
    style: "library",
    anchor,
    name,
    handlerKeys: ["execute"],
    schemaKeys: ["input", "inputSchema"],
  });
}

export function discoverLibrary(project: Project, sourceFiles: readonly ts.SourceFile[]): Tool[] {
  const tools: Tool[] = [];
  const consumed = new Set<ts.Node>();
  for (const sourceFile of sourceFiles) {
    tools.push(...defineToolsCalls(project, sourceFile, consumed));
  }
  for (const sourceFile of sourceFiles) {
    tools.push(...standaloneTools(project, sourceFile, consumed));
  }
  return tools;
}

function defineToolsCalls(project: Project, sourceFile: ts.SourceFile, consumed: Set<ts.Node>): Tool[] {
  const tools: Tool[] = [];
  walk(sourceFile, (node) => {
    if (!libraryCall(project, node, NEXTJS, "defineTools") || !node.arguments[0]) return;
    const arg = resolveValue(project, node.arguments[0]);
    if (ts.isObjectLiteralExpression(arg)) {
      for (const prop of arg.properties) {
        if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue;
        const def = definition(project, ts.isPropertyAssignment(prop) ? prop.initializer : prop.name);
        if (!def) continue;
        if (def.call) consumed.add(def.call);
        tools.push(nextjsTool(project, def.object, prop, propertyName(prop.name)));
      }
    } else if (ts.isArrayLiteralExpression(arg)) {
      for (const element of arg.elements) {
        const def = definition(project, element);
        if (!def) continue;
        if (def.call) consumed.add(def.call);
        tools.push(nextjsTool(project, def.object, def.call ?? def.object, null));
      }
    }
  });
  return tools;
}

function standaloneTools(project: Project, sourceFile: ts.SourceFile, consumed: Set<ts.Node>): Tool[] {
  const tools: Tool[] = [];
  walk(sourceFile, (node) => {
    if (libraryCall(project, node, NEXTJS, "tool") && !consumed.has(node)) {
      const def = definition(project, node);
      if (def) tools.push(nextjsTool(project, def.object, node, null));
    }
    if (libraryCall(project, node, REACT, "useMcpTool") && node.arguments[0]) {
      const object = resolveValue(project, node.arguments[0]);
      if (!ts.isObjectLiteralExpression(object)) return;
      tools.push(
        toolFromObject(project, object, {
          style: "library",
          anchor: node,
          handlerKeys: ["handler", "execute"],
          schemaKeys: ["input", "inputSchema"],
        }),
      );
    }
  });
  return tools;
}
