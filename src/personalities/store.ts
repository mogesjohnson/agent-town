/** Load (cached by mtime) and atomically save town.personalities.json. */
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LIMITS, PersonalitiesFile, Personality, Result, validatePersonalities } from "./schema.js";

export const PERSONALITIES_PATH = "town.personalities.json";
/** Sample lives in src/ (not copied by tsc); resolve it from dist/personalities or src/personalities. */
export const SAMPLE_PATH = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "src", "personalities", "sample.personalities.json");

const EMPTY: PersonalitiesFile = { version: 1, agents: {} };
let cache: { mtimeMs: number; data: PersonalitiesFile } | null = null;
let warned = 0;

function readFile(path: string): Result {
  const raw = readFileSync(path, "utf8");
  if (Buffer.byteLength(raw) > LIMITS.fileBytes) return { ok: false, errors: [`file: larger than ${LIMITS.fileBytes} bytes`] };
  try { return validatePersonalities(JSON.parse(raw)); } catch { return { ok: false, errors: ["file: invalid JSON"] }; }
}

/** Current personalities. Missing or invalid file means none (the sim is unchanged). */
export function loadPersonalities(path = PERSONALITIES_PATH): PersonalitiesFile {
  if (!existsSync(path)) { cache = null; return EMPTY; }
  const { mtimeMs } = statSync(path);
  if (cache && cache.mtimeMs === mtimeMs) return cache.data;
  const r = readFile(path);
  if (!r.ok) {
    if (warned !== mtimeMs) console.error(`[personalities] ignoring ${path}: ${r.errors.slice(0, 3).join("; ")}`);
    warned = mtimeMs;
    cache = { mtimeMs, data: EMPTY };
    return EMPTY;
  }
  cache = { mtimeMs, data: r.value };
  return r.value;
}

export function getPersonality(agent: string): Personality | undefined {
  const agents = loadPersonalities().agents;
  return Object.prototype.hasOwnProperty.call(agents, agent) ? agents[agent] : undefined;
}

/** What the editor starts from: the saved file, else the sample. */
export function loadForEditor(): PersonalitiesFile {
  if (existsSync(PERSONALITIES_PATH)) return loadPersonalities();
  if (existsSync(SAMPLE_PATH)) { const r = readFile(SAMPLE_PATH); if (r.ok) return r.value; }
  return EMPTY;
}

/** Validate then write via a temp file and rename, so the sim never reads half a file. */
export function savePersonalities(input: unknown, path = PERSONALITIES_PATH): Result {
  const r = validatePersonalities(input);
  if (!r.ok) return r;
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(r.value, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
  cache = null;
  return r;
}
