import { Adapter, DetectResult, TownConfig } from "../types.js";
import { mock } from "./mock.js";

const ALL: Adapter[] = [mock];

export function buildAdapters(config: TownConfig): Map<string, Adapter> {
  return new Map(ALL.filter((a) => config.adapters[a.id] !== false).map((a) => [a.id, a]));
}

export async function detectAll(adapters: Map<string, Adapter>): Promise<Map<string, DetectResult>> {
  const out = new Map<string, DetectResult>();
  await Promise.all([...adapters.values()].map(async (a) => {
    try { out.set(a.id, await a.detect()); } catch { out.set(a.id, { available: false }); }
  }));
  return out;
}
