import type { Rule } from "./types.js";

const MIN_DESCRIPTION_LENGTH = 15;

export const missingDescription: Rule = {
  id: "missing-description",
  severity: "warning",
  description: `The tool has no description, or one shorter than ${MIN_DESCRIPTION_LENGTH} characters, so agents have to guess what it does.`,
  fix: "Write a description that says what the tool does, what it changes, and when an agent should use it.",
  check(tool) {
    const description = tool.description?.trim() ?? "";
    if (description.length >= MIN_DESCRIPTION_LENGTH) return null;
    if (!description) return `Tool "${tool.name}" has no description.`;
    return `Tool "${tool.name}" has a ${description.length}-character description; use at least ${MIN_DESCRIPTION_LENGTH}.`;
  },
};
