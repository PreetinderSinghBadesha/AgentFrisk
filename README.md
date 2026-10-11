# agentfrisk

A security linter for [WebMCP](https://webmachinelearning.github.io/webmcp/).

Websites are starting to expose actions to AI agents as WebMCP tools. agentfrisk reads your project's source code, finds every WebMCP tool it exposes, works out what each tool does, and flags the dangerous ones before they ship. Run it from the CLI or as a CI check that uploads results to GitHub code scanning.

```
$ npx agentfrisk scan

src/tools.ts
  get_order_status  read  imperative, line 5
    ✓ no findings
  delete_account  destructive  imperative, line 23
    error   destructive-no-confirm  Destructive tool "delete_account" runs without asking the user to confirm.
            fix: Set annotations: { consequentialHint: true } so the browser asks the user before it runs, ...

2 tools, 1 error, 0 warnings, 0 info
```

## What it finds

agentfrisk uses static analysis built on the TypeScript compiler API. It never runs your code and does not match JS/TS with regular expressions. It understands three ways of defining tools:

| Style | What is detected |
| --- | --- |
| **Imperative** | `document.modelContext.registerTool(...)` and the older `navigator.modelContext.registerTool(...)`, including `window.`/`globalThis.` prefixes, optional chaining, aliases such as `const mc = document.modelContext ?? navigator.modelContext`, destructuring such as `const { modelContext } = navigator`, and the legacy `provideContext({ tools: [...] })`. Tool objects, names, and schemas declared in other variables or imported from other files are resolved. |
| **Library** | [`nextjs-webmcp`](https://www.npmjs.com/package/nextjs-webmcp): `defineTools({ name: tool({...}) })`, array form, and standalone `tool()` calls. [`webmcp-react`](https://www.npmjs.com/package/webmcp-react): `useMcpTool({...})`. Calls are matched by their import source, so aliased and namespace imports work, and `tsconfig.json` `paths` (such as `@/`) are honoured. |
| **Declarative** | `<form toolname="..." tooldescription="...">` in JSX/TSX and in plain `.html` files, including `toolautosubmit` and per-field attributes (`name`, `type`, `maxlength`, `pattern`, `required`, `toolparamdescription`, `<select>` options). Imperative tools inside inline `<script>` blocks of HTML files are found too. |

Each tool is normalized to:

```ts
{ name, description, inputSchema, handler, confirms, autosubmit, source: "file:line", style }
```

Zod schemas (`z.object(...)`, `.strict()`, `.max()`, `.regex()`, `z.enum(...)` and so on) are converted to JSON Schema statically, the way `z.toJSONSchema` would convert them.

### Confirmation

WebMCP has no single "ask the user" call, so agentfrisk accepts any of the mechanisms a tool can use:

- `annotations: { consequentialHint: true }`: the current spec's signal that lets the browser or agent require user confirmation before the tool runs.
- `client.requestUserInteraction(...)` in the handler, from earlier drafts of the spec.
- `confirm(...)` or `window.confirm(...)` in the handler.
- Declarative forms without `toolautosubmit`: the agent only fills in the form, and the user has to click submit.

### Effect classification

Each tool is classified as `read`, `write`, or `destructive`:

1. **Handler body.** agentfrisk looks at the handler and follows each function it calls, one level deep and across imports, so a server action passed as `execute: addTodo` is analyzed too. It looks for:
   - DB calls: `.delete`, `.destroy`, `.remove`, `.del`, `.drop`, `.truncate` (destructive) and `.update`, `.insert`, `.create`, `.upsert`, `.save` (write), including names that start with those verbs, such as `deleteMany`.
   - Raw SQL: `DELETE FROM`, `DROP TABLE`, `TRUNCATE` (destructive) and `UPDATE ... SET`, `INSERT INTO` (write).
   - HTTP: `fetch` or `axios` with `POST`, `PUT`, or `PATCH` (write) and `DELETE` (destructive).
   - Payments: `stripe.charges`, `refunds`, `transfers`, `payouts`, and `paymentIntents` calls (destructive).
2. **Name and description keywords.** `delete`, `remove`, `cancel`, `refund`, `pay`, `charge`, `transfer`, `purge`, `drop`, `reset` → destructive. `create`, `add`, `update`, `save`, `send`, `submit` → write. `get`, `list`, `search`, `find`, `view` → read.

When the body and the name disagree, the body wins. A tool with no signals at all counts as `read`.

## Install

Requires Node.js 20.19 or later.

```bash
npm install --save-dev agentfrisk
```

You can also run it without installing:

```bash
npx agentfrisk scan
```

## Commands

```bash
npx agentfrisk scan [dir]
```

Discovers every tool under `dir` (default `.`) and prints a report grouped by file: each tool with its effect, followed by its findings and a suggested fix.

```bash
npx agentfrisk list [dir]
```

Prints just the discovered tools and their effects.

| Flag | Description |
| --- | --- |
| `--json` | Print machine-readable JSON (both commands). |
| `--sarif` | Print [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/) for GitHub code scanning (`scan` only). |
| `--fail-on <error\|warning\|info>` | Severity that fails the run. Default: `error`. |
| `--config <path>` | Use this config file instead of `<dir>/agentfrisk.config.json`. |
| `-h`, `--help` / `-v`, `--version` | Help and version. |

**Exit codes:**
- `scan` exits `1` when there are findings at or above `--fail-on` and `0` otherwise.
- `list` always exits `0`.
- Usage, config, and path errors exit `2`.

Paths are reported relative to the current directory when the scanned directory is inside it, which is what GitHub needs to place SARIF results on your files. Otherwise they are relative to the scanned directory.

## Rules

| Rule | Default | Summary |
| --- | --- | --- |
| [`destructive-no-confirm`](#destructive-no-confirm) | error | Destructive tool that never asks the user to confirm |
| [`autosubmit-write`](#autosubmit-write) | error | `toolautosubmit` form that writes or deletes |
| [`description-mismatch`](#description-mismatch) | warning | Name or description says read, handler writes or deletes |
| [`missing-description`](#missing-description) | warning | No description, or one under 15 characters |
| [`loose-schema`](#loose-schema) | warning | Missing schema, open objects, or unbounded strings |
| [`sensitive-output`](#sensitive-output) | warning | Handler returns passwords, tokens, secrets, and similar fields |
| [`deprecated-api`](#deprecated-api) | info | `navigator.modelContext` with no `document.modelContext` fallback |

### destructive-no-confirm

A destructive tool runs without ever asking the user to confirm. An agent that misreads a page, or that is steered by injected text, can delete data or move money in one call. This rule applies to imperative and library tools. Forms are covered by `autosubmit-write`.

```js
// Bad
document.modelContext.registerTool({
  name: "delete_account",
  description: "Permanently delete the signed-in user's account.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  execute: async () => db.users.delete({ where: { id: session.userId } }),
});

// Good
document.modelContext.registerTool({
  name: "delete_account",
  description: "Permanently delete the signed-in user's account.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { consequentialHint: true },
  execute: async () => db.users.delete({ where: { id: session.userId } }),
});
```

**Fix:** set `annotations: { consequentialHint: true }`, or confirm inside the handler with `client.requestUserInteraction()` or `confirm()`.

### autosubmit-write

A declarative form with `toolautosubmit` submits as soon as the agent calls it. That is fine for a search form, but a form that writes or deletes then runs without the user ever seeing it.

```html
<!-- Bad -->
<form toolname="delete_booking" tooldescription="Delete a booking by its reference." toolautosubmit method="post">
  <input name="reference" maxlength="8" required>
</form>

<!-- Good: the agent fills in the form and the user clicks submit -->
<form toolname="delete_booking" tooldescription="Delete a booking by its reference." method="post">
  <input name="reference" maxlength="8" required>
</form>
```

**Fix:** remove `toolautosubmit` from forms that change data.

### description-mismatch

The name or description says the tool only reads, but its handler writes or deletes. Agents and users decide what is safe to call from the name and description. A `search_notes` tool that archives notes misleads both of them.

```js
// Bad
registerTool({
  name: "search_notes",
  description: "Search the user's notes for a phrase.",
  execute: async ({ query }) => fetch("/api/notes/archive", { method: "POST", body: query }),
});

// Good
registerTool({
  name: "archive_matching_notes",
  description: "Archive every note that contains the phrase. This modifies the user's notes.",
  annotations: { consequentialHint: true },
  execute: async ({ query }) => fetch("/api/notes/archive", { method: "POST", body: query }),
});
```

**Fix:** rename the tool and rewrite its description so it says what the tool changes.

### missing-description

The tool has no description, or one shorter than 15 characters. Agents choose tools from their descriptions, so a vague one leads to wrong calls.

```js
// Bad
registerTool({ name: "add_tag", description: "Adds tag", /* ... */ });

// Good
registerTool({ name: "add_tag", description: "Add a tag to the note that is currently open.", /* ... */ });
```

**Fix:** say what the tool does, what it changes, and when an agent should use it.

### loose-schema

The tool's input is loosely validated. Agent input is untrusted input, and this rule flags three problems:
- a missing `inputSchema`
- an object without `additionalProperties: false`
- a string without `maxLength`, `pattern`, `enum`, or `const`

Strict formats such as `email`, `uuid`, and `date` count as bounded. `uri` does not.

```js
// Bad
inputSchema: {
  type: "object",
  properties: { bio: { type: "string" } },
}

// Good
inputSchema: {
  type: "object",
  properties: { bio: { type: "string", maxLength: 500 } },
  additionalProperties: false,
}
```

With Zod, `z.object()` and `z.strictObject()` count as closed. `z.looseObject()`, `.passthrough()`, and `.catchall()` count as open. Use `z.string().max(500)` and similar to bound strings. Form fields are bounded by `maxlength` or `pattern`, or by using a `<select>`.

**Fix:** declare an `inputSchema` with `additionalProperties: false` and bound every string.

### sensitive-output

The handler returns objects with fields such as `password`, `passwordHash`, `token`, `secret`, `apiKey`, `ssn`, or `cardNumber`. Whatever a tool returns goes into the model's context.

```js
// Bad
execute: async ({ email }) => {
  const user = await db.users.findUnique({ where: { email } });
  return { id: user.id, email: user.email, passwordHash: user.passwordHash };
}

// Good
execute: async ({ email }) => {
  const user = await db.users.findUnique({ where: { email } });
  return { id: user.id, email: user.email };
}
```

**Fix:** map records to a safe shape and return only the fields the agent needs.

### deprecated-api

The tool registers through `navigator.modelContext` only. In 2026 the API moved to `document.modelContext`.

```js
// Bad
navigator.modelContext.registerTool(tool);

// Good
const mc = document.modelContext ?? navigator.modelContext;
mc.registerTool(tool);
```

**Fix:** register through `document.modelContext`, and keep `navigator.modelContext` only as a fallback for older browsers.

## Configuration

Create `agentfrisk.config.json` in the directory you scan:

```json
{
  "rules": {
    "loose-schema": "error",
    "deprecated-api": "off"
  },
  "include": ["src/**/*.{ts,tsx}", "public/**/*.html"],
  "exclude": ["src/legacy/**", "**/*.stories.tsx"]
}
```

- `rules` overrides a rule's severity (`"error"`, `"warning"`, or `"info"`) or turns the rule off (`"off"`).
- `include` replaces the default file globs: `**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,html,htm}`.
- `exclude` adds to the default excludes: `node_modules`, `.git`, `dist`, `build`, `out`, `.next`, `coverage`, `**/*.d.ts`. A pattern without a `/` matches a file or folder name at any depth.

## Suppressing findings

Put `agentfrisk-ignore <rule-id>` in a comment on the line directly above a tool, meaning the `registerTool(` call, the `defineTools` key, the `useMcpTool(` call, or the `<form` tag. Separate several rule ids with spaces or commas. With no rule id, every rule is suppressed for that tool.

```js
// agentfrisk-ignore loose-schema
mc.registerTool({ name: "get_feature_flags", /* ... */ });
```

```tsx
{/* agentfrisk-ignore loose-schema, missing-description */}
<form toolname="leave_note" tooldescription="Leave a note">
```

```html
<!-- agentfrisk-ignore autosubmit-write -->
<form toolname="quick_add" tooldescription="Add an item to the shopping list" toolautosubmit>
```

## GitHub Actions

This workflow uploads findings to GitHub code scanning, where they appear as annotations on pull requests, and fails the job on errors:

```yaml
name: agentfrisk

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  security-events: write

jobs:
  webmcp-tools:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
      - name: Scan WebMCP tools
        run: npx --yes agentfrisk@0.1 scan . --sarif > agentfrisk.sarif
      - name: Upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v4
        with:
          sarif_file: agentfrisk.sarif
          category: agentfrisk
```

To fail on warnings too, add `--fail-on warning`. To report without failing the build, add `continue-on-error: true` to the scan step.

## Programmatic API

```ts
import { scan } from "agentfrisk";

const result = scan("./src");
for (const { tool, findings } of result.tools) {
  console.log(tool.name, tool.classification.effect, findings.map((f) => f.ruleId));
}
```

`formatJson`, `formatSarif`, `RULES`, and `runRules` are exported as well. Each rule is an object `{ id, severity, description, fix, check(tool) }`, and `check` returns a message or `null`. To add a rule, add one file to `src/rules/` and list it in `src/rules/index.ts`.

## Limitations

- The analysis is static. Tools registered from fully dynamic data, such as `tools.forEach((t) => mc.registerTool(t))` over a runtime array, are not found.
- Calls are followed one level deep from the handler. Code that is only reachable through deeper indirection is not classified.
- Effect detection is heuristic. Use inline suppression for false positives, and please report them.

## License

MIT
