import type { Project } from "../discover/program.js";
import type { Classification, ClassifiedTool, Tool } from "../types.js";
import { bodySignals } from "./body.js";
import { maxEffect } from "./effect.js";
import { keywordEffect } from "./keywords.js";

export function classify(project: Project, tool: Tool): Classification {
  const bodies = tool.handler ? [tool.handler, ...tool.related] : tool.related;
  const signals = bodySignals(project, bodies);
  const bodyEffect = maxEffect(...signals.map((s) => s.effect));
  const nameEffect = keywordEffect(tool.name);
  const descriptionEffect = keywordEffect(tool.description);
  return {
    effect: bodyEffect ?? maxEffect(nameEffect, descriptionEffect) ?? "read",
    bodyEffect,
    nameEffect,
    descriptionEffect,
    signals: signals.map((s) => s.description),
  };
}

export function classifyAll(project: Project, tools: Tool[]): ClassifiedTool[] {
  return tools.map((tool) => ({ ...tool, classification: classify(project, tool) }));
}
