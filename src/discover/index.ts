import { readFileSync } from "node:fs";
import { relative } from "node:path";
import type { Tool } from "../types.js";
import { discoverJsxForms } from "./declarative-jsx.js";
import { toPosix } from "./files.js";
import { formSchema } from "./form.js";
import { padScript, parseHtml, type HtmlForm } from "./html.js";
import { discoverImperative } from "./imperative.js";
import { discoverLibrary } from "./library.js";
import { createProject, normalizePath, type Project } from "./program.js";
import { finalizeTool } from "./tool.js";

export interface DiscoverInput {
  root: string;
  files: Map<string, string>;
  configDir?: string;
}

export interface Discovery {
  project: Project;
  tools: Tool[];
}

const SCRIPT_FILE = /\.(m|c)?(j|t)sx?$/i;
const HTML_FILE = /\.html?$/i;

export function readSources(paths: string[]): Map<string, string> {
  return new Map(paths.map((p) => [normalizePath(p), readFileSync(p, "utf8")]));
}

function htmlTool(form: HtmlForm, file: string, text: string): Tool {
  const autosubmit = "toolautosubmit" in form.attributes;
  return finalizeTool(
    {
      name: form.attributes.toolname || "(unnamed)",
      description: form.attributes.tooldescription ?? null,
      inputSchema: formSchema(form.fields),
      handler: null,
      related: [],
      confirms: !autosubmit,
      autosubmit,
      style: "declarative",
      apis: [],
    },
    file,
    form.line,
    text,
  );
}

export function discover(input: DiscoverInput): Discovery {
  const scripts = new Map<string, string>();
  const displayFiles = new Map<string, string>();
  const tools: Tool[] = [];
  for (const [path, text] of input.files) {
    const normalized = normalizePath(path);
    if (SCRIPT_FILE.test(normalized)) scripts.set(normalized, text);
    if (!HTML_FILE.test(normalized)) continue;
    const { forms, scripts: inline } = parseHtml(text);
    const display = toPosix(relative(input.root, normalized));
    tools.push(...forms.map((form) => htmlTool(form, display, text)));
    inline.forEach((script, i) => {
      const virtual = `${normalized}.inline-${i}.js`;
      scripts.set(virtual, padScript(text, script));
      displayFiles.set(virtual, normalized);
    });
  }
  const project = createProject(scripts, displayFiles, input.root, input.configDir);
  for (const sourceFile of project.scripts) {
    tools.push(...discoverImperative(project, sourceFile), ...discoverJsxForms(project, sourceFile));
  }
  tools.push(...discoverLibrary(project, project.scripts));
  tools.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { project, tools };
}
