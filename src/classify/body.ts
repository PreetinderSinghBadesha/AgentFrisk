import ts from "typescript";
import { calleeName, getProperty, resolveValue, staticString, unwrap, walk } from "../discover/ast.js";
import type { Project } from "../discover/program.js";
import type { Effect } from "../types.js";
import { words } from "./keywords.js";

export interface Signal {
  effect: Effect;
  description: string;
}

const HTTP_METHODS: Record<string, Effect> = { POST: "write", PUT: "write", PATCH: "write", DELETE: "destructive" };
const GLOBAL_OWNERS = new Set(["window", "globalThis", "self"]);
const FETCH_FUNCTIONS = new Set(["fetch", "$fetch", "ofetch"]);
const HTTP_CLIENTS = new Set(["axios", "ky", "got", "http", "api", "request"]);
const METHOD_VERBS: Record<string, Effect> = {
  delete: "destructive",
  del: "destructive",
  destroy: "destructive",
  remove: "destructive",
  drop: "destructive",
  truncate: "destructive",
  purge: "destructive",
  update: "write",
  insert: "write",
  create: "write",
  upsert: "write",
  save: "write",
  put: "write",
  patch: "write",
  post: "write",
  send: "write",
};
const PAYMENT_RESOURCES = new Set(["charges", "refunds", "transfers", "payouts", "paymentIntents"]);
const PAYMENT_READS = new Set(["retrieve", "list", "search", "get"]);
const IGNORED_RECEIVERS = new Set([
  "Object", "Array", "JSON", "Math", "Promise", "Reflect", "Symbol", "URL", "console",
  "document", "window", "globalThis", "classList", "style", "dataset", "searchParams", "headers",
  "localStorage", "sessionStorage", "crypto", "subtle", "React", "Response", "Request",
]);
const BUILTIN_CLASSES = new Set(["Map", "Set", "WeakMap", "WeakSet", "URLSearchParams", "Headers", "FormData", "URL", "Date"]);
const IGNORED_METHODS = new Set([
  "createElement", "createElementNS", "createTextNode", "createDocumentFragment", "createRange",
  "createObjectURL", "createContext", "createRef", "createPortal", "createRoot", "createHash", "createHmac",
  "removeEventListener", "removeChild", "removeAttribute", "removeProperty", "insertBefore",
  "insertAdjacentHTML", "insertAdjacentElement", "insertAdjacentText", "postMessage",
]);
const SQL: [RegExp, Effect, string][] = [
  [/\bdelete\s+from\b/i, "destructive", "DELETE"],
  [/\bdrop\s+(table|database|schema|index|view)\b/i, "destructive", "DROP"],
  [/\btruncate\s+(table\s+)?["`\w[]/i, "destructive", "TRUNCATE"],
  [/\bupdate\s+["`\w.[\]]+\s+set\b/i, "write", "UPDATE"],
  [/\binsert\s+into\b/i, "write", "INSERT"],
];

function short(node: ts.Node): string {
  const text = node.getText().replace(/\s+/g, " ");
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function chain(node: ts.Node): string[] {
  const parts: string[] = [];
  let current = unwrap(node);
  while (true) {
    if (ts.isPropertyAccessExpression(current)) {
      parts.unshift(current.name.text);
      current = unwrap(current.expression);
    } else if (ts.isCallExpression(current) || ts.isElementAccessExpression(current)) {
      current = unwrap(current.expression);
    } else break;
  }
  if (ts.isIdentifier(current)) parts.unshift(current.text);
  return parts;
}

function httpMethod(project: Project, init: ts.Node | undefined): string | null {
  if (!init) return null;
  const object = unwrap(init);
  if (!ts.isObjectLiteralExpression(object)) return null;
  const method = staticString(project, getProperty(object, "method"))?.toUpperCase();
  return method && HTTP_METHODS[method] ? method : null;
}

function httpSignal(method: string | null, label: string): Signal | null {
  return method ? { effect: HTTP_METHODS[method], description: `${label} ${method} request` } : null;
}

function callSignal(project: Project, call: ts.CallExpression): Signal | null {
  const callee = unwrap(call.expression);
  const name = calleeName(call);
  if (!name) return null;
  const parts = chain(callee);
  const receiver = parts.length > 1 ? parts[parts.length - 2] : null;

  if (FETCH_FUNCTIONS.has(name) && (parts.length === 1 || (parts.length === 2 && GLOBAL_OWNERS.has(parts[0])))) {
    return httpSignal(httpMethod(project, call.arguments[1]), name);
  }
  if (parts.length === 1 && HTTP_CLIENTS.has(name)) {
    return httpSignal(httpMethod(project, call.arguments[0]) ?? httpMethod(project, call.arguments[1]), name);
  }
  if (!ts.isPropertyAccessExpression(callee) && !ts.isElementAccessExpression(callee)) return null;
  if (name === "request" && receiver && HTTP_CLIENTS.has(receiver)) {
    return httpSignal(httpMethod(project, call.arguments[0]), receiver);
  }
  if (parts.some((p) => PAYMENT_RESOURCES.has(p)) && !PAYMENT_READS.has(name)) {
    return { effect: "destructive", description: `payment call ${short(callee)}()` };
  }
  if (IGNORED_METHODS.has(name) || (receiver && IGNORED_RECEIVERS.has(receiver))) return null;
  if (isBuiltinInstance(project, callee.expression)) return null;
  const effect = METHOD_VERBS[words(name)[0] ?? ""];
  return effect ? { effect, description: `${short(callee)}()` } : null;
}

function isBuiltinInstance(project: Project, node: ts.Node): boolean {
  const value = resolveValue(project, node);
  return ts.isNewExpression(value) && ts.isIdentifier(value.expression) && BUILTIN_CLASSES.has(value.expression.text);
}

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((s) => `? ${s.literal.text}`).join("");
  }
  return null;
}

function sqlSignal(node: ts.Node): Signal | null {
  const text = literalText(node);
  if (!text) return null;
  for (const [pattern, effect, keyword] of SQL) {
    if (pattern.test(text)) return { effect, description: `SQL ${keyword} statement` };
  }
  return null;
}

export function bodySignals(project: Project, bodies: ts.Node[]): Signal[] {
  const signals: Signal[] = [];
  for (const body of bodies) {
    walk(body, (node) => {
      const signal = ts.isCallExpression(node) ? callSignal(project, node) : sqlSignal(node);
      if (signal && !signals.some((s) => s.description === signal.description)) signals.push(signal);
    });
  }
  return signals;
}
