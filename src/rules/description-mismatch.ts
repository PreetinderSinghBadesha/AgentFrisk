import type { Rule } from "./types.js";

export const descriptionMismatch: Rule = {
  id: "description-mismatch",
  severity: "warning",
  description: "The name or description says the tool only reads, but its handler writes or deletes data.",
  fix: "Rename the tool and rewrite its description to say what it changes, so agents and users know it has side effects.",
  check(tool) {
    const { bodyEffect, nameEffect, descriptionEffect, signals } = tool.classification;
    if (bodyEffect !== "write" && bodyEffect !== "destructive") return null;
    const sources = [nameEffect === "read" && "name", descriptionEffect === "read" && "description"].filter(Boolean);
    if (sources.length === 0) return null;
    const verb = bodyEffect === "destructive" ? "deletes" : "writes";
    return `"${tool.name}" reads as read-only from its ${sources.join(" and ")}, but its handler ${verb} data (${signals[0]}).`;
  },
};
