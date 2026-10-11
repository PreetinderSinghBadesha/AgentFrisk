import type { Finding, ScanResult, Severity } from "../types.js";
import type { Colors } from "./colors.js";
import { effectLabel } from "./list.js";

export function summarize(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) counts[finding.severity]++;
  return counts;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function severityLabel(severity: Severity, c: Colors): string {
  const label = severity.padEnd(7);
  if (severity === "error") return c.red(c.bold(label));
  if (severity === "warning") return c.yellow(label);
  return c.blue(label);
}

export function formatText(result: ScanResult, c: Colors): string {
  if (result.tools.length === 0) return "No WebMCP tools found.\n";
  const lines: string[] = [];
  let file = "";
  for (const { tool, findings } of result.tools) {
    if (tool.file !== file) {
      if (file) lines.push("");
      file = tool.file;
      lines.push(c.underline(file));
    }
    lines.push(`  ${c.bold(tool.name)}  ${effectLabel(tool.classification.effect, c)}  ${c.dim(`${tool.style}, line ${tool.line}`)}`);
    if (findings.length === 0) lines.push(`    ${c.green("✓")} ${c.dim("no findings")}`);
    for (const finding of findings) {
      lines.push(`    ${severityLabel(finding.severity, c)} ${c.dim(finding.ruleId)}  ${finding.message}`);
      lines.push(`            ${c.dim(`fix: ${finding.fix}`)}`);
    }
  }
  const counts = summarize(result.findings);
  const summary = [plural(result.tools.length, "tool"), plural(counts.error, "error"), plural(counts.warning, "warning"), `${counts.info} info`];
  lines.push("", summary.join(", "));
  return lines.join("\n") + "\n";
}
