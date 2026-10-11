import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { classifyAll } from "./classify/index.js";
import { loadConfig, type Config } from "./config.js";
import { collectFiles } from "./discover/files.js";
import { discover, readSources, type DiscoverInput } from "./discover/index.js";
import { runRules } from "./rules/index.js";
import type { ClassifiedTool, ScanResult } from "./types.js";

export interface ScanOptions {
  root?: string;
  config?: Config;
  configPath?: string;
}

export class ScanError extends Error {}

function displayRoot(target: string, root: string | undefined): string {
  if (root) return resolve(root);
  const cwd = process.cwd();
  const rel = relative(cwd, target);
  return rel.startsWith("..") || isAbsolute(rel) ? target : cwd;
}

export function analyze(input: DiscoverInput): ClassifiedTool[] {
  const { project, tools } = discover(input);
  return classifyAll(project, tools);
}

export function analyzeDir(dir: string, options: ScanOptions = {}): { config: Config; root: string; tools: ClassifiedTool[] } {
  const target = resolve(dir);
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    throw new ScanError(`Not a directory: ${dir}`);
  }
  const config = options.config ?? loadConfig(target, options.configPath);
  const files = collectFiles(target, config.include, config.exclude);
  const root = displayRoot(target, options.root);
  const tools = analyze({ root, files: readSources(files), configDir: target });
  return { config, root, tools };
}

export function scan(dir: string, options: ScanOptions = {}): ScanResult {
  const { config, root, tools } = analyzeDir(dir, options);
  const reports = runRules(tools, config);
  return {
    root,
    tools: reports,
    findings: reports.flatMap((r) => r.findings),
  };
}
