import { describe, expect, it } from "vitest";
import { scan } from "../src/scan.js";
import { analyzeSources, discoverSources, fixture } from "./helpers.js";

describe("nextjs-webmcp discovery", () => {
  it("names tools after their defineTools keys and reads tool() definitions", () => {
    const tools = discoverSources({
      "a.tsx": `
import { defineTools, tool } from "nextjs-webmcp";
import { z } from "zod";
const shared = tool({ description: "Shared tool description", input: z.object({}), execute: async () => 1 });
export const tools = defineTools({
  first: tool({ description: "First tool description", input: z.object({ q: z.string().max(5) }), execute: async () => 1 }),
  shared,
  plain: { description: "Plain object definition", execute: async () => 1 },
});`,
    });
    expect(tools.map((t) => [t.name, t.source, t.style])).toEqual([
      ["first", "a.tsx:6", "library"],
      ["shared", "a.tsx:7", "library"],
      ["plain", "a.tsx:8", "library"],
    ]);
    expect(tools[0].inputSchema).toEqual({
      type: "object",
      properties: { q: { type: "string", maxLength: 5 } },
      required: ["q"],
      additionalProperties: false,
    });
  });

  it("supports aliased and namespace imports, arrays and standalone tool() calls", () => {
    const tools = discoverSources({
      "a.tsx": `
import * as webmcp from "nextjs-webmcp";
import { tool as t } from "nextjs-webmcp";
export const a = webmcp.defineTools([t({ name: "from_array", description: "d", execute: async () => 1 })]);
export const b = t({ name: "standalone", description: "d", execute: async () => 1 });`,
    });
    expect(tools.map((x) => x.name)).toEqual(["from_array", "standalone"]);
  });

  it("does not count a tool() referenced from another file twice", () => {
    const tools = discoverSources({
      "defs.ts": `import { tool } from "nextjs-webmcp";\nexport const search = tool({ description: "Search things", execute: async () => 1 });`,
      "tools.ts": `import { defineTools } from "nextjs-webmcp";\nimport { search } from "./defs";\nexport const tools = defineTools({ search_things: search });`,
    });
    expect(tools.map((x) => [x.name, x.source])).toEqual([["search_things", "tools.ts:3"]]);
  });

  it("ignores defineTools and tool from other packages", () => {
    expect(discoverSources({ "a.ts": `import { defineTools, tool } from "other";\ndefineTools({ x: tool({ description: "d" }) });` })).toEqual([]);
  });

  it("follows server actions wrapped in toolAction", () => {
    const [tool] = analyzeSources({
      "actions.ts": `"use server";\nimport { toolAction } from "nextjs-webmcp/server";\nexport const removeTodo = toolAction(schema, ({ id }) => db.todos.delete({ where: { id } }));`,
      "tools.ts": `import { defineTools, tool } from "nextjs-webmcp";\nimport { removeTodo } from "./actions";\ndefineTools({ tidy: tool({ description: "Tidy up the list", execute: removeTodo }) });`,
    });
    expect(tool.classification).toMatchObject({ effect: "destructive", signals: ["db.todos.delete()"] });
  });
});

describe("webmcp-react discovery", () => {
  it("finds useMcpTool calls with zod input or JSON inputSchema", () => {
    const tools = discoverSources({
      "a.tsx": `
import { useMcpTool } from "webmcp-react";
import { z } from "zod";
export function Tools() {
  useMcpTool({ name: "zod_tool", description: "d", input: z.object({ id: z.string().optional() }), handler: async () => 1 });
  useMcpTool({ name: "json_tool", description: "d", inputSchema: { type: "object", properties: {} }, handler: async () => 1 });
  return null;
}`,
    });
    expect(tools.map((t) => [t.name, t.inputSchema])).toEqual([
      ["zod_tool", { type: "object", properties: { id: { type: "string" } }, required: [], additionalProperties: false }],
      ["json_tool", { type: "object", properties: {} }],
    ]);
    expect(tools.every((t) => t.handler !== null && t.style === "library")).toBe(true);
  });

  it("ignores useMcpTool from other packages", () => {
    expect(discoverSources({ "a.tsx": `import { useMcpTool } from "./local";\nuseMcpTool({ name: "x", description: "d" });` })).toEqual([]);
  });
});

describe("nextjs-webmcp fixture", () => {
  const dir = fixture("nextjs-webmcp");

  it("produces the exact findings for every tool", () => {
    const result = scan(dir, { root: dir });
    expect(
      Object.fromEntries(
        result.tools.map((r) => [r.tool.name, [r.tool.classification.effect, ...r.findings.map((f) => `${f.severity} ${f.ruleId}`)]]),
      ),
    ).toEqual({
      search_catalog: ["read"],
      get_account: ["read", "warning sensitive-output"],
      set_theme: ["read", "warning loose-schema"],
      view_invoice: ["write", "warning description-mismatch"],
      list_todos: ["read"],
      add_todo: ["write"],
      delete_todo: ["destructive", "error destructive-no-confirm"],
      refund_order: ["destructive"],
      get_todo: ["read", "warning missing-description"],
    });
  });

  it("reports sources and messages", () => {
    const result = scan(dir, { root: dir });
    expect(result.findings.map((f) => [f.source, f.message])).toEqual([
      ["app/account/AccountTools.tsx:19", 'Tool "get_account" returns sensitive fields to the agent: apiKey.'],
      ["app/account/AccountTools.tsx:29", 'Tool "set_theme" accepts loosely validated input: string input "theme" has no maxLength, pattern, or enum.'],
      [
        "app/account/AccountTools.tsx:39",
        '"view_invoice" reads as read-only from its name and description, but its handler writes data (db.invoices.update()).',
      ],
      ["app/tools.tsx:21", 'Destructive tool "delete_todo" runs without asking the user to confirm.'],
      ["app/tools.tsx:32", 'Tool "get_todo" has a 8-character description; use at least 15.'],
    ]);
  });
});
