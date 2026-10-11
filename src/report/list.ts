import type { Colors } from "./colors.js";
import type { ClassifiedTool, Effect } from "../types.js";

export function effectLabel(effect: Effect, c: Colors, width = 0): string {
  const label = effect.padEnd(width);
  if (effect === "destructive") return c.red(label);
  if (effect === "write") return c.yellow(label);
  return c.green(label);
}

export function formatList(tools: ClassifiedTool[], c: Colors): string {
  if (tools.length === 0) return "No WebMCP tools found.\n";
  const width = Math.max(...tools.map((t) => t.name.length));
  const lines: string[] = [];
  let file = "";
  for (const tool of tools) {
    if (tool.file !== file) {
      if (file) lines.push("");
      file = tool.file;
      lines.push(c.underline(file));
    }
    const line = c.dim(`${tool.line}`.padStart(5));
    lines.push(`${line}  ${c.bold(tool.name.padEnd(width))}  ${effectLabel(tool.classification.effect, c, 11)} ${c.dim(tool.style)}`);
  }
  lines.push("", `${tools.length} tool${tools.length === 1 ? "" : "s"} found.`);
  return lines.join("\n") + "\n";
}
