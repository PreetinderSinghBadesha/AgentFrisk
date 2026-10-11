import { describe, expect, it } from "vitest";
import { keywordEffect } from "../src/classify/keywords.js";
import { analyzeDir } from "../src/scan.js";
import { analyzeSources, fixture } from "./helpers.js";

function effectOf(execute: string, name = "do_thing", extra = "") {
  const [tool] = analyzeSources({
    "a.ts": `${extra}\ndocument.modelContext.registerTool({ name: "${name}", description: "Does a thing for the user.", execute: ${execute} });`,
  });
  return tool.classification;
}

describe("keyword classification", () => {
  it.each([
    ["delete_order", "destructive"],
    ["removeItem", "destructive"],
    ["cancel-booking", "destructive"],
    ["refundPayment", "destructive"],
    ["pay_invoice", "destructive"],
    ["chargeCard", "destructive"],
    ["transfer_funds", "destructive"],
    ["purgeCache", "destructive"],
    ["drop_table", "destructive"],
    ["reset_password", "destructive"],
    ["create_todo", "write"],
    ["addToCart", "write"],
    ["update_profile", "write"],
    ["saveDraft", "write"],
    ["send_message", "write"],
    ["submitForm", "write"],
    ["get_cart", "read"],
    ["listOrders", "read"],
    ["search_flights", "read"],
    ["findUser", "read"],
    ["view_invoice", "read"],
    ["rotate_keys", null],
  ])("%s -> %s", (name, effect) => {
    expect(keywordEffect(name)).toBe(effect);
  });

  it("handles inflections and picks the strongest keyword in a sentence", () => {
    expect(keywordEffect("Deletes the selected rows")).toBe("destructive");
    expect(keywordEffect("Cancelled orders are listed")).toBe("destructive");
    expect(keywordEffect("Gets the cart and updates totals")).toBe("write");
    expect(keywordEffect("Searching the catalog")).toBe("read");
    expect(keywordEffect(null)).toBeNull();
  });
});

describe("handler body classification", () => {
  it.each([
    ["async () => db.orders.delete({ where: { id: 1 } })", "destructive"],
    ["async () => prisma.user.deleteMany()", "destructive"],
    ["async () => Order.destroy({ where: {} })", "destructive"],
    ["async () => collection.remove({})", "destructive"],
    ["async () => knex('users').where({ id: 1 }).del()", "destructive"],
    ["async () => db.todos.update({ id: 1 })", "write"],
    ["async () => db.todos.insert({ id: 1 })", "write"],
    ["async () => db.todos.create({ id: 1 })", "write"],
    ["async () => sql`DELETE FROM users WHERE id = ${1}`", "destructive"],
    ["async () => db.query('DROP TABLE sessions')", "destructive"],
    ["async () => db.query('TRUNCATE audit_log')", "destructive"],
    ["async () => db.query(\"UPDATE users SET name = $1\")", "write"],
    ["async () => db.query(\"insert into users (name) values ($1)\")", "write"],
    ["async () => fetch('/api', { method: 'POST' })", "write"],
    ["async () => fetch('/api', { method: 'put' })", "write"],
    ["async () => window.fetch('/api', { method: 'PATCH' })", "write"],
    ["async () => fetch('/api', { method: 'DELETE' })", "destructive"],
    ["async () => axios.post('/api', {})", "write"],
    ["async () => axios.delete('/api/1')", "destructive"],
    ["async () => axios({ url: '/api', method: 'delete' })", "destructive"],
    ["async () => stripe.charges.create({ amount: 100 })", "destructive"],
    ["async () => stripe.refunds.create({ charge: 'ch_1' })", "destructive"],
    ["async () => stripe.transfers.create({ amount: 1 })", "destructive"],
    ["async () => stripe.paymentIntents.confirm('pi_1')", "destructive"],
  ])("%s -> %s", (execute, effect) => {
    expect(effectOf(execute).bodyEffect).toBe(effect);
  });

  it.each([
    "async () => fetch('/api')",
    "async () => fetch('/api', { method: 'GET' })",
    "async () => db.orders.findMany()",
    "async () => stripe.charges.retrieve('ch_1')",
    "async () => { const el = document.createElement('div'); el.removeAttribute('x'); new URLSearchParams().delete('a'); const seen = new Set(); seen.delete(1); }",
    "async () => 'Deleted from the list'",
  ])("no write signal: %s", (execute) => {
    expect(effectOf(execute).bodyEffect).toBeNull();
  });

  it("lets the handler body win over the name", () => {
    expect(effectOf("async () => db.items.delete({})", "get_items")).toMatchObject({
      effect: "destructive",
      bodyEffect: "destructive",
      nameEffect: "read",
    });
    expect(effectOf("async () => db.items.update({ deletedAt: new Date() })", "delete_item")).toMatchObject({
      effect: "write",
      nameEffect: "destructive",
    });
  });

  it("falls back to name and description keywords, then read", () => {
    expect(effectOf("async () => api.run()", "delete_item").effect).toBe("destructive");
    expect(effectOf("async () => api.run()", "rotate_keys").effect).toBe("read");
  });

  it("analyzes functions the handler calls, one level deep", () => {
    const [tool] = analyzeSources({
      "actions.ts": `export async function wipe(id: string) { await db.rows.delete({ id }); }`,
      "a.ts": `
import { wipe } from "./actions";
document.modelContext.registerTool({ name: "tidy", description: "Tidy up rows for the user.", execute: ({ id }) => wipe(id) });`,
    });
    expect(tool.classification).toMatchObject({ effect: "destructive", signals: ["db.rows.delete()"] });
  });

  it("classifies every imperative fixture tool", () => {
    const { tools } = analyzeDir(fixture("imperative"), { root: fixture("imperative") });
    expect(Object.fromEntries(tools.map((t) => [t.name, t.classification.effect]))).toEqual({
      list_products: "read",
      rotate_logs: "destructive",
      get_order_status: "read",
      delete_account: "destructive",
      cancel_subscription: "destructive",
      find_user: "read",
      search_notes: "write",
      add_tag: "write",
      update_profile: "write",
      get_feature_flags: "read",
    });
  });
});
