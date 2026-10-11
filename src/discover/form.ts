import type { JsonSchema } from "../types.js";

export interface FormField {
  tag: string;
  name: string | null;
  type: string | null;
  maxLength: string | null;
  pattern: string | null;
  required: boolean;
  description: string | null;
  value: string | null;
  options: string[] | null;
}

const IGNORED_TYPES = new Set(["submit", "button", "reset", "image", "hidden", "file"]);
const TEXT_TYPES = new Set(["text", "search", "tel", "url", "password"]);
const FORMAT_TYPES: Record<string, string> = {
  email: "email",
  date: "date",
  time: "time",
  "datetime-local": "date-time",
  month: "date",
  week: "date",
};

function fieldSchema(field: FormField): JsonSchema {
  const type = field.type?.toLowerCase() ?? "text";
  const schema: JsonSchema = {};
  if (field.tag === "select") {
    schema.type = "string";
    schema.enum = field.options ?? [];
  } else if (field.tag === "textarea" || TEXT_TYPES.has(type)) {
    schema.type = "string";
  } else if (type in FORMAT_TYPES) {
    schema.type = "string";
    schema.format = FORMAT_TYPES[type];
  } else if (type === "number" || type === "range") {
    schema.type = "number";
  } else if (type === "checkbox") {
    schema.type = "boolean";
  } else if (type === "radio") {
    schema.type = "string";
    schema.enum = field.value === null ? [] : [field.value];
  } else if (type === "color") {
    schema.type = "string";
    schema.pattern = "^#[0-9a-fA-F]{6}$";
  } else {
    schema.type = "string";
  }
  if (field.maxLength !== null && schema.type === "string" && /^\d+$/.test(field.maxLength)) {
    schema.maxLength = Number(field.maxLength);
  }
  if (field.pattern !== null && schema.type === "string") schema.pattern = field.pattern;
  if (field.description) schema.description = field.description;
  return schema;
}

export function formSchema(fields: FormField[]): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const field of fields) {
    if (!field.name || (field.tag === "input" && IGNORED_TYPES.has(field.type?.toLowerCase() ?? ""))) continue;
    const schema = fieldSchema(field);
    const existing = properties[field.name];
    if (existing && Array.isArray(existing.enum) && Array.isArray(schema.enum)) {
      existing.enum = [...existing.enum, ...schema.enum];
    } else {
      properties[field.name] = schema;
    }
    if (field.required && !required.includes(field.name)) required.push(field.name);
  }
  return { type: "object", properties, required, additionalProperties: false };
}
