import { describe, expect, it } from "vitest";
import { destructiveNoConfirm } from "../../src/rules/destructive-no-confirm.js";
import { register, ruleHits } from "../helpers.js";

describe("destructive-no-confirm", () => {
  it("flags destructive tools that never confirm", () => {
    const hits = ruleHits(destructiveNoConfirm, {
      "a.ts":
        register(`name: "delete_order", description: "Delete an order", execute: async ({ id }) => db.orders.delete({ id })`) +
        register(`name: "wipe", description: "Tidy the workspace", execute: async () => fetch("/api/all", { method: "DELETE" })`),
    });
    expect(hits).toEqual({
      delete_order: 'Destructive tool "delete_order" runs without asking the user to confirm.',
      wipe: 'Destructive tool "wipe" runs without asking the user to confirm.',
    });
  });

  it("accepts consequentialHint, requestUserInteraction and confirm()", () => {
    const hits = ruleHits(destructiveNoConfirm, {
      "a.ts":
        register(`name: "a_delete", description: "d", annotations: { consequentialHint: true }, execute: async () => db.x.delete()`) +
        register(`name: "b_delete", description: "d", execute: async (i, client) => { await client.requestUserInteraction(() => true); return db.x.delete(); }`) +
        register(`name: "c_delete", description: "d", execute: async () => { if (window.confirm("Sure?")) await db.x.delete(); }`),
    });
    expect(hits).toEqual({ a_delete: null, b_delete: null, c_delete: null });
  });

  it("ignores read and write tools", () => {
    const hits = ruleHits(destructiveNoConfirm, {
      "a.ts":
        register(`name: "get_order", description: "d", execute: async () => db.orders.findFirst()`) +
        register(`name: "save_order", description: "d", execute: async () => db.orders.update({})`),
    });
    expect(hits).toEqual({ get_order: null, save_order: null });
  });
});
