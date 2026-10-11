import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv-draft-04";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli/run.js";
import { VERSION } from "../src/version.js";

function cli(...argv: string[]) {
  let stdout = "";
  let stderr = "";
  const code = run(argv, { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t), color: false });
  return { code, stdout, stderr };
}

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "agentfrisk-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

const SAFE_TOOL = `document.modelContext.registerTool({
  name: "get_time",
  description: "Get the current server time in ISO format.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  execute: async () => new Date().toISOString(),
});`;

const INFO_ONLY_TOOL = SAFE_TOOL.replace("document.modelContext", "navigator.modelContext");

const sarifSchema = JSON.parse(readFileSync(join(import.meta.dirname, "schemas", "sarif-schema-2.1.0.json"), "utf8"));
const ajv = new Ajv.default({ allErrors: true, strict: false });
addFormats.default(ajv);
const validateSarif = ajv.compile(sarifSchema);

describe("scan command", () => {
  it.each(["imperative", "nextjs-webmcp", "declarative"])("exits 1 on the %s fixture, which has errors", (name) => {
    expect(cli("scan", `fixtures/${name}`).code).toBe(1);
  });

  it("prints a report grouped by file with each tool, its effect and its findings", () => {
    const { stdout } = cli("scan", "fixtures/imperative");
    expect(stdout).toContain("fixtures/imperative/src/tools.ts\n  get_order_status  read  imperative, line 5\n    ✓ no findings\n");
    expect(stdout).toContain(
      '  delete_account  destructive  imperative, line 23\n    error   destructive-no-confirm  Destructive tool "delete_account" runs without asking the user to confirm.\n            fix: Set annotations',
    );
    expect(stdout.trimEnd().split("\n").at(-1)).toBe("10 tools, 1 error, 4 warnings, 2 info");
  });

  it("exits 0 when nothing reaches the --fail-on threshold", () => {
    const clean = project({ "app.js": SAFE_TOOL });
    const info = project({ "app.js": INFO_ONLY_TOOL });
    expect(cli("scan", clean)).toMatchObject({ code: 0 });
    expect(cli("scan", clean, "--fail-on", "info").code).toBe(0);
    expect(cli("scan", info).code).toBe(0);
    expect(cli("scan", info, "--fail-on", "warning").code).toBe(0);
    expect(cli("scan", info, "--fail-on", "info").code).toBe(1);
  });

  it("treats warnings according to --fail-on", () => {
    const warn = project({ "app.js": SAFE_TOOL.replace("Get the current server time in ISO format.", "Time") });
    expect(cli("scan", warn).code).toBe(0);
    expect(cli("scan", warn, "--fail-on", "warning").code).toBe(1);
    expect(cli("scan", warn, "--fail-on=info").code).toBe(1);
  });

  it("reads agentfrisk.config.json from the scanned directory and from --config", () => {
    const dir = project({
      "app.js": INFO_ONLY_TOOL,
      "agentfrisk.config.json": JSON.stringify({ rules: { "deprecated-api": "error" } }),
      "other.json": JSON.stringify({ rules: { "deprecated-api": "off" } }),
    });
    expect(cli("scan", dir).code).toBe(1);
    expect(cli("scan", dir, "--config", join(dir, "other.json")).code).toBe(0);
  });

  it("prints JSON with --json", () => {
    const { code, stdout } = cli("scan", "fixtures/nextjs-webmcp", "--json");
    const report = JSON.parse(stdout);
    expect(code).toBe(1);
    expect(report.version).toBe(VERSION);
    expect(report.summary).toEqual({ tools: 9, error: 1, warning: 4, info: 0 });
    expect(report.tools.find((t: { name: string }) => t.name === "delete_todo")).toMatchObject({
      effect: "destructive",
      style: "library",
      source: "fixtures/nextjs-webmcp/app/tools.tsx:21",
      confirms: false,
      findings: [{ ruleId: "destructive-no-confirm", severity: "error" }],
    });
  });

  it.each([
    ["imperative", 7],
    ["nextjs-webmcp", 5],
    ["declarative", 5],
  ])("prints SARIF that validates against the 2.1.0 schema (%s)", (name, count) => {
    const { stdout } = cli("scan", `fixtures/${name}`, "--sarif");
    const sarif = JSON.parse(stdout);
    const valid = validateSarif(sarif);
    expect(validateSarif.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
    expect(sarif.runs[0].results).toHaveLength(count);
  });

  it("uses a validator that rejects invalid SARIF", () => {
    expect(validateSarif({ version: "2.1.0", runs: [{ results: [] }] })).toBe(false);
    expect(validateSarif({ version: "2.0.0", runs: [] })).toBe(false);
  });

  it("maps findings to SARIF results with rule metadata and locations", () => {
    const sarif = JSON.parse(cli("scan", "fixtures/imperative", "--sarif").stdout);
    const run = sarif.runs[0];
    expect(run.tool.driver.rules.map((r: { id: string }) => r.id)).toEqual([
      "destructive-no-confirm",
      "autosubmit-write",
      "description-mismatch",
      "missing-description",
      "loose-schema",
      "sensitive-output",
      "deprecated-api",
    ]);
    const result = run.results.find((r: { ruleId: string }) => r.ruleId === "destructive-no-confirm");
    expect(result).toMatchObject({
      ruleIndex: 0,
      level: "error",
      locations: [{ physicalLocation: { artifactLocation: { uri: "fixtures/imperative/src/tools.ts" }, region: { startLine: 23 } } }],
    });
    expect(run.results.filter((r: { level: string }) => r.level === "note")).toHaveLength(2);
  });
});

describe("list command", () => {
  it("prints the discovered tools and their effects", () => {
    const { code, stdout } = cli("list", "fixtures/declarative");
    expect(code).toBe(0);
    expect(stdout).toContain("fixtures/declarative/public/index.html\n");
    expect(stdout).toMatch(/\s19 {2}delete_booking\s+destructive declarative\n/);
    expect(stdout).toMatch(/\s40 {2}get_page_info\s+read\s+imperative\n/);
    expect(stdout).toContain("9 tools found.");
  });

  it("prints JSON with --json and exits 0 even when tools are dangerous", () => {
    const { code, stdout } = cli("list", "fixtures/imperative", "--json");
    const report = JSON.parse(stdout);
    expect(code).toBe(0);
    expect(report.tools.map((t: { name: string; effect: string }) => `${t.name}:${t.effect}`)).toEqual([
      "list_products:read",
      "rotate_logs:destructive",
      "get_order_status:read",
      "delete_account:destructive",
      "cancel_subscription:destructive",
      "find_user:read",
      "search_notes:write",
      "add_tag:write",
      "update_profile:write",
      "get_feature_flags:read",
    ]);
  });

  it("says so when there are no tools", () => {
    const dir = project({ "app.js": "export const x = 1;" });
    expect(cli("list", dir)).toMatchObject({ code: 0, stdout: "No WebMCP tools found.\n" });
    expect(cli("scan", dir)).toMatchObject({ code: 0, stdout: "No WebMCP tools found.\n" });
  });
});

describe("usage errors", () => {
  it.each([
    [[], "missing command"],
    [["lint"], 'unknown command "lint"'],
    [["scan", ".", "extra"], "unexpected arguments: extra"],
    [["scan", "--fail-on", "fatal"], '--fail-on must be error, warning, or info (got "fatal")'],
    [["scan", "--json", "--sarif"], "--json and --sarif cannot be combined"],
    [["list", "--sarif"], "--sarif is only available for scan"],
    [["scan", "--nope"], "Unknown option '--nope'"],
  ])("exits 2 for %j", (argv, message) => {
    const { code, stderr } = cli(...argv);
    expect(code).toBe(2);
    expect(stderr).toContain(message);
  });

  it("exits 2 for a missing directory or broken config", () => {
    expect(cli("scan", "does/not/exist")).toMatchObject({ code: 2, stderr: "agentfrisk: Not a directory: does/not/exist\n" });
    const dir = project({ "agentfrisk.config.json": '{ "rules": { "loose-schema": "loud" } }' });
    expect(cli("scan", dir)).toMatchObject({ code: 2, stderr: 'agentfrisk: Rule "loose-schema" must be one of: error, warning, info, off\n' });
  });

  it("prints help and version", () => {
    expect(cli("--help")).toMatchObject({ code: 0, stdout: expect.stringContaining("Usage: agentfrisk") });
    expect(cli("-v")).toMatchObject({ code: 0, stdout: `${VERSION}\n` });
  });
});
