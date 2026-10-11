import { describe, expect, it } from "vitest";
import { deprecatedApi } from "../../src/rules/deprecated-api.js";
import { ruleHits } from "../helpers.js";

describe("deprecated-api", () => {
  it("flags navigator.modelContext without a document.modelContext fallback", () => {
    const hits = ruleHits(deprecatedApi, {
      "a.js": `
navigator.modelContext.registerTool({ name: "legacy", description: "d", execute() {} });
const { modelContext } = window.navigator;
modelContext.registerTool({ name: "destructured", description: "d", execute() {} });`,
    });
    expect(hits).toEqual({
      legacy: 'Tool "legacy" uses navigator.modelContext with no document.modelContext fallback.',
      destructured: 'Tool "destructured" uses navigator.modelContext with no document.modelContext fallback.',
    });
  });

  it("accepts document.modelContext and fallbacks", () => {
    const hits = ruleHits(deprecatedApi, {
      "a.js": `
document.modelContext.registerTool({ name: "modern", description: "d", execute() {} });
const mc = document.modelContext || navigator.modelContext;
mc.registerTool({ name: "fallback", description: "d", execute() {} });`,
    });
    expect(hits).toEqual({ modern: null, fallback: null });
  });
});
