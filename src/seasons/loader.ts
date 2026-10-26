import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SeasonEvent, TIMES_OF_DAY, WEATHERS } from "./types.js";

/** `seasons/` at the repo root; the same path from `src/seasons` and `dist/seasons`. */
export const EVENTS_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "seasons");

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** "MM-DD" to [month, day], or null when it is not a real calendar day (02-29 is allowed). */
export function parseMonthDay(s: unknown): [number, number] | null {
  const m = typeof s === "string" ? /^(\d{2})-(\d{2})$/.exec(s) : null;
  if (!m) return null;
  const month = Number(m[1]), day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) return null;
  return [month, day];
}

const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** Returns a list of problems; empty means `raw` is a valid SeasonEvent. */
export function validateEvent(raw: unknown): string[] {
  if (!isObj(raw)) return ["event must be a JSON object"];
  const errs: string[] = [];
  if (typeof raw.id !== "string" || !ID.test(raw.id)) errs.push("id must be lowercase letters, digits and dashes");
  if (!isText(raw.name, 60)) errs.push("name must be a non-empty string of at most 60 characters");
  if (!Array.isArray(raw.windows) || raw.windows.length === 0) errs.push("windows must be a non-empty array");
  else raw.windows.forEach((w: unknown, i: number) => {
    if (!isObj(w) || !parseMonthDay(w.from) || !parseMonthDay(w.to)) errs.push(`windows[${i}] needs from and to as valid "MM-DD"`);
  });
  if (typeof raw.priority !== "number" || !Number.isFinite(raw.priority)) errs.push("priority must be a finite number");
  if (!isText(raw.topicHint, 300)) errs.push("topicHint must be a non-empty string of at most 300 characters");
  const v = raw.visuals;
  if (!isObj(v)) errs.push("visuals must be an object");
  else {
    if (!Array.isArray(v.decor) || !v.decor.every((d: unknown) => isText(d, 40))) errs.push("visuals.decor must be an array of strings");
    if (!WEATHERS.includes(v.weather)) errs.push(`visuals.weather must be one of ${WEATHERS.join(", ")}`);
    if (typeof v.tint !== "string" || !HEX.test(v.tint)) errs.push('visuals.tint must be "#rrggbb"');
    if (v.ambient !== undefined) {
      const a = v.ambient;
      if (!isObj(a)) errs.push("visuals.ambient must be an object");
      else {
        if (a.timeOfDay !== undefined && !TIMES_OF_DAY.includes(a.timeOfDay)) errs.push(`visuals.ambient.timeOfDay must be one of ${TIMES_OF_DAY.join(", ")}`);
        if (a.brightness !== undefined && !(typeof a.brightness === "number" && a.brightness >= 0 && a.brightness <= 1)) errs.push("visuals.ambient.brightness must be a number from 0 to 1");
      }
    }
  }
  return errs;
}

/**
 * Loads every `*.json` in `dir`. Invalid files and duplicate ids are skipped with a
 * console warning, so one bad file never stops the town.
 */
export function loadEvents(dir = EVENTS_DIR): SeasonEvent[] {
  let files: string[];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort(); }
  catch { console.warn(`[seasons] no events directory at ${dir}`); return []; }
  const out: SeasonEvent[] = [];
  for (const f of files) {
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(join(dir, f), "utf8")); }
    catch (e) { console.warn(`[seasons] ${f}: bad JSON (${(e as Error).message})`); continue; }
    const errs = validateEvent(raw);
    if (errs.length) { console.warn(`[seasons] ${f}: skipped: ${errs.join("; ")}`); continue; }
    const ev = raw as SeasonEvent;
    if (out.some((o) => o.id === ev.id)) { console.warn(`[seasons] ${f}: duplicate id "${ev.id}", skipped`); continue; }
    out.push(ev);
  }
  return out;
}
