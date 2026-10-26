/** Load and validate the place definitions in src/places/data/*.json. Data, never instructions. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { H, LANDMARKS, W } from "../sim.js";

export interface Role { id: string; title: string; keywords: string[] }
export interface Place {
  id: string; name: string; type: string;
  plot: { x: number; y: number }; footprint: { w: number; h: number };
  /** Name of an existing sim landmark this place lives in (its plot must match it exactly). */
  anchor?: string;
  sign: string; color: string; hours: { open: number; close: number };
  vibe: string; items: string[]; topics: string[]; roles: Role[];
}

/** JSON lives in src/ (tsc does not copy it); resolve from dist/places or src/places. */
export const DATA_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "src", "places", "data");

const TEXT = /^[\p{L}\p{N} &'.,!?()-]+$/u;
const isText = (v: unknown, max = 60) => typeof v === "string" && v.length <= max && TEXT.test(v);
const isInt = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const list = (v: unknown, max: number) => Array.isArray(v) && v.length > 0 && v.length <= max && v.every((s) => isText(s));

/** Returns the errors for one raw definition ([] when valid). */
export function validatePlace(p: any): string[] {
  const e: string[] = [];
  const id = typeof p?.id === "string" ? p.id : "?";
  const bad = (m: string) => e.push(`${id}: ${m}`);
  if (!/^[a-z][a-z-]{1,30}$/.test(p?.id ?? "")) bad("id must be lowercase letters and dashes");
  for (const k of ["name", "type", "sign"]) if (!isText(p?.[k], 40)) bad(`${k} must be short plain text`);
  if (!isText(p?.vibe, 80)) bad("vibe must be short plain text");
  if (!/^#[0-9a-f]{6}$/i.test(p?.color ?? "")) bad("color must be #rrggbb");
  const { x, y } = p?.plot ?? {}, { w, h } = p?.footprint ?? {};
  if (!isInt(w, 1, 10) || !isInt(h, 1, 10)) bad("footprint w/h must be 1..10");
  else if (!isInt(x, 0, W - w) || !isInt(y, 0, H - h)) bad(`plot must fit the ${W}x${H} map`);
  if (!isInt(p?.hours?.open, 0, 23) || !isInt(p?.hours?.close, 1, 24) || p.hours.open >= p.hours.close) bad("hours need 0 <= open < close <= 24");
  if (!list(p?.items, 8)) bad("items: 1..8 short strings");
  if (!list(p?.topics, 8)) bad("topics: 1..8 short strings");
  if (!Array.isArray(p?.roles) || !p.roles.length || p.roles.length > 3) bad("roles: 1..3 entries");
  else for (const r of p.roles) {
    if (!/^[a-z-]{2,20}$/.test(r?.id ?? "") || !isText(r?.title, 30) || !list(r?.keywords, 6)) bad("role needs id, title, keywords");
  }
  if (p?.anchor !== undefined) {
    const l = LANDMARKS.find((m) => m.name === p.anchor);
    if (!l) bad(`unknown anchor ${p.anchor}`);
    else if (l.x !== x || l.y !== y || l.w !== w || l.h !== h) bad(`plot must match landmark ${l.name}`);
  }
  return e;
}

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const rectOf = (p: Place): Rect => ({ ...p.plot, ...p.footprint });

/** Valid places, sorted by id. Bad files, duplicate ids and overlapping plots are skipped with a log line. */
export function loadCatalog(dir = DATA_DIR): Place[] {
  const out: Place[] = [];
  let files: string[] = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort(); } catch { console.error(`[places] no data dir ${dir}`); }
  for (const f of files) {
    let raw: any;
    try { raw = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { console.error(`[places] ${f}: invalid JSON`); continue; }
    const errs = validatePlace(raw);
    const r = rectOf(raw);
    if (!errs.length && out.some((o) => o.id === raw.id)) errs.push(`${raw.id}: duplicate id`);
    if (!errs.length && !raw.anchor && LANDMARKS.some((l) => overlaps(r, l))) errs.push(`${raw.id}: overlaps a landmark`);
    if (!errs.length && out.some((o) => overlaps(r, rectOf(o)))) errs.push(`${raw.id}: overlaps another place`);
    if (errs.length) { console.error(`[places] skipping ${f}: ${errs.join("; ")}`); continue; }
    out.push(raw as Place);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
