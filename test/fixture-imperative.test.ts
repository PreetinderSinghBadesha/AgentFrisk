import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config.js";
import { scan } from "../src/scan.js";
import { fixture } from "./helpers.js";

const dir = fixture("imperative");
const findingsByTool = (result: ReturnType<typeof scan>) =>
  Object.fromEntries(result.tools.map((r) => [r.tool.name, r.findings.map((f) => `${f.severity} ${f.ruleId}`)]));

describe("imperative fixture", () => {
  it("produces the exact findings for every tool", () => {
    expect(findingsByTool(scan(dir, { root: dir }))).toEqual({
      list_products: ["info deprecated-api"],
      rotate_logs: ["info deprecated-api"],
      get_order_status: [],
      delete_account: ["error destructive-no-confirm"],
      cancel_subscription: [],
      find_user: ["warning sensitive-output"],
      search_notes: ["warning description-mismatch"],
      add_tag: ["warning missing-description"],
      update_profile: ["warning loose-schema"],
      get_feature_flags: [],
    });
  });

  it("reports full finding details", () => {
    const result = scan(dir, { root: dir });
    expect(result.findings.find((f) => f.ruleId === "destructive-no-confirm")).toEqual({
      ruleId: "destructive-no-confirm",
      severity: "error",
      message: 'Destructive tool "delete_account" runs without asking the user to confirm.',
      fix: expect.stringContaining("consequentialHint"),
      tool: "delete_account",
      file: "src/tools.ts",
      line: 23,
      source: "src/tools.ts:23",
    });
    expect(result.findings.find((f) => f.ruleId === "loose-schema")?.message).toBe(
      'Tool "update_profile" accepts loosely validated input: additionalProperties is not false on the root object; string input "bio" has no maxLength, pattern, or enum.',
    );
    expect(result.findings.find((f) => f.ruleId === "sensitive-output")?.message).toBe(
      'Tool "find_user" returns sensitive fields to the agent: passwordHash.',
    );
  });

  it("applies severity overrides and turns rules off", () => {
    const config = resolveConfig({ rules: { "deprecated-api": "off", "loose-schema": "error" } });
    const result = findingsByTool(scan(dir, { root: dir, config }));
    expect(result.list_products).toEqual([]);
    expect(result.update_profile).toEqual(["error loose-schema"]);
  });

  it("honours inline suppression comments", () => {
    const config = resolveConfig({});
    const result = scan(dir, { root: dir, config });
    const flags = result.tools.find((r) => r.tool.name === "get_feature_flags");
    expect(flags?.tool.ignored).toEqual(["loose-schema"]);
    expect(flags?.findings).toEqual([]);
  });

  it("respects exclude globs from config", () => {
    const config = resolveConfig({ exclude: ["src/legacy.js"] });
    expect(scan(dir, { root: dir, config }).tools.map((r) => r.tool.name)).not.toContain("list_products");
  });
});
