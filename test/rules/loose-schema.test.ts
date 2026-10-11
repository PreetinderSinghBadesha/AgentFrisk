import { describe, expect, it } from "vitest";
import { looseSchema } from "../../src/rules/loose-schema.js";
import { register, ruleHits } from "../helpers.js";

const tool = (name: string, schema: string) => register(`name: "${name}", description: "d", inputSchema: ${schema}, execute() {}`);

describe("loose-schema", () => {
  it("flags missing schemas, open objects and unbounded strings", () => {
    const hits = ruleHits(looseSchema, {
      "a.ts":
        register(`name: "none", description: "d", execute() {}`) +
        tool("open", `{ type: "object", properties: { id: { type: "integer" } } }`) +
        tool("strings", `{ type: "object", additionalProperties: false, properties: { bio: { type: "string" }, site: { type: "string", format: "uri" } } }`) +
        tool("nested", `{ type: "object", additionalProperties: false, properties: { address: { type: "object", properties: { street: { type: "string" } } }, tags: { type: "array", items: { type: "string" } } } }`) +
        tool("explicit_true", `{ type: "object", additionalProperties: true, properties: {} }`),
    });
    expect(hits).toEqual({
      none: 'Tool "none" accepts loosely validated input: no inputSchema.',
      open: 'Tool "open" accepts loosely validated input: additionalProperties is not false on the root object.',
      strings: 'Tool "strings" accepts loosely validated input: string inputs "bio", "site" have no maxLength, pattern, or enum.',
      nested: 'Tool "nested" accepts loosely validated input: additionalProperties is not false on "address"; string inputs "address.street", "tags[]" have no maxLength, pattern, or enum.',
      explicit_true: 'Tool "explicit_true" accepts loosely validated input: additionalProperties is not false on the root object.',
    });
  });

  it("accepts closed schemas with bounded strings", () => {
    const hits = ruleHits(looseSchema, {
      "a.ts": tool(
        "tight",
        `{ type: "object", additionalProperties: false, properties: {
          a: { type: "string", maxLength: 10 },
          b: { type: "string", pattern: "^x$" },
          c: { type: "string", enum: ["x", "y"] },
          d: { type: "string", format: "email" },
          e: { type: "string", const: "fixed" },
          f: { type: "number" },
          g: { type: "array", items: { type: "string", maxLength: 5 } }
        } }`,
      ),
    });
    expect(hits).toEqual({ tight: null });
  });

  it("reads zod schemas passed through z.toJSONSchema", () => {
    const hits = ruleHits(looseSchema, {
      "a.ts":
        `import { z } from "zod";\n` +
        tool("zod_ok", `z.toJSONSchema(z.object({ q: z.string().max(100), n: z.number().optional(), kind: z.enum(["a", "b"]), mail: z.email() }))`) +
        tool("zod_loose", `z.toJSONSchema(z.looseObject({ q: z.string().min(1) }))`) +
        tool("zod_passthrough", `z.toJSONSchema(z.object({ q: z.string().regex(/x/) }).passthrough())`),
    });
    expect(hits).toEqual({
      zod_ok: null,
      zod_loose: 'Tool "zod_loose" accepts loosely validated input: additionalProperties is not false on the root object; string input "q" has no maxLength, pattern, or enum.',
      zod_passthrough: 'Tool "zod_passthrough" accepts loosely validated input: additionalProperties is not false on the root object.',
    });
  });

  it("does not guess about schemas it cannot resolve", () => {
    const hits = ruleHits(looseSchema, {
      "a.ts": `import { schema } from "some-package";\n` + tool("opaque", "schema"),
    });
    expect(hits).toEqual({ opaque: null });
  });
});
