import { readFileSync, existsSync } from "node:fs";
import type { ProviderId } from "../types.js";

export interface NewspaperConfig {
  enabled: boolean;
  provider: ProviderId;
  model: string;
  /** Real minutes of unpaused time per in-game day (the base town has no clock of its own). */
  dayMinutes: number;
  maxCallsPerSession: number;
  maxCallsPerRealDay: number;
  maxInputChars: number;
  timeoutMs: number;
  dataDir: string;
}

export const NEWSPAPER_DEFAULTS: NewspaperConfig = {
  enabled: true, provider: "claude-code", model: "haiku", dayMinutes: 10,
  maxCallsPerSession: 12, maxCallsPerRealDay: 24, maxInputChars: 4000,
  timeoutMs: 90_000, dataDir: ".runtime/newspaper",
};

/** Optional "newspaper" key from ctx.config, else from town.config.json (or the example). */
export function loadNewspaperConfig(townConfig?: unknown): NewspaperConfig {
  let raw = (townConfig as { newspaper?: unknown } | undefined)?.newspaper;
  if (raw === undefined) {
    const path = existsSync("town.config.json") ? "town.config.json" : "town.config.example.json";
    try { raw = (JSON.parse(readFileSync(path, "utf8")) as { newspaper?: unknown }).newspaper; } catch { /* defaults */ }
  }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...NEWSPAPER_DEFAULTS };
  for (const [k, def] of Object.entries(NEWSPAPER_DEFAULTS)) {
    const v = r[k];
    if (typeof v !== typeof def) continue;
    if (typeof v === "number" && !(Number.isFinite(v) && v >= 0)) continue;
    out[k] = v;
  }
  const cfg = out as unknown as NewspaperConfig;
  cfg.dayMinutes = Math.max(0.5, cfg.dayMinutes);
  cfg.maxInputChars = Math.min(20_000, Math.max(500, cfg.maxInputChars));
  return cfg;
}
