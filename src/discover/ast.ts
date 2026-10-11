import ts from "typescript";
import type { Project } from "./program.js";

export const UNKNOWN = Symbol("unknown");
export type Static = unknown | typeof UNKNOWN;

export function unwrap(node: ts.Node): ts.Node {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isAwaitExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

export function propertyName(name: ts.PropertyName | ts.MemberName | ts.BindingName): string | null {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    const inner = unwrap(name.expression);
    if (ts.isStringLiteralLike(inner)) return inner.text;
  }
  return null;
}

export function getProperty(object: ts.ObjectLiteralExpression, key: string): ts.Node | null {
  for (let i = object.properties.length - 1; i >= 0; i--) {
    const prop = object.properties[i];
    if (ts.isSpreadAssignment(prop) || !prop.name || propertyName(prop.name) !== key) continue;
    if (ts.isPropertyAssignment(prop)) return prop.initializer;
    if (ts.isShorthandPropertyAssignment(prop)) return prop.name;
    return prop;
  }
  return null;
}

export function lineOf(node: ts.Node): number {
  const sf = node.getSourceFile();
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

export function resolveSymbolDeclaration(project: Project, node: ts.Node): ts.Declaration | null {
  let symbol =
    ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
      ? project.checker.getShorthandAssignmentValueSymbol(node.parent)
      : project.checker.getSymbolAtLocation(node);
  if (!symbol) return null;
  if (symbol.flags & ts.SymbolFlags.Alias) {
    try {
      symbol = project.checker.getAliasedSymbol(symbol);
    } catch {
      return null;
    }
  }
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (!declaration || !project.isProjectFile(declaration.getSourceFile())) return null;
  if (ts.isShorthandPropertyAssignment(declaration) && declaration.name !== node) {
    return resolveSymbolDeclaration(project, declaration.name);
  }
  return declaration;
}

export function resolveValue(project: Project, node: ts.Node, depth = 0): ts.Node {
  const target = unwrap(node);
  if (depth > 8) return target;
  if (!ts.isIdentifier(target) && !ts.isPropertyAccessExpression(target)) return target;
  const declaration = resolveSymbolDeclaration(
    project,
    ts.isPropertyAccessExpression(target) ? target.name : target,
  );
  if (!declaration) return target;
  if (ts.isVariableDeclaration(declaration)) {
    if (!declaration.initializer || !isConstDeclaration(declaration)) return target;
    if (!ts.isIdentifier(declaration.name)) return target;
    return resolveValue(project, declaration.initializer, depth + 1);
  }
  if (ts.isPropertyAssignment(declaration)) return resolveValue(project, declaration.initializer, depth + 1);
  if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) return declaration;
  if (ts.isExportAssignment(declaration)) return resolveValue(project, declaration.expression, depth + 1);
  return target;
}

function isConstDeclaration(declaration: ts.VariableDeclaration): boolean {
  const list = declaration.parent;
  return ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0;
}

export function staticValue(project: Project, node: ts.Node | null | undefined, depth = 0): Static {
  if (!node || depth > 20) return UNKNOWN;
  const expr = resolveValue(project, node);
  if (ts.isStringLiteralLike(expr)) return expr.text;
  if (ts.isNumericLiteral(expr)) return Number(expr.text);
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expr.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.MinusToken) {
    const inner = staticValue(project, expr.operand, depth + 1);
    return typeof inner === "number" ? -inner : UNKNOWN;
  }
  if (ts.isTemplateExpression(expr)) {
    let text = expr.head.text;
    for (const span of expr.templateSpans) {
      const value = staticValue(project, span.expression, depth + 1);
      if (value === UNKNOWN || (typeof value === "object" && value !== null)) return UNKNOWN;
      text += String(value) + span.literal.text;
    }
    return text;
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticValue(project, expr.left, depth + 1);
    const right = staticValue(project, expr.right, depth + 1);
    if (typeof left === "string" || typeof right === "string") {
      if (left === UNKNOWN || right === UNKNOWN) return UNKNOWN;
      return String(left) + String(right);
    }
    return typeof left === "number" && typeof right === "number" ? left + right : UNKNOWN;
  }
  if (ts.isArrayLiteralExpression(expr)) {
    const items: unknown[] = [];
    for (const element of expr.elements) {
      if (ts.isSpreadElement(element)) {
        const spread = staticValue(project, element.expression, depth + 1);
        if (!Array.isArray(spread)) return UNKNOWN;
        items.push(...spread);
        continue;
      }
      const value = staticValue(project, element, depth + 1);
      if (value === UNKNOWN) return UNKNOWN;
      items.push(value);
    }
    return items;
  }
  if (ts.isObjectLiteralExpression(expr)) {
    const result: Record<string, unknown> = {};
    for (const prop of expr.properties) {
      if (ts.isSpreadAssignment(prop)) {
        const spread = staticValue(project, prop.expression, depth + 1);
        if (spread === UNKNOWN || typeof spread !== "object" || spread === null) return UNKNOWN;
        Object.assign(result, spread);
        continue;
      }
      const key = prop.name ? propertyName(prop.name) : null;
      if (key === null) return UNKNOWN;
      if (ts.isPropertyAssignment(prop)) {
        const value = staticValue(project, prop.initializer, depth + 1);
        if (value === UNKNOWN) return UNKNOWN;
        result[key] = value;
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        const value = staticValue(project, prop.name, depth + 1);
        if (value === UNKNOWN) return UNKNOWN;
        result[key] = value;
      } else return UNKNOWN;
    }
    return result;
  }
  return UNKNOWN;
}

export function staticString(project: Project, node: ts.Node | null | undefined): string | null {
  const value = staticValue(project, node);
  return typeof value === "string" ? value : null;
}

export function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node)
  );
}

export function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

export function calleeName(call: ts.CallExpression): string | null {
  const callee = unwrap(call.expression);
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  if (ts.isElementAccessExpression(callee)) {
    const arg = unwrap(callee.argumentExpression);
    if (ts.isStringLiteralLike(arg)) return arg.text;
  }
  return null;
}

export function importSource(project: Project, identifier: ts.Node): { module: string; name: string } | null {
  const symbol = project.checker.getSymbolAtLocation(identifier);
  const declaration = symbol?.declarations?.[0];
  if (!declaration) return null;
  if (ts.isImportSpecifier(declaration)) {
    const module = declaration.parent.parent.parent.moduleSpecifier;
    const name = (declaration.propertyName ?? declaration.name).text;
    return ts.isStringLiteral(module) ? { module: module.text, name } : null;
  }
  if (ts.isNamespaceImport(declaration)) {
    const module = declaration.parent.parent.moduleSpecifier;
    return ts.isStringLiteral(module) ? { module: module.text, name: "*" } : null;
  }
  return null;
}
