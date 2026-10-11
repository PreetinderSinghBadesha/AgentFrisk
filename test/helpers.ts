import { resolve } from "node:path";
import type { Rule } from "../src/rules/types.js";
import type { ClassifiedTool, Effect } from "../src/types.js";
import { discover } from "../src/discover/index.js";
import { analyze } from "../src/scan.js";

export const VIRTUAL_ROOT = resolve("/virtual-project");

function sources(files: Record<string, string>) {
  return new Map(Object.entries(files).map(([name, text]) => [resolve(VIRTUAL_ROOT, name), text]));
}

export function discoverSources(files: Record<string, string>) {
  return discover({ root: VIRTUAL_ROOT, files: sources(files) }).tools;
}

export function analyzeSources(files: Record<string, string>) {
  return analyze({ root: VIRTUAL_ROOT, files: sources(files) });
}

export const fixture = (name: string) => resolve(import.meta.dirname, "..", "fixtures", name);

export function ruleHits(rule: Rule, files: Record<string, string>): Record<string, string | null> {
  return Object.fromEntries(analyzeSources(files).map((tool) => [tool.name, rule.check(tool)]));
}

export const register = (fields: string) => `document.modelContext.registerTool({ ${fields} });\n`;

export function fakeTool(overrides: Partial<ClassifiedTool> & { effect?: Effect }): ClassifiedTool {
  const { effect = "read", ...rest } = overrides;
  return {
    name: "tool",
    description: "A long enough description of the tool.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: null,
    related: [],
    confirms: false,
    autosubmit: false,
    source: "a.html:1",
    style: "declarative",
    file: "a.html",
    line: 1,
    apis: [],
    ignored: [],
    classification: { effect, bodyEffect: null, nameEffect: null, descriptionEffect: null, signals: [] },
    ...rest,
  };
}
