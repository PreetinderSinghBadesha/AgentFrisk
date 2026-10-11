import type { Config } from "../config.js";
import { ALL_RULES } from "../discover/suppress.js";
import type { ClassifiedTool, Finding, Severity, ToolReport } from "../types.js";
import { autosubmitWrite } from "./autosubmit-write.js";
import { descriptionMismatch } from "./description-mismatch.js";
import { deprecatedApi } from "./deprecated-api.js";
import { destructiveNoConfirm } from "./destructive-no-confirm.js";
import { looseSchema } from "./loose-schema.js";
import { missingDescription } from "./missing-description.js";
import { sensitiveOutput } from "./sensitive-output.js";
import type { Rule } from "./types.js";

export type { Rule } from "./types.js";

export const RULES: Rule[] = [
  destructiveNoConfirm,
  autosubmitWrite,
  descriptionMismatch,
  missingDescription,
  looseSchema,
  sensitiveOutput,
  deprecatedApi,
];

export const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

export function runRules(tools: ClassifiedTool[], config: Pick<Config, "rules">, rules: Rule[] = RULES): ToolReport[] {
  return tools.map((tool) => ({ tool, findings: toolFindings(tool, config, rules) }));
}

function toolFindings(tool: ClassifiedTool, config: Pick<Config, "rules">, rules: Rule[]): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rules) {
    const setting = config.rules[rule.id] ?? rule.severity;
    if (setting === "off" || tool.ignored.includes(rule.id) || tool.ignored.includes(ALL_RULES)) continue;
    const message = rule.check(tool);
    if (!message) continue;
    findings.push({
      ruleId: rule.id,
      severity: setting,
      message,
      fix: rule.fix,
      tool: tool.name,
      file: tool.file,
      line: tool.line,
      source: tool.source,
    });
  }
  return findings;
}
