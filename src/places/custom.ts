/** Build and check places created over POST /api/places. Pretend venues only: data, no real work. */
import { LANDMARKS } from "../sim.js";
import { overlaps, rectOf, validatePlace, type Place } from "./catalog.js";

export type Result = { place: Place } | { status: 400 | 409; error: string };

/** Template per type: the first built-in of that type, preferring one that is not tied to a landmark. */
export function templates(catalog: Place[]): Map<string, Place> {
  const out = new Map<string, Place>();
  const builtIns = catalog.filter((p) => !p.custom).sort((a, b) => Number(!!a.anchor) - Number(!!b.anchor));
  for (const p of builtIns) if (!out.has(p.type)) out.set(p.type, p);
  return out;
}

/** GET /api/places/types: the valid types and their default footprints. */
export const typeList = (catalog: Place[]) => [...templates(catalog).values()]
  .map((t) => ({ type: t.type, w: t.footprint.w, h: t.footprint.h, template: t.id, roles: t.roles.map((r) => r.title) }))
  .sort((a, b) => a.type.localeCompare(b.type));

const slug = (s: string) => s.normalize("NFKD").toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);

/** Overlap with another place or a building where it is now (map editor moves included). */
export function clash(p: Place, others: Place[]): string | undefined {
  const r = rectOf(p);
  const o = others.find((q) => q.id !== p.id && overlaps(r, rectOf(q)));
  if (o) return `overlaps place ${o.id}`;
  const l = LANDMARKS.find((m) => overlaps(r, m));
  if (l) return `overlaps building ${l.name}`;
}

/** Validate a request body and build the place. Does not save anything. */
export function buildPlace(b: any, catalog: Place[]): Result {
  const bad = (error: string) => ({ status: 400 as const, error });
  const t = templates(catalog).get(b?.type);
  if (!t) return bad(`type must be one of: ${[...templates(catalog).keys()].sort().join(", ")}`);
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > 40) return bad("name must be 1..40 characters");
  for (const k of ["x", "y", "w", "h"]) if (b[k] !== undefined && !Number.isInteger(b[k])) return bad(`${k} must be an integer`);
  if (b.x === undefined || b.y === undefined) return bad("x and y are required");
  let id: string;
  if (b.id !== undefined) {
    if (typeof b.id !== "string" || !/^[a-z][a-z-]{1,30}$/.test(b.id)) return bad("id must be lowercase letters and dashes");
    if (catalog.some((p) => p.id === b.id)) return { status: 409, error: `id ${b.id} is taken` };
    id = b.id;
  } else {
    const base = /^[a-z][a-z-]{1,23}$/.test(slug(name)) ? slug(name) : t.type;
    // Ids are letters and dashes only, so suffix with a letter: shop, shop-b, shop-c, ...
    const found = [base, ...[..."bcdefghijklmnopqrstuvwxyz"].map((c) => `${base}-${c}`)].find((s) => !catalog.some((p) => p.id === s));
    if (!found) return { status: 409, error: "no free id for this name; pass an id" };
    id = found;
  }
  const place: Place = {
    id, name, type: t.type, sign: name.toUpperCase().slice(0, 40), color: t.color,
    plot: { x: b.x, y: b.y }, footprint: { w: b.w ?? t.footprint.w, h: b.h ?? t.footprint.h },
    hours: b.hours ?? { ...t.hours }, vibe: b.vibe ?? t.vibe, items: b.items ?? [...t.items], topics: b.topics ?? [...t.topics],
    roles: t.roles.map((r) => ({ ...r, keywords: [...r.keywords] })), custom: true,
  };
  const errs = validatePlace(place);
  if (errs.length) return bad(errs.map((e) => e.replace(`${id}: `, "")).join("; "));
  const c = clash(place, catalog);
  return c ? { status: 409, error: c } : { place };
}

/** Re-check saved custom places at startup; bad or clashing ones are skipped with a log line. */
export function acceptSaved(raw: unknown[], builtIns: Place[]): Place[] {
  const ok: Place[] = [];
  for (const p of raw as any[]) {
    const all = [...builtIns, ...ok];
    const errs = p?.anchor !== undefined ? ["custom places cannot anchor"] : validatePlace(p);
    const why = errs.length ? errs.join("; ") : all.some((q) => q.id === p.id) ? "duplicate id" : clash(p, all);
    if (why) { console.error(`[places] skipping saved custom place ${p?.id ?? "?"}: ${why}`); continue; }
    ok.push({ ...p, custom: true });
  }
  return ok;
}
