import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Edit, MapData } from "../mapeditor/model.js";

export const WORLD_PATH = ".runtime/world.json";
export interface WorldFile { map: MapData & { version: number }; history: Edit[] }

export function readWorld(path = WORLD_PATH): WorldFile | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw || typeof raw !== "object" || !raw.map) return null;
    return { map: raw.map, history: Array.isArray(raw.history) ? raw.history : [] };
  } catch { console.error("[world] ignoring unreadable world file"); return null; }
}

export function writeWorld(doc: WorldFile, path = WORLD_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(doc) + "\n");
  renameSync(tmp, path);
}
