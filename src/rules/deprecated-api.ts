import type { Rule } from "./types.js";

export const deprecatedApi: Rule = {
  id: "deprecated-api",
  severity: "info",
  description: "The tool registers through navigator.modelContext only. The API moved to document.modelContext in 2026.",
  fix: "Register through document.modelContext and keep navigator.modelContext only as a fallback: const mc = document.modelContext ?? navigator.modelContext.",
  check(tool) {
    if (!tool.apis.includes("navigator") || tool.apis.includes("document")) return null;
    return `Tool "${tool.name}" uses navigator.modelContext with no document.modelContext fallback.`;
  },
};
