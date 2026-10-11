import { describe, expect, it } from "vitest";
import { descriptionMismatch } from "../../src/rules/description-mismatch.js";
import { register, ruleHits } from "../helpers.js";

describe("description-mismatch", () => {
  it("flags read-sounding tools whose handler writes or deletes", () => {
    const hits = ruleHits(descriptionMismatch, {
      "a.ts":
        register(`name: "get_report", description: "Build the monthly report", execute: async () => fetch("/api/report", { method: "POST" })`) +
        register(`name: "tidy", description: "List the stale sessions", execute: async () => db.sessions.deleteMany()`) +
        register(`name: "search_users", description: "Search users by name", execute: async () => db.users.update({})`),
    });
    expect(hits).toEqual({
      get_report: '"get_report" reads as read-only from its name, but its handler writes data (fetch POST request).',
      tidy: '"tidy" reads as read-only from its description, but its handler deletes data (db.sessions.deleteMany()).',
      search_users: '"search_users" reads as read-only from its name and description, but its handler writes data (db.users.update()).',
    });
  });

  it("does not flag honest tools or tools without body evidence", () => {
    const hits = ruleHits(descriptionMismatch, {
      "a.ts":
        register(`name: "get_cart", description: "Get the cart", execute: async () => fetch("/api/cart")`) +
        register(`name: "update_cart", description: "Update the cart", execute: async () => db.cart.update({})`) +
        register(`name: "list_then_save", description: "List items and save a snapshot", execute: async () => db.snapshots.create({})`) +
        register(`name: "view_page", description: "View a page", execute: async () => api.run()`),
    });
    expect(hits).toEqual({ get_cart: null, update_cart: null, list_then_save: null, view_page: null });
  });
});
