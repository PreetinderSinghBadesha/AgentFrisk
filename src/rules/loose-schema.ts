import type { JsonSchema } from "../types.js";
import type { Rule } from "./types.js";

const BOUNDED_FORMATS = new Set([
  "email", "uuid", "guid", "date", "date-time", "datetime", "time", "duration", "ipv4", "ipv6", "ip",
  "cidrv4", "cidrv6", "cuid", "cuid2", "ulid", "nanoid", "e164", "jwt", "base64", "base64url", "emoji",
]);

const isObject = (value: unknown): value is JsonSchema =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function hasType(schema: JsonSchema, type: string): boolean {
  return schema.type === type || (Array.isArray(schema.type) && schema.type.includes(type));
}

function isBoundedString(schema: JsonSchema): boolean {
  return (
    typeof schema.maxLength === "number" ||
    typeof schema.pattern === "string" ||
    Array.isArray(schema.enum) ||
    "const" in schema ||
    (typeof schema.format === "string" && BOUNDED_FORMATS.has(schema.format))
  );
}

function inspect(schema: JsonSchema, path: string, open: string[], strings: string[]): void {
  const isObjectSchema = hasType(schema, "object") || isObject(schema.properties);
  if (isObjectSchema && schema.additionalProperties !== false) {
    open.push(path);
  }
  if (hasType(schema, "string") && !isBoundedString(schema)) strings.push(path);
  if (isObject(schema.properties)) {
    for (const [key, value] of Object.entries(schema.properties)) {
      if (isObject(value)) inspect(value, path ? `${path}.${key}` : key, open, strings);
    }
  }
  if (isObject(schema.items)) inspect(schema.items, `${path}[]`, open, strings);
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    const variants = schema[key];
    if (Array.isArray(variants)) variants.filter(isObject).forEach((v) => inspect(v, path, open, strings));
  }
}

export function schemaProblems(schema: JsonSchema | null | "unknown"): string[] {
  if (schema === "unknown") return [];
  if (schema === null) return ["no inputSchema"];
  const open: string[] = [];
  const strings: string[] = [];
  inspect(schema, "", open, strings);
  const problems: string[] = [];
  if (open.length > 0) {
    const where = [...new Set(open)].map((p) => (p ? `"${p}"` : "the root object")).join(", ");
    problems.push(`additionalProperties is not false on ${where}`);
  }
  if (strings.length > 0) {
    const names = [...new Set(strings)].map((p) => `"${p || "(root)"}"`).join(", ");
    problems.push(`string input${strings.length === 1 ? "" : "s"} ${names} ${strings.length === 1 ? "has" : "have"} no maxLength, pattern, or enum`);
  }
  return problems;
}

export const looseSchema: Rule = {
  id: "loose-schema",
  severity: "warning",
  description: "The tool's input is loosely validated: no inputSchema, extra properties allowed, or unbounded strings.",
  fix: "Declare an inputSchema with additionalProperties: false and bound every string with maxLength, pattern, or enum (for forms: maxlength or pattern attributes, or a <select>).",
  check(tool) {
    const problems = schemaProblems(tool.inputSchema);
    if (problems.length === 0) return null;
    return `Tool "${tool.name}" accepts loosely validated input: ${problems.join("; ")}.`;
  },
};
