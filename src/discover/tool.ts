import ts from "typescript";
import type { ModelContextApi, Style, Tool } from "../types.js";
import { getProperty, lineOf, staticString } from "./ast.js";
import { followCalls, requestsConfirmation, resolveHandler } from "./handler.js";
import type { Project } from "./program.js";
import { ignoredRules } from "./suppress.js";
import { schemaFrom } from "./schema.js";

export interface ObjectToolOptions {
  style: Style;
  anchor: ts.Node;
  name?: string | null;
  handlerKeys: string[];
  schemaKeys: string[];
  apis?: ModelContextApi[];
}

function firstProperty(object: ts.ObjectLiteralExpression, keys: string[]): ts.Node | null {
  for (const key of keys) {
    const node = getProperty(object, key);
    if (node) return node;
  }
  return null;
}

export function toolFromObject(project: Project, object: ts.ObjectLiteralExpression, options: ObjectToolOptions): Tool {
  const handler = resolveHandler(project, firstProperty(object, options.handlerKeys));
  const related = followCalls(project, handler);
  const annotations = getProperty(object, "annotations");
  const name = staticString(project, getProperty(object, "name")) ?? options.name ?? "(unnamed)";
  return createTool(project, options.anchor, {
    name,
    description: staticString(project, getProperty(object, "description")),
    inputSchema: schemaFrom(project, firstProperty(object, options.schemaKeys)),
    handler,
    related,
    confirms: requestsConfirmation(project, annotations, handler ? [handler, ...related] : related),
    autosubmit: false,
    style: options.style,
    apis: options.apis ?? [],
  });
}

export type ToolFields = Omit<Tool, "file" | "line" | "source" | "ignored">;

export function createTool(project: Project, anchor: ts.Node, fields: ToolFields): Tool {
  const sourceFile = anchor.getSourceFile();
  return finalizeTool(fields, project.display(sourceFile), lineOf(anchor), sourceFile.text);
}

export function finalizeTool(fields: ToolFields, file: string, line: number, text: string): Tool {
  return { ...fields, file, line, source: `${file}:${line}`, ignored: ignoredRules(text, line) };
}
