import { describe, expect, it } from "vitest";
import { missingDescription } from "../../src/rules/missing-description.js";
import { register, ruleHits } from "../helpers.js";

describe("missing-description", () => {
  it("flags missing, empty and short descriptions", () => {
    const hits = ruleHits(missingDescription, {
      "a.ts":
        register(`name: "none", execute() {}`) +
        register(`name: "empty", description: "   ", execute() {}`) +
        register(`name: "short", description: "Adds tag", execute() {}`) +
        register(`name: "fourteen", description: "Send a message", execute() {}`),
    });
    expect(hits).toEqual({
      none: 'Tool "none" has no description.',
      empty: 'Tool "empty" has no description.',
      short: 'Tool "short" has a 8-character description; use at least 15.',
      fourteen: 'Tool "fourteen" has a 14-character description; use at least 15.',
    });
  });

  it("accepts descriptions of 15 characters or more", () => {
    const hits = ruleHits(missingDescription, {
      "a.ts":
        register(`name: "exact", description: "Send a message!", execute() {}`) +
        register(`name: "long", description: "Return the items currently in the cart.", execute() {}`),
    });
    expect(hits).toEqual({ exact: null, long: null });
  });
});
