// Town data written by MCP changes. Everything lives in one fixed folder; no path comes from input.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const DATA_DIR = resolve(".runtime", "town-data");
const FILES = { agents: "agents.json", seasons: "seasons.json" } as const;
const LOG = join(DATA_DIR, "changes.jsonl");

/** One overlay file: key -> value, or null when an added item was removed again (by undo). */
export type Overlay<T> = Record<string, T | null>;

export function readOverlay<T>(kind: keyof typeof FILES): Overlay<T> {
  try { return JSON.parse(readFileSync(join(DATA_DIR, FILES[kind]), "utf8")); } catch { return {}; }
}

export function writeOverlay<T>(kind: keyof typeof FILES, key: string, value: T | null) {
  const all = readOverlay<T>(kind);
  all[key] = value;
  mkdirSync(DATA_DIR, { recursive: true });
  const file = join(DATA_DIR, FILES[kind]);
  writeFileSync(`${file}.tmp`, JSON.stringify(all, null, 2) + "\n");
  renameSync(`${file}.tmp`, file);
}

export interface Change {
  id: number; at: string; actor: string; op: string; args: unknown;
  before: unknown; after: unknown;
  /** The op that restores `before`; absent when the change cannot be undone. */
  revert?: { op: string; args: unknown };
  undoOf?: number;
}

/** Append-only change log, kept in memory and mirrored to changes.jsonl. */
export const changes: Change[] = existsSync(LOG)
  ? readFileSync(LOG, "utf8").split("\n").filter(Boolean).slice(-1000).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } })
  : [];

export function record(c: Omit<Change, "id" | "at">): Change {
  const entry = { id: (changes.at(-1)?.id ?? 0) + 1, at: new Date().toISOString(), ...c };
  changes.push(entry);
  mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(LOG, JSON.stringify(entry) + "\n");
  return entry;
}

/** Latest change that can be undone and has not been undone yet. */
export function lastUndoable(): Change | undefined {
  const undone = new Set(changes.map((c) => c.undoOf).filter((n) => n !== undefined));
  return [...changes].reverse().find((c) => c.revert && !undone.has(c.id) && c.undoOf === undefined);
}
