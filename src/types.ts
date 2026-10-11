import type ts from "typescript";

export type Style = "imperative" | "library" | "declarative";
export type Effect = "read" | "write" | "destructive";
export type Severity = "error" | "warning" | "info";
export type ModelContextApi = "document" | "navigator";

export type JsonSchema = { [key: string]: unknown };
export type InputSchema = JsonSchema | null | "unknown";

export interface Tool {
  name: string;
  description: string | null;
  inputSchema: InputSchema;
  handler: ts.Node | null;
  confirms: boolean;
  autosubmit: boolean;
  source: string;
  style: Style;
  file: string;
  line: number;
  related: ts.Node[];
  apis: ModelContextApi[];
  ignored: string[];
}

export interface Classification {
  effect: Effect;
  bodyEffect: Effect | null;
  nameEffect: Effect | null;
  descriptionEffect: Effect | null;
  signals: string[];
}

export interface ClassifiedTool extends Tool {
  classification: Classification;
}

export interface Finding {
  ruleId: string;
  severity: Severity;
  message: string;
  fix: string;
  tool: string;
  file: string;
  line: number;
  source: string;
}

export interface ToolReport {
  tool: ClassifiedTool;
  findings: Finding[];
}

export interface ScanResult {
  root: string;
  tools: ToolReport[];
  findings: Finding[];
}
