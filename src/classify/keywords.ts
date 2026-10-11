import type { Effect } from "../types.js";
import { maxEffect } from "./effect.js";

const KEYWORDS: Record<Effect, string[]> = {
  destructive: ["delete", "remove", "cancel", "refund", "pay", "charge", "transfer", "purge", "drop", "reset", "destroy", "erase", "wipe", "revoke"],
  write: ["create", "add", "update", "save", "send", "submit", "edit", "insert", "upload", "book", "subscribe", "publish", "rename", "modify", "post"],
  read: ["get", "list", "search", "find", "view", "fetch", "read", "show", "lookup", "query", "check", "count"],
};

export function words(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function inflections(keyword: string): string[] {
  const last = keyword.at(-1);
  const stem = keyword.endsWith("e") ? keyword.slice(0, -1) : keyword;
  return [
    keyword,
    `${keyword}s`,
    `${keyword}es`,
    `${keyword}d`,
    `${keyword}ed`,
    `${stem}ing`,
    `${keyword}${last}ed`,
    `${keyword}${last}ing`,
  ];
}

const LOOKUP = new Map<string, Effect>();
for (const effect of ["read", "write", "destructive"] as Effect[]) {
  for (const keyword of KEYWORDS[effect]) {
    for (const form of inflections(keyword)) LOOKUP.set(form, effect);
  }
}

export function keywordEffect(text: string | null): Effect | null {
  if (!text) return null;
  return maxEffect(...words(text).map((word) => LOOKUP.get(word) ?? null));
}
