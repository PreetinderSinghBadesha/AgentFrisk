import ts from "typescript";
import { words } from "../classify/keywords.js";
import { calleeName, propertyName, unwrap, walk } from "../discover/ast.js";
import type { Rule } from "./types.js";

const SENSITIVE_WORDS = new Set(["password", "passwd", "passwordhash", "secret", "token", "apikey", "ssn", "cardnumber", "cvv", "cvc"]);
const SENSITIVE_PAIRS = new Set(["api key", "card number", "private key", "access key", "social security"]);

export function isSensitiveField(name: string): boolean {
  const parts = words(name);
  return parts.some((w, i) => SENSITIVE_WORDS.has(w) || SENSITIVE_PAIRS.has(`${w} ${parts[i + 1]}`));
}

function returnedExpressions(body: ts.Node): ts.Node[] {
  const results: ts.Node[] = [];
  if (ts.isArrowFunction(body) && !ts.isBlock(body.body)) results.push(body.body);
  walk(body, (node) => {
    if (ts.isReturnStatement(node) && node.expression) results.push(node.expression);
    if (ts.isArrowFunction(node) && node !== body && !ts.isBlock(node.body)) results.push(node.body);
    if (ts.isCallExpression(node) && calleeName(node) === "respondWith" && node.arguments[0]) results.push(node.arguments[0]);
  });
  return results;
}

function localObject(bodies: ts.Node[], name: string): ts.Node | null {
  let found: ts.Node | null = null;
  for (const body of bodies) {
    walk(body, (node) => {
      if (!found && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
        found = node.initializer;
      }
    });
  }
  return found;
}

function fieldNames(expression: ts.Node, bodies: ts.Node[]): string[] {
  const names: string[] = [];
  const seen = new Set<ts.Node>();
  const visit = (node: ts.Node) => {
    const target = unwrap(node);
    if (seen.has(target)) return;
    seen.add(target);
    if (ts.isIdentifier(target)) {
      const initializer = localObject(bodies, target.text);
      if (initializer) visit(initializer);
      return;
    }
    walk(target, (child) => {
      if (ts.isObjectLiteralExpression(child)) {
        for (const prop of child.properties) {
          const name = prop.name && propertyName(prop.name);
          if (name) names.push(name);
          if (ts.isShorthandPropertyAssignment(prop)) visit(prop.name);
          if (ts.isSpreadAssignment(prop)) visit(prop.expression);
        }
      }
    });
  };
  visit(expression);
  return names;
}

export const sensitiveOutput: Rule = {
  id: "sensitive-output",
  severity: "warning",
  description: "The handler returns credentials, secrets, or payment data to the agent.",
  fix: "Return only the fields the agent needs. Map records to a safe shape and never send passwords, tokens, secrets, API keys, SSNs, or card numbers back to the model.",
  check(tool) {
    const bodies = tool.handler ? [tool.handler, ...tool.related] : tool.related;
    const fields = new Set<string>();
    for (const body of bodies) {
      for (const expression of returnedExpressions(body)) {
        for (const name of fieldNames(expression, bodies)) if (isSensitiveField(name)) fields.add(name);
      }
    }
    if (fields.size === 0) return null;
    return `Tool "${tool.name}" returns sensitive fields to the agent: ${[...fields].join(", ")}.`;
  },
};
