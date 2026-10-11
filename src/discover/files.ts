import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { matchesAny, matchesPathOrAncestor } from "./glob.js";

export const DEFAULT_INCLUDE = ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,html,htm}"];
export const DEFAULT_EXCLUDE = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  "coverage",
  "**/*.d.ts",
];

export function toPosix(path: string): string {
  return path.split(sep).join("/");
}

export function collectFiles(dir: string, include: string[], exclude: string[]): string[] {
  const files: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      const rel = toPosix(relative(dir, full));
      if (matchesPathOrAncestor(rel, exclude)) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && matchesAny(rel, include)) files.push(full);
    }
  };
  walk(dir);
  return files.sort();
}
