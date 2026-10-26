/** Atomic load and save for `.runtime/memories.json`. Invalid files are ignored. */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { agentName, emptyBook, sanitize, type Book, type Favorite, type Note, type NoteKind, type Relationship, type ResidentMemory, type Source } from "./model.js";

export const MEMORY_PATH = ".runtime/memories.json";
// Accommodates all 32 bounded residents, including four-byte Unicode text.
const MAX_BYTES = 1_000_000;
let file = MEMORY_PATH;
let book = emptyBook();
let loaded = false;

export function currentBook(): Book {
  if (!loaded) loadMemories();
  return book;
}

/** Point the singleton at a file and load it. Tests use a temporary path. */
export function useMemoryFile(path: string): Book {
  file = path;
  loaded = false;
  return loadMemories();
}

export function loadMemories(): Book {
  book = readMemories(file);
  loaded = true;
  return book;
}

export function saveMemories() {
  writeMemories(file, book);
}

export function readMemories(path: string): Book {
  if (!existsSync(path)) return emptyBook();
  try {
    if (statSync(path).size > MAX_BYTES) {
      console.error("[memories] ignoring oversized memory file");
      return emptyBook();
    }
    return normalize(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    console.error("[memories] ignoring unreadable memory file");
    return emptyBook();
  }
}

export function writeMemories(path: string, value: Book) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value) + "\n");
  renameSync(tmp, path);
}

function num(value: unknown, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.trunc(value))) : 0;
}

function asNote(value: unknown, kinds: NoteKind[]): Note | undefined {
  if (!value || typeof value !== "object") return undefined;
  const n = value as Partial<Note>;
  if (!kinds.includes(n.kind as NoteKind)) return undefined;
  if (n.source !== "observed" && n.source !== "claimed") return undefined;
  if ((n.kind === "speech") !== (n.source === "claimed")) return undefined;
  const text = sanitize(typeof n.text === "string" ? n.text : "");
  if (!text) return undefined;
  const about = typeof n.about === "string" ? agentName(n.about) : undefined;
  return { id: typeof n.id === "string" ? n.id.slice(0, 16) : "n0", kind: n.kind as NoteKind, text, about, source: n.source as Source, at: num(n.at, 10_000_000_000_000) };
}

function normalize(input: unknown): Book {
  if (!input || typeof input !== "object" || (input as { version?: unknown }).version !== 1) return emptyBook();
  const src = input as { residents?: unknown; town?: unknown; seq?: unknown };
  const next = emptyBook();
  next.seq = num(src.seq, 1_000_000);
  if (Array.isArray(src.town)) {
    for (const item of src.town) {
      const note = asNote(item, ["event"]);
      if (note) next.town.push(note);
    }
  }
  next.town = next.town.slice(-8);
  if (!src.residents || typeof src.residents !== "object" || Array.isArray(src.residents)) return next;
  for (const [name, value] of Object.entries(src.residents as Record<string, unknown>)) {
    if (Object.keys(next.residents).length >= 32) break;
    const key = agentName(name);
    if (!key || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const raw = value as Partial<ResidentMemory>;
    const mem: ResidentMemory = { relationships: [], favorites: [], notes: [] };
    for (const item of Array.isArray(raw.relationships) ? raw.relationships : []) {
      if (!item || typeof item !== "object") continue;
      const rel = item as Partial<Relationship>;
      const other = typeof rel.other === "string" ? agentName(rel.other) : undefined;
      if (!other || mem.relationships.some((r) => r.other === other)) continue;
      mem.relationships.push({ other, meetings: num(rel.meetings, 10_000), lastAt: num(rel.lastAt, 10_000_000_000_000) });
    }
    for (const item of Array.isArray(raw.favorites) ? raw.favorites : []) {
      if (!item || typeof item !== "object") continue;
      const fav = item as Partial<Favorite>;
      const place = sanitize(typeof fav.place === "string" ? fav.place : "");
      if (!place || mem.favorites.some((f) => f.place === place)) continue;
      mem.favorites.push({ place, visits: num(fav.visits, 10_000), lastAt: num(fav.lastAt, 10_000_000_000_000) });
    }
    for (const item of Array.isArray(raw.notes) ? raw.notes : []) {
      const note = asNote(item, ["meeting", "speech", "event"]);
      if (note) mem.notes.push(note);
    }
    mem.relationships = mem.relationships.slice(-16);
    mem.favorites = mem.favorites.slice(-8);
    mem.notes = mem.notes.slice(-12);
    const speech = new Set(mem.notes.filter((n) => n.kind === "speech").slice(-4));
    mem.notes = mem.notes.filter((n) => n.kind !== "speech" || speech.has(n));
    next.residents[key] = mem;
  }
  return next;
}
