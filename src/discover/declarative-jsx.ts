import ts from "typescript";
import type { Tool } from "../types.js";
import { staticValue, unwrap, walk } from "./ast.js";
import { formSchema, type FormField } from "./form.js";
import { followCalls, resolveHandler } from "./handler.js";
import type { Project } from "./program.js";
import { createTool } from "./tool.js";

type JsxTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

interface Attribute {
  present: boolean;
  initializer: ts.JsxAttributeValue | undefined;
}

function attribute(tag: JsxTag, name: string): Attribute {
  for (const prop of tag.attributes.properties) {
    if (!ts.isJsxAttribute(prop)) continue;
    const propName = ts.isIdentifier(prop.name) ? prop.name.text : `${prop.name.namespace.text}:${prop.name.name.text}`;
    if (propName.toLowerCase() === name.toLowerCase()) return { present: true, initializer: prop.initializer };
  }
  return { present: false, initializer: undefined };
}

function attributeExpression(attr: Attribute): ts.Expression | null {
  const init = attr.initializer;
  if (!init) return null;
  if (ts.isStringLiteral(init)) return init;
  if (ts.isJsxExpression(init) && init.expression) return init.expression;
  return null;
}

function attributeString(project: Project, tag: JsxTag, name: string): string | null {
  const attr = attribute(tag, name);
  if (!attr.present) return null;
  const expr = attributeExpression(attr);
  if (!expr) return "";
  const value = staticValue(project, expr);
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function booleanAttribute(project: Project, tag: JsxTag, name: string): boolean {
  const attr = attribute(tag, name);
  if (!attr.present) return false;
  const expr = attributeExpression(attr);
  return !expr || staticValue(project, expr) !== false;
}

function tagName(tag: JsxTag): string {
  return tag.tagName.getText();
}

function openingTag(node: ts.Node): JsxTag | null {
  if (ts.isJsxSelfClosingElement(node)) return node;
  if (ts.isJsxElement(node)) return node.openingElement;
  return null;
}

function selectOptions(project: Project, element: ts.Node): string[] {
  const options: string[] = [];
  walk(element, (node) => {
    if (!ts.isJsxElement(node) || tagName(node.openingElement) !== "option") return;
    const value = attributeString(project, node.openingElement, "value");
    const text = node.children.map((c) => (ts.isJsxText(c) ? c.text.trim() : "")).join("");
    if (value !== null) options.push(value);
    else if (!attribute(node.openingElement, "value").present && text) options.push(text);
  });
  return options;
}

function fields(project: Project, form: ts.Node): FormField[] {
  const result: FormField[] = [];
  walk(form, (node) => {
    const tag = openingTag(node);
    if (!tag) return;
    const name = tagName(tag);
    if (name !== "input" && name !== "select" && name !== "textarea") return;
    result.push({
      tag: name,
      name: attributeString(project, tag, "name"),
      type: attributeString(project, tag, "type"),
      maxLength: attributeString(project, tag, "maxLength"),
      pattern: attributeString(project, tag, "pattern"),
      required: booleanAttribute(project, tag, "required"),
      description: attributeString(project, tag, "toolparamdescription"),
      value: attributeString(project, tag, "value"),
      options: name === "select" ? selectOptions(project, node) : null,
    });
  });
  return result;
}

function formHandler(project: Project, tag: JsxTag): ts.Node | null {
  for (const name of ["onSubmit", "action"]) {
    const expr = attributeExpression(attribute(tag, name));
    if (expr && !ts.isStringLiteral(unwrap(expr))) {
      const handler = resolveHandler(project, expr);
      if (handler) return handler;
    }
  }
  return null;
}

export function discoverJsxForms(project: Project, sourceFile: ts.SourceFile): Tool[] {
  const tools: Tool[] = [];
  walk(sourceFile, (node) => {
    const tag = openingTag(node);
    if (!tag || !attribute(tag, "toolname").present) return;
    const handler = formHandler(project, tag);
    const autosubmit = booleanAttribute(project, tag, "toolautosubmit");
    tools.push(
      createTool(project, tag, {
        name: attributeString(project, tag, "toolname") || "(unnamed)",
        description: attributeString(project, tag, "tooldescription"),
        inputSchema: formSchema(fields(project, node)),
        handler,
        related: followCalls(project, handler),
        confirms: !autosubmit,
        autosubmit,
        style: "declarative",
        apis: [],
      }),
    );
  });
  return tools;
}

