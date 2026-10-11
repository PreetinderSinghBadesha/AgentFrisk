import ts from "typescript";
import { calleeName, getProperty, isFunctionLike, resolveSymbolDeclaration, resolveValue, staticValue, unwrap, walk } from "./ast.js";
import type { Project } from "./program.js";

export function resolveHandler(project: Project, node: ts.Node | null): ts.Node | null {
  if (!node) return null;
  if (isFunctionLike(node)) return node;
  const value = resolveValue(project, node);
  if (isFunctionLike(value) || ts.isCallExpression(value)) return value;
  return null;
}

function declarationBody(declaration: ts.Declaration): ts.Node | null {
  if (isFunctionLike(declaration)) return declaration;
  if (ts.isVariableDeclaration(declaration) && declaration.initializer) return declaration.initializer;
  if (ts.isPropertyAssignment(declaration)) return declaration.initializer;
  return null;
}

function contains(outer: ts.Node, inner: ts.Node): boolean {
  return (
    outer.getSourceFile() === inner.getSourceFile() &&
    inner.pos >= outer.pos &&
    inner.end <= outer.end
  );
}

export function followCalls(project: Project, handler: ts.Node | null): ts.Node[] {
  if (!handler) return [];
  const related: ts.Node[] = [];
  walk(handler, (node) => {
    let target: ts.Node | null = null;
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      target = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
    } else if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer)) {
      const expr = node.initializer.expression && unwrap(node.initializer.expression);
      if (expr && (ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr))) {
        target = ts.isPropertyAccessExpression(expr) ? expr.name : expr;
      }
    }
    if (!target || !ts.isIdentifier(target)) return;
    const declaration = resolveSymbolDeclaration(project, target);
    const body = declaration && declarationBody(declaration);
    if (!body || contains(handler, body) || related.some((r) => r === body)) return;
    related.push(body);
  });
  return related;
}

const CONFIRM_CALLS = new Set(["requestUserInteraction", "confirm"]);

export function requestsConfirmation(project: Project, annotations: ts.Node | null, bodies: ts.Node[]): boolean {
  const object = annotations && resolveValue(project, annotations);
  if (object && ts.isObjectLiteralExpression(object)) {
    const hint = getProperty(object, "consequentialHint");
    if (hint && staticValue(project, hint) === true) return true;
  }
  let found = false;
  for (const body of bodies) {
    walk(body, (node) => {
      if (found || !ts.isCallExpression(node)) return;
      const name = calleeName(node);
      if (!name || !CONFIRM_CALLS.has(name)) return;
      const callee = unwrap(node.expression);
      if (name === "confirm" && ts.isPropertyAccessExpression(callee)) {
        const owner = unwrap(callee.expression);
        found = ts.isIdentifier(owner) && ["window", "globalThis", "self"].includes(owner.text);
        return;
      }
      found = true;
    });
    if (found) return true;
  }
  return false;
}
