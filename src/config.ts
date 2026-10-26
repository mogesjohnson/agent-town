import { readFileSync, existsSync } from "node:fs";
import { DEFAULT_CONFIG, TownConfig } from "./types.js";

export function loadConfig(): TownConfig {
  const path = existsSync("town.config.json") ? "town.config.json" : "town.config.example.json";
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<TownConfig>;
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    adapters: { ...DEFAULT_CONFIG.adapters, ...(raw.adapters ?? {}) },
    agents: raw.agents ?? [],
  };
}
