import type { Rule } from "./types.js";

export const destructiveNoConfirm: Rule = {
  id: "destructive-no-confirm",
  severity: "error",
  description: "A destructive tool runs without ever asking the user to confirm.",
  fix: "Set annotations: { consequentialHint: true } so the browser asks the user before it runs, or confirm inside the handler with client.requestUserInteraction() or confirm().",
  check(tool) {
    if (tool.style === "declarative" || tool.classification.effect !== "destructive" || tool.confirms) return null;
    return `Destructive tool "${tool.name}" runs without asking the user to confirm.`;
  },
};
