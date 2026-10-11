const cache = new Map<string, RegExp>();

export function globToRegExp(pattern: string): RegExp {
  const cached = cache.get(pattern);
  if (cached) return cached;
  let source = "";
  let braces = 0;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      const slash = pattern[i + 2] === "/";
      source += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") source += "[^/]*";
    else if (c === "?") source += "[^/]";
    else if (c === "{") {
      braces++;
      source += "(?:";
    } else if (c === "}" && braces > 0) {
      braces--;
      source += ")";
    } else if (c === "," && braces > 0) source += "|";
    else source += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  const regex = new RegExp(`^${source}$`);
  cache.set(pattern, regex);
  return regex;
}

function normalize(pattern: string): string {
  const trimmed = pattern.replace(/^\.\//, "").replace(/\/$/, "");
  return trimmed.includes("/") ? trimmed : `**/${trimmed}`;
}

export function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((p) => globToRegExp(normalize(p)).test(path));
}

export function matchesPathOrAncestor(path: string, patterns: string[]): boolean {
  const parts = path.split("/");
  for (let i = 1; i <= parts.length; i++) {
    if (matchesAny(parts.slice(0, i).join("/"), patterns)) return true;
  }
  return false;
}
