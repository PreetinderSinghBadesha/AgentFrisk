import type { ClassifiedTool, Finding, ScanResult } from "../types.js";
import { VERSION } from "../version.js";
import { summarize } from "./text.js";

function toolJson(tool: ClassifiedTool) {
  return {
    name: tool.name,
    description: tool.description,
    effect: tool.classification.effect,
    style: tool.style,
    source: tool.source,
    file: tool.file,
    line: tool.line,
    confirms: tool.confirms,
    autosubmit: tool.autosubmit,
    inputSchema: tool.inputSchema,
    signals: tool.classification.signals,
  };
}

function findingJson({ ruleId, severity, message, fix }: Finding) {
  return { ruleId, severity, message, fix };
}

export function formatListJson(tools: ClassifiedTool[]): string {
  return JSON.stringify({ version: VERSION, tools: tools.map(toolJson) }, null, 2) + "\n";
}

export function formatJson(result: ScanResult): string {
  const output = {
    version: VERSION,
    summary: { tools: result.tools.length, ...summarize(result.findings) },
    tools: result.tools.map(({ tool, findings }) => ({ ...toolJson(tool), findings: findings.map(findingJson) })),
    findings: result.findings,
  };
  return JSON.stringify(output, null, 2) + "\n";
}
