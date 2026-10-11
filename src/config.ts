import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_EXCLUDE, DEFAULT_INCLUDE } from "./discover/files.js";
import type { Severity } from "./types.js";

export type RuleSetting = Severity | "off";

export interface Config {
  rules: Record<string, RuleSetting>;
  include: string[];
  exclude: string[];
}

export const CONFIG_FILE = "agentfrisk.config.json";

const SETTINGS = new Set<string>(["error", "warning", "info", "off"]);

export class ConfigError extends Error {}

export function loadConfig(dir: string, explicitPath?: string): Config {
  const path = explicitPath ?? join(dir, CONFIG_FILE);
  if (!existsSync(path)) {
    if (explicitPath) throw new ConfigError(`Config file not found: ${explicitPath}`);
    return resolveConfig({});
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ConfigError(`Invalid JSON in ${path}: ${(error as Error).message}`);
  }
  return resolveConfig(raw);
}

export function resolveConfig(raw: unknown): Config {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigError("Config must be a JSON object");
  }
  const input = raw as Record<string, unknown>;
  const rules: Record<string, RuleSetting> = {};
  if (input.rules !== undefined) {
    if (typeof input.rules !== "object" || input.rules === null || Array.isArray(input.rules)) {
      throw new ConfigError('"rules" must be an object');
    }
    for (const [id, setting] of Object.entries(input.rules)) {
      if (typeof setting !== "string" || !SETTINGS.has(setting)) {
        throw new ConfigError(`Rule "${id}" must be one of: error, warning, info, off`);
      }
      rules[id] = setting as RuleSetting;
    }
  }
  return {
    rules,
    include: stringList(input.include, "include") ?? DEFAULT_INCLUDE,
    exclude: [...DEFAULT_EXCLUDE, ...(stringList(input.exclude, "exclude") ?? [])],
  };
}

function stringList(value: unknown, key: string): string[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new ConfigError(`"${key}" must be an array of glob strings`);
  }
  return value;
}
