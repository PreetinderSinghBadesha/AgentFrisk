const DIRECTIVE = /agentfrisk-ignore(?![\w-])((?:[\s,]+[a-z][\w-]*)*)/;

export const ALL_RULES = "*";

export function ignoredRules(text: string, line: number): string[] {
  const previous = text.split(/\r?\n/)[line - 2];
  const match = previous && DIRECTIVE.exec(previous);
  if (!match) return [];
  const ids = match[1].split(/[\s,]+/).filter(Boolean);
  return ids.length > 0 ? ids : [ALL_RULES];
}
