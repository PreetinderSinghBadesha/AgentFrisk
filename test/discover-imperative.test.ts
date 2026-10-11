import { describe, expect, it } from "vitest";
import { analyzeDir } from "../src/scan.js";
import { discoverSources, fixture } from "./helpers.js";

describe("imperative discovery", () => {
  it("finds document.modelContext.registerTool with all fields", () => {
    const [tool] = discoverSources({
      "a.ts": `
document.modelContext.registerTool({
  name: "get_cart",
  description: "Return the items currently in the cart.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  execute: async () => "[]",
});`,
    });
    expect(tool).toMatchObject({
      name: "get_cart",
      description: "Return the items currently in the cart.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      confirms: false,
      autosubmit: false,
      source: "a.ts:2",
      style: "imperative",
      apis: ["document"],
    });
    expect(tool.handler).not.toBeNull();
  });

  it("finds navigator.modelContext and window-qualified references", () => {
    const tools = discoverSources({
      "a.js": `
navigator.modelContext.registerTool({ name: "a", description: "d", execute() {} });
window.navigator.modelContext.registerTool({ name: "b", description: "d", execute() {} });
window.document.modelContext?.registerTool({ name: "c", description: "d", execute() {} });`,
    });
    expect(tools.map((t) => [t.name, t.apis])).toEqual([
      ["a", ["navigator"]],
      ["b", ["navigator"]],
      ["c", ["document"]],
    ]);
  });

  it("follows aliased model context references", () => {
    const tools = discoverSources({
      "a.ts": `
const mc = document.modelContext ?? navigator.modelContext;
const alias = mc;
const { modelContext } = navigator;
const ctx = "modelContext" in document ? document.modelContext : navigator.modelContext;
mc.registerTool({ name: "one", description: "d", execute() {} });
alias.registerTool({ name: "two", description: "d", execute() {} });
modelContext.registerTool({ name: "three", description: "d", execute() {} });
ctx.registerTool({ name: "four", description: "d", execute() {} });`,
    });
    expect(tools.map((t) => [t.name, t.apis])).toEqual([
      ["one", ["document", "navigator"]],
      ["two", ["document", "navigator"]],
      ["three", ["navigator"]],
      ["four", ["document", "navigator"]],
    ]);
  });

  it("resolves tool objects, names and schemas declared elsewhere", () => {
    const [tool] = discoverSources({
      "schema.ts": `export const schema = { type: "object", properties: { q: { type: "string", maxLength: 10 } } } as const;`,
      "a.ts": `
import { schema } from "./schema";
const NAME = "search";
const tool = { name: NAME, description: \`Search \${"items"} by keyword\`, inputSchema: schema, execute: run };
function run() { return "x"; }
document.modelContext.registerTool(tool);`,
    });
    expect(tool).toMatchObject({
      name: "search",
      description: "Search items by keyword",
      inputSchema: { type: "object", properties: { q: { type: "string", maxLength: 10 } } },
    });
    expect(tool.handler?.getText()).toContain("function run");
  });

  it("ignores registerTool on unrelated objects", () => {
    expect(discoverSources({ "a.ts": `registry.registerTool({ name: "x" }); const modelContext = {}; modelContext.registerTool({ name: "y" });` })).toEqual([]);
  });

  it("supports the legacy provideContext tools array", () => {
    const tools = discoverSources({
      "a.js": `navigator.modelContext.provideContext({ tools: [{ name: "a", description: "d", execute() {} }, { name: "b", description: "d", execute() {} }] });`,
    });
    expect(tools.map((t) => t.name)).toEqual(["a", "b"]);
  });

  it("follows called functions one level deep across imports", () => {
    const [tool] = discoverSources({
      "db.ts": `export async function removeUser(id: string) { return sql\`DELETE FROM users WHERE id = \${id}\`; }`,
      "a.ts": `
import { removeUser } from "./db";
document.modelContext.registerTool({ name: "x", description: "d", execute: ({ id }) => removeUser(id) });`,
    });
    expect(tool.related.map((n) => n.getText())).toEqual([expect.stringContaining("DELETE FROM users")]);
  });

  it("detects confirmation via consequentialHint, requestUserInteraction and confirm()", () => {
    const tools = discoverSources({
      "a.ts": `
const ann = { consequentialHint: true };
document.modelContext.registerTool({ name: "hint", description: "d", annotations: { consequentialHint: true }, execute() {} });
document.modelContext.registerTool({ name: "hintref", description: "d", annotations: ann, execute() {} });
document.modelContext.registerTool({ name: "client", description: "d", execute(i, client) { return client.requestUserInteraction(() => 1); } });
document.modelContext.registerTool({ name: "confirm", description: "d", execute() { if (!confirm("sure?")) return; } });
document.modelContext.registerTool({ name: "falsehint", description: "d", annotations: { consequentialHint: false }, execute() {} });
document.modelContext.registerTool({ name: "other", description: "d", execute() { dialog.confirm(); } });`,
    });
    expect(Object.fromEntries(tools.map((t) => [t.name, t.confirms]))).toEqual({
      hint: true,
      hintref: true,
      client: true,
      confirm: true,
      falsehint: false,
      other: false,
    });
  });

  it("discovers every tool in the imperative fixture", () => {
    const { tools } = analyzeDir(fixture("imperative"), { root: fixture("imperative") });
    expect(tools.map((t) => [t.name, t.source, t.apis.join("+"), t.confirms])).toEqual([
      ["list_products", "src/legacy.js:10", "navigator", false],
      ["rotate_logs", "src/legacy.js:21", "navigator", true],
      ["get_order_status", "src/tools.ts:5", "document+navigator", false],
      ["delete_account", "src/tools.ts:23", "document+navigator", false],
      ["cancel_subscription", "src/tools.ts:35", "document+navigator", true],
      ["find_user", "src/tools.ts:50", "document+navigator", false],
      ["search_notes", "src/tools.ts:65", "document+navigator", false],
      ["add_tag", "src/tools.ts:80", "document+navigator", false],
      ["update_profile", "src/tools.ts:95", "document+navigator", false],
      ["get_feature_flags", "src/tools.ts:112", "document+navigator", false],
    ]);
  });
});
