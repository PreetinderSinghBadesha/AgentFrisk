import type { ClassifiedTool, Severity } from "../types.js";

export interface Rule {
  id: string;
  severity: Severity;
  description: string;
  fix: string;
  check(tool: ClassifiedTool): string | null;
}
