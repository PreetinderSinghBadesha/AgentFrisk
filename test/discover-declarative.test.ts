import { describe, expect, it } from "vitest";
import { scan } from "../src/scan.js";
import { analyzeSources, discoverSources, fixture } from "./helpers.js";

describe("declarative HTML discovery", () => {
  it("reads toolname, tooldescription, toolautosubmit and field attributes", () => {
    const [tool] = discoverSources({
      "page.html": `<main>
<form toolname="book_table" tooldescription="Book a table at the restaurant." toolautosubmit>
  <input name="guests" type="number" required>
  <input name="name" maxlength="40" toolparamdescription="Guest name">
  <input name="phone" type="tel" pattern="[0-9 ]+">
  <input name="vip" type="checkbox">
  <input name="seating" type="radio" value="inside"><input name="seating" type="radio" value="outside">
  <select name="time"><option value="18:00">6pm</option><option>7pm</option></select>
  <textarea name="notes"></textarea>
  <input type="hidden" name="csrf" value="x">
  <button type="submit">Book</button>
</form>
</main>`,
    });
    expect(tool).toMatchObject({
      name: "book_table",
      description: "Book a table at the restaurant.",
      autosubmit: true,
      confirms: false,
      handler: null,
      style: "declarative",
      source: "page.html:2",
    });
    expect(tool.inputSchema).toEqual({
      type: "object",
      properties: {
        guests: { type: "number" },
        name: { type: "string", maxLength: 40, description: "Guest name" },
        phone: { type: "string", pattern: "[0-9 ]+" },
        vip: { type: "boolean" },
        seating: { type: "string", enum: ["inside", "outside"] },
        time: { type: "string", enum: ["18:00", "7pm"] },
        notes: { type: "string" },
      },
      required: ["guests"],
      additionalProperties: false,
    });
  });

  it("treats forms without toolautosubmit as confirmed by the user", () => {
    const [tool] = discoverSources({ "a.htm": `<form toolname="x" tooldescription="d"></form>` });
    expect(tool).toMatchObject({ autosubmit: false, confirms: true });
  });

  it("ignores forms without toolname", () => {
    expect(discoverSources({ "a.html": `<form action="/x"><input name="q"></form>` })).toEqual([]);
  });

  it("discovers imperative tools in inline scripts with HTML line numbers", () => {
    const tools = discoverSources({
      "a.html": `<html>\n<body>\n<script src="app.js"></script>\n<script>\n  navigator.modelContext.registerTool({ name: "inline", description: "d", execute() {} });\n</script>\n<script type="application/json">{"registerTool": 1}</script>\n</body></html>`,
    });
    expect(tools.map((t) => [t.name, t.source, t.style])).toEqual([["inline", "a.html:5", "imperative"]]);
  });

  it("supports HTML comment suppression", () => {
    const [tool] = discoverSources({
      "a.html": `<!-- agentfrisk-ignore autosubmit-write, loose-schema -->\n<form toolname="x" tooldescription="d" toolautosubmit></form>`,
    });
    expect(tool.ignored).toEqual(["autosubmit-write", "loose-schema"]);
  });
});

describe("declarative JSX discovery", () => {
  it("reads string, expression and boolean attributes", () => {
    const tools = discoverSources({
      "a.tsx": `
const NAME = "jsx_tool";
export const A = () => (
  <form toolname={NAME} tooldescription={"Search for things in the shop"} toolautosubmit={true}>
    <input name="q" maxLength={50} required={true} />
    <select name="sort">{["a", "b"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
  </form>
);
export const B = () => <form toolname="no_auto" tooldescription="d" toolautosubmit={false}><input name="x" /></form>;`,
    });
    expect(tools.map((t) => [t.name, t.description, t.autosubmit, t.source])).toEqual([
      ["jsx_tool", "Search for things in the shop", true, "a.tsx:4"],
      ["no_auto", "d", false, "a.tsx:9"],
    ]);
    expect(tools[0].inputSchema).toEqual({
      type: "object",
      properties: { q: { type: "string", maxLength: 50 }, sort: { type: "string", enum: [] } },
      required: ["q"],
      additionalProperties: false,
    });
  });

  it("uses onSubmit and action handlers and follows them", () => {
    const tools = analyzeSources({
      "actions.ts": `"use server";\nexport async function save(data: FormData) { await db.notes.create({ text: data.get("t") }); }`,
      "a.tsx": `
import { save } from "./actions";
export const A = () => <form toolname="save_note" tooldescription="d" action={save}><input name="t" /></form>;
export const B = () => <form toolname="get_x" tooldescription="d" onSubmit={async (e) => { await fetch("/x", { method: "DELETE" }); }} />;
export const C = () => <form toolname="plain" tooldescription="d" action="/submit" />;`,
    });
    expect(tools.map((t) => [t.name, t.handler !== null, t.classification.bodyEffect])).toEqual([
      ["save_note", true, "write"],
      ["get_x", true, "destructive"],
      ["plain", false, null],
    ]);
  });

  it("supports JSX comment suppression", () => {
    const [tool] = discoverSources({
      "a.tsx": `export const A = () => (\n  <div>\n    {/* agentfrisk-ignore */}\n    <form toolname="x" tooldescription="d" />\n  </div>\n);`,
    });
    expect(tool.ignored).toEqual(["*"]);
  });
});

describe("declarative fixture", () => {
  const dir = fixture("declarative");

  it("produces the exact findings for every tool", () => {
    const result = scan(dir, { root: dir });
    expect(
      Object.fromEntries(
        result.tools.map((r) => [r.tool.name, [r.tool.classification.effect, ...r.findings.map((f) => `${f.severity} ${f.ruleId}`)]]),
      ),
    ).toEqual({
      search_flights: ["read"],
      delete_booking: ["destructive", "error autosubmit-write"],
      contact_support: ["write", "warning missing-description"],
      send_feedback: ["write", "warning loose-schema"],
      get_page_info: ["read"],
      subscribe_newsletter: ["write", "error autosubmit-write"],
      find_stores: ["read"],
      view_order: ["destructive", "warning description-mismatch"],
      leave_note: ["read"],
    });
  });

  it("reports sources and messages", () => {
    const result = scan(dir, { root: dir });
    expect(result.findings.map((f) => [f.source, f.message])).toEqual([
      ["public/index.html:19", 'Form tool "delete_booking" has toolautosubmit and performs a destructive action without the user clicking submit.'],
      ["public/index.html:24", 'Tool "contact_support" has a 14-character description; use at least 15.'],
      ["public/index.html:33", 'Tool "send_feedback" accepts loosely validated input: string input "comments" has no maxLength, pattern, or enum.'],
      ["src/Newsletter.tsx:7", 'Form tool "subscribe_newsletter" has toolautosubmit and performs a write action without the user clicking submit.'],
      [
        "src/Newsletter.tsx:39",
        '"view_order" reads as read-only from its name and description, but its handler deletes data (fetch DELETE request).',
      ],
    ]);
  });
});
