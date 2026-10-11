import type { Rule } from "./types.js";

export const autosubmitWrite: Rule = {
  id: "autosubmit-write",
  severity: "error",
  description: "A declarative form tool with toolautosubmit changes data, so an agent can submit it without the user clicking.",
  fix: "Remove toolautosubmit so the agent only fills in the form and the user reviews it and clicks submit.",
  check(tool) {
    const { effect } = tool.classification;
    if (tool.style !== "declarative" || !tool.autosubmit || effect === "read") return null;
    return `Form tool "${tool.name}" has toolautosubmit and performs a ${effect} action without the user clicking submit.`;
  },
};
