import ts from "typescript";
import type { InputSchema, JsonSchema } from "../types.js";
import { calleeName, importSource, propertyName, resolveValue, staticValue, UNKNOWN, unwrap } from "./ast.js";
import type { Project } from "./program.js";

interface Converted {
  schema: JsonSchema;
  optional: boolean;
}

const FORMATS = new Set([
  "email", "url", "uuid", "guid", "cuid", "cuid2", "ulid", "nanoid", "ipv4", "ipv6", "cidrv4", "cidrv6",
  "base64", "base64url", "emoji", "jwt", "e164", "datetime", "date", "time", "duration", "ip", "hostname",
]);

const JSON_SCHEMA_CONVERTERS = new Set(["toJSONSchema", "zodToJsonSchema"]);

export function schemaFrom(project: Project, node: ts.Node | null): InputSchema {
  if (!node) return null;
  const value = staticValue(project, node);
  if (value !== UNKNOWN) {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonSchema) : "unknown";
  }
  const expr = resolveValue(project, node);
  if (ts.isCallExpression(expr) && JSON_SCHEMA_CONVERTERS.has(calleeName(expr) ?? "") && expr.arguments[0]) {
    return zodSchema(project, expr.arguments[0]);
  }
  return zodSchema(project, node);
}

function zodSchema(project: Project, node: ts.Node): InputSchema {
  return convert(project, node, 0)?.schema ?? "unknown";
}

function isZodNamespace(project: Project, node: ts.Node): boolean {
  const expr = unwrap(node);
  if (!ts.isIdentifier(expr)) return false;
  const source = importSource(project, expr);
  if (source) return source.module === "zod" || source.module.startsWith("zod/");
  return expr.text === "z";
}

function convert(project: Project, node: ts.Node, depth: number): Converted | null {
  if (depth > 30) return null;
  const expr = resolveValue(project, node);
  if (!ts.isCallExpression(expr)) return null;
  const callee = unwrap(expr.expression);
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const method = callee.name.text;
  if (isZodNamespace(project, callee.expression)) return base(project, method, expr.arguments, depth);
  const inner = convert(project, callee.expression, depth + 1);
  return inner && modify(project, inner, method, expr.arguments, depth);
}

function objectShape(project: Project, node: ts.Node | undefined, depth: number): JsonSchema | null {
  if (!node) return { type: "object", properties: {} };
  const shape = resolveValue(project, node);
  if (!ts.isObjectLiteralExpression(shape)) return null;
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const prop of shape.properties) {
    if (ts.isSpreadAssignment(prop) || !prop.name) continue;
    const key = propertyName(prop.name);
    if (key === null) continue;
    const value = ts.isPropertyAssignment(prop) ? prop.initializer : ts.isShorthandPropertyAssignment(prop) ? prop.name : null;
    const converted = value ? convert(project, value, depth + 1) : null;
    properties[key] = converted?.schema ?? {};
    if (!converted?.optional) required.push(key);
  }
  return { type: "object", properties, required };
}

function base(project: Project, method: string, args: ts.NodeArray<ts.Expression>, depth: number): Converted | null {
  const done = (schema: JsonSchema): Converted => ({ schema, optional: false });
  switch (method) {
    case "object":
    case "strictObject":
    case "looseObject": {
      const shape = objectShape(project, args[0], depth);
      if (!shape) return null;
      return done(method === "looseObject" ? shape : { ...shape, additionalProperties: false });
    }
    case "string":
      return done({ type: "string" });
    case "number":
    case "bigint":
      return done({ type: "number" });
    case "int":
      return done({ type: "integer" });
    case "boolean":
      return done({ type: "boolean" });
    case "date":
      return done({ type: "string", format: "date-time" });
    case "enum":
    case "nativeEnum": {
      const values = staticValue(project, args[0]);
      return done({ enum: Array.isArray(values) ? values : typeof values === "object" && values ? Object.values(values) : [] });
    }
    case "literal": {
      const value = staticValue(project, args[0]);
      return done({ const: value === UNKNOWN ? null : value });
    }
    case "array": {
      const items = args[0] ? convert(project, args[0], depth + 1) : null;
      return done({ type: "array", items: items?.schema ?? {} });
    }
    case "union":
    case "discriminatedUnion": {
      const list = resolveValue(project, args[method === "union" ? 0 : 1] ?? args[0]);
      if (!ts.isArrayLiteralExpression(list)) return done({});
      return done({ anyOf: list.elements.map((e) => convert(project, e, depth + 1)?.schema ?? {}) });
    }
    case "optional":
    case "nullable":
    case "nullish": {
      const inner = args[0] ? convert(project, args[0], depth + 1) : null;
      return inner && { schema: inner.schema, optional: method !== "nullable" };
    }
    case "record":
      return done({ type: "object", additionalProperties: (args[1] && convert(project, args[1], depth + 1)?.schema) ?? {} });
    default:
      if (FORMATS.has(method)) return done({ type: "string", format: method });
      return done({});
  }
}

function modify(
  project: Project,
  inner: Converted,
  method: string,
  args: ts.NodeArray<ts.Expression>,
  depth: number,
): Converted {
  const schema = { ...inner.schema };
  const arg = staticValue(project, args[0]);
  switch (method) {
    case "optional":
    case "nullish":
    case "default":
    case "catch":
      return { schema, optional: true };
    case "strict":
    case "strip":
      return { schema: { ...schema, additionalProperties: false }, optional: inner.optional };
    case "passthrough":
    case "loose": {
      const { additionalProperties: _, ...open } = schema;
      return { schema: open, optional: inner.optional };
    }
    case "catchall":
      return { schema: { ...schema, additionalProperties: args[0] ? convert(project, args[0], depth + 1)?.schema ?? {} : {} }, optional: inner.optional };
    case "max":
    case "length":
      if (schema.type === "string") schema.maxLength = typeof arg === "number" ? arg : 0;
      else if (schema.type === "array") schema.maxItems = typeof arg === "number" ? arg : 0;
      break;
    case "regex":
    case "startsWith":
    case "endsWith":
    case "includes":
      schema.pattern = typeof arg === "string" ? arg : method;
      break;
    case "describe":
      if (typeof arg === "string") schema.description = arg;
      break;
    case "extend":
    case "merge": {
      const extra = method === "extend" ? objectShape(project, args[0], depth) : args[0] ? convert(project, args[0], depth + 1)?.schema ?? null : null;
      if (extra) {
        schema.properties = { ...(schema.properties as object), ...(extra.properties as object) };
        schema.required = [...((schema.required as string[]) ?? []), ...((extra.required as string[]) ?? [])];
      }
      break;
    }
    case "partial":
      schema.required = [];
      break;
    default:
      if (FORMATS.has(method) && schema.type === "string") schema.format = method;
  }
  return { schema, optional: inner.optional };
}
