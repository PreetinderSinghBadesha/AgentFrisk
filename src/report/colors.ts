import pc from "picocolors";

export type Colors = ReturnType<typeof pc.createColors>;

export function colors(enabled: boolean): Colors {
  return pc.createColors(enabled);
}
