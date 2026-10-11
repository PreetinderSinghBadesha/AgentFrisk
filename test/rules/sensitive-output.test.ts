import { describe, expect, it } from "vitest";
import { isSensitiveField, sensitiveOutput } from "../../src/rules/sensitive-output.js";
import { register, ruleHits } from "../helpers.js";

const tool = (name: string, execute: string) => register(`name: "${name}", description: "d", execute: ${execute}`);

describe("sensitive-output", () => {
  it.each(["password", "passwordHash", "password_hash", "token", "accessToken", "secret", "clientSecret", "apiKey", "api_key", "ssn", "cardNumber", "card_number"])(
    "treats %s as sensitive",
    (name) => expect(isSensitiveField(name)).toBe(true),
  );

  it.each(["className", "lessons", "id", "email", "displayName", "cardholderName", "keyboard"])("treats %s as safe", (name) =>
    expect(isSensitiveField(name)).toBe(false),
  );

  it("flags returned objects with sensitive fields", () => {
    const hits = ruleHits(sensitiveOutput, {
      "a.ts":
        tool("direct", `async () => ({ id: 1, passwordHash: "x" })`) +
        tool("block", `async () => { const user = await db.find(); return { user: { email: user.email, apiKey: user.apiKey } }; }`) +
        tool("shorthand", `async () => { const token = mint(); return { token }; }`) +
        tool("local", `async () => { const result = { ssn: "1", name: "n" }; return result; }`) +
        tool("stringified", `async () => ({ content: [{ type: "text", text: JSON.stringify({ cardNumber: "4242" }) }] })`),
    });
    expect(hits).toEqual({
      direct: 'Tool "direct" returns sensitive fields to the agent: passwordHash.',
      block: 'Tool "block" returns sensitive fields to the agent: apiKey.',
      shorthand: 'Tool "shorthand" returns sensitive fields to the agent: token.',
      local: 'Tool "local" returns sensitive fields to the agent: ssn.',
      stringified: 'Tool "stringified" returns sensitive fields to the agent: cardNumber.',
    });
  });

  it("looks into functions the handler calls", () => {
    const hits = ruleHits(sensitiveOutput, {
      "user.ts": `export async function loadUser(id: string) { return { id, secret: "s" }; }`,
      "a.ts": `import { loadUser } from "./user";\n` + tool("indirect", `async ({ id }) => loadUser(id)`),
    });
    expect(hits).toEqual({ indirect: 'Tool "indirect" returns sensitive fields to the agent: secret.' });
  });

  it("ignores safe returns and sensitive fields that are only used, not returned", () => {
    const hits = ruleHits(sensitiveOutput, {
      "a.ts":
        tool("safe", `async () => ({ id: 1, email: "a@b.c" })`) +
        tool("used", `async ({ id }) => { const user = await db.find({ where: { id }, select: { passwordHash: true } }); return { ok: verify(user.passwordHash) }; }`),
    });
    expect(hits).toEqual({ safe: null, used: null });
  });
});
