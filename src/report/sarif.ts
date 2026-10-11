import { RULES, type Rule } from "../rules/index.js";
import type { ScanResult, Severity } from "../types.js";
import { VERSION } from "../version.js";

const LEVELS: Record<Severity, "error" | "warning" | "note"> = { error: "error", warning: "warning", info: "note" };
const SECURITY_SEVERITY: Record<Severity, string> = { error: "8.0", warning: "5.0", info: "2.0" };

function pascalCase(id: string): string {
  return id.replace(/(^|-)([a-z])/g, (_, __, letter: string) => letter.toUpperCase());
}

function ruleDescriptor(rule: Rule) {
  return {
    id: rule.id,
    name: pascalCase(rule.id),
    shortDescription: { text: rule.description },
    fullDescription: { text: rule.description },
    help: { text: rule.fix, markdown: `**Fix:** ${rule.fix}` },
    helpUri: `https://www.npmjs.com/package/agentfrisk#${rule.id}`,
    defaultConfiguration: { level: LEVELS[rule.severity] },
    properties: {
      tags: ["security", "webmcp", "ai-agents"],
      "security-severity": SECURITY_SEVERITY[rule.severity],
    },
  };
}

export function toSarif(result: ScanResult, rules: Rule[] = RULES) {
  const index = new Map(rules.map((rule, i) => [rule.id, i]));
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "agentfrisk",
            version: VERSION,
            informationUri: "https://www.npmjs.com/package/agentfrisk",
            rules: rules.map(ruleDescriptor),
          },
        },
        results: result.findings.map((finding) => ({
          ruleId: finding.ruleId,
          ruleIndex: index.get(finding.ruleId) ?? -1,
          level: LEVELS[finding.severity],
          message: { text: `${finding.message} Fix: ${finding.fix}` },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: encodeURI(finding.file) },
                region: { startLine: finding.line },
              },
            },
          ],
          partialFingerprints: { "agentfrisk/v1": `${finding.ruleId}:${finding.file}:${finding.tool}` },
        })),
      },
    ],
  };
}

export function formatSarif(result: ScanResult): string {
  return JSON.stringify(toSarif(result), null, 2) + "\n";
}
