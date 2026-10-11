import type { Effect } from "../types.js";

const RANK: Record<Effect, number> = { read: 0, write: 1, destructive: 2 };

export function maxEffect(...effects: (Effect | null)[]): Effect | null {
  let result: Effect | null = null;
  for (const effect of effects) {
    if (effect && (!result || RANK[effect] > RANK[result])) result = effect;
  }
  return result;
}
