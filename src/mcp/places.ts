// Ops for custom places (POST /api/places, DELETE /api/places/:id from the places feature, PR #24).
// The places routes check everything again (fit, overlap, ids); these add dryRun and undo info.
import type { Args } from "./schema.js";
import { OpError, type Run, type Self } from "./ops.js";

type Place = { id: string; name: string; type: string; x: number; y: number; w: number; h: number; enabled: boolean;
  custom?: boolean; hours: { open: number; close: number }; vibe: string; items: string[]; topics: string[] };
type Rect = { x: number; y: number; w: number; h: number };
type Spot = { x: number; y: number };
type MapJson = { width: number; height: number; tiles: string[][]; buildings: (Rect & { id: string; name?: string })[] };
type Target = Spot & { what: string };
type Body = Omit<Place, "enabled" | "custom">;

const TRIES = 12;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Centroid of the largest 4-connected cluster of water tiles (the pond), or null. */
function pond(m: MapJson): Target | null {
  const seen = new Set<string>();
  let best: Spot[] = [];
  m.tiles.forEach((row, y) => row.forEach((t, x) => {
    if (t !== "water" || seen.has(`${x},${y}`)) return;
    const cells: Spot[] = [], todo: Spot[] = [{ x, y }];
    seen.add(`${x},${y}`);
    for (let c; (c = todo.pop()); ) {
      cells.push(c);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = { x: c.x + dx, y: c.y + dy }, k = `${n.x},${n.y}`;
        if (m.tiles[n.y]?.[n.x] === "water" && !seen.has(k)) { seen.add(k); todo.push(n); }
      }
    }
    if (cells.length > best.length) best = cells;
  }));
  if (!best.length) return null;
  const mean = (f: (c: Spot) => number) => best.reduce((s, c) => s + f(c), 0) / best.length + 0.5;
  return { x: mean((c) => c.x), y: mean((c) => c.y), what: `water (${best.length} tiles)` };
}

const NA = "custom places are not available on this town (needs POST/DELETE /api/places, PR #24)";

export function placeOps(self: Self): Record<string, Run> {
  const types = async (): Promise<{ type: string; w: number; h: number }[]> => {
    try { return (await self("/api/places/types")).types; } catch (e) { throw e instanceof OpError && e.status === 404 ? new OpError(NA, 404) : e; }
  };
  const places = async (): Promise<Place[]> => (await self("/api/places")).places ?? [];
  /** Free top-left spots for a w x h place, nearest to the target first (a spiral outward), within the map. */
  const search = async (near: NonNullable<Args<"place.add">["near"]>, w: number, h: number) => {
    const [m, ps] = await Promise.all([self("/api/map").catch(() => null) as Promise<MapJson | null>, places()]);
    const buildings: MapJson["buildings"] = m?.buildings ?? ((await self("/api/state")).landmarks ?? []).map((l: Rect & { name: string }) => ({ ...l, id: l.name }));
    let target: Target | null;
    if (typeof near !== "string") target = { ...near, what: `${near.x},${near.y}` };
    else if (/^(pond|water|lake)$/i.test(near)) {
      if (!m) throw new OpError(`near "${near}" needs the map editor (GET /api/map is not available)`, 404);
      target = pond(m);
      if (!target) throw new OpError("there is no water on the map", 404);
    } else {
      const k = near.toLowerCase();
      const r = ps.find((p) => p.id === k || p.name.toLowerCase() === k) ?? buildings.find((b) => b.id.toLowerCase() === k || b.name?.toLowerCase() === k);
      if (!r) throw new OpError(`unknown near target "${near}": use a place id, a building id or name, "pond", or {x, y}`, 404);
      target = { x: r.x + r.w / 2, y: r.y + r.h / 2, what: `${r.id} at ${r.x},${r.y}` };
    }
    const width = m?.width ?? 40, height = m?.height ?? 25, taken: Rect[] = [...ps, ...buildings], spots: (Spot & { d: number })[] = [];
    for (let y = 0; y + h <= height; y++) for (let x = 0; x + w <= width; x++) {
      const r = { x, y, w, h };
      if (taken.some((t) => overlaps(r, t))) continue;
      if (m && m.tiles.slice(y, y + h).some((row) => row.slice(x, x + w).includes("water"))) continue;
      spots.push({ x, y, d: Math.hypot(x + w / 2 - target.x, y + h / 2 - target.y) });
    }
    spots.sort((a, b) => a.d - b.d);
    return { target, spots: spots.slice(0, TRIES).map(({ x, y }) => ({ x, y })) };
  };
  const body = ({ id, name, type, x, y, w, h, hours, vibe, items, topics }: Place): Body => ({ id, name, type, x, y, w, h, hours, vibe, items, topics });

  return {
    "place.move": async (a: Args<"place.move">, dry) => {
      const before = (await places()).find((p) => p.id === a.id);
      if (!before) throw new OpError(`unknown place "${a.id}"`, 404);
      const result = await self(`/api/places/${encodeURIComponent(a.id)}/move`, { x: a.x, y: a.y, dryRun: dry });
      return { before, after: result.place,
        revert: { op: "place.move", args: { id: a.id, x: before.x, y: before.y } } };
    },
    "place.add": async (a: Args<"place.add">, dry) => {
      const list = await types();
      if (!list.some((t) => t.type === a.type)) throw new OpError(`unknown place type ${a.type}; types: ${list.map((t) => t.type).join(", ")}`);
      const { near, ...args } = a;
      let spots: Spot[], target: Target | null = null;
      const t = list.find((t) => t.type === a.type)!, w = a.w ?? t.w, h = a.h ?? t.h;
      if (a.x !== undefined && a.y !== undefined) spots = [{ x: a.x, y: a.y }];
      else if (a.x !== undefined || a.y !== undefined || !near) throw new OpError("give x and y, or omit both and give near");
      else {
        ({ target, spots } = await search(near, w, h));
        if (!spots.length) throw new OpError(`no free spot on the map near ${target.what}`, 409);
      }
      if (a.id && (await places()).some((p) => p.id === a.id)) throw new OpError(`id ${a.id} is taken`, 409);
      const found = target && { target, candidates: spots };
      if (dry) return { before: null, after: { ...args, ...spots[0], near: found, note: "fit and overlap are checked when applied" }, revert: { op: "place.remove", args: { id: a.id } } };
      // Another writer can take a spot between the search and the POST: on a 409 overlap, search again and try the next spot.
      const attempts: (Spot & { result: string })[] = [];
      for (let s: Spot | undefined = spots[0]; s && attempts.length < TRIES; ) {
        try {
          const { place } = await self("/api/places", { ...args, ...s });
          attempts.push({ ...s, result: "created" });
          return { before: null, after: { place, ...(target && { near: target, attempts }) }, revert: { op: "place.remove", args: { id: place.id } } };
        } catch (e) {
          if (!(e instanceof OpError)) throw e;
          attempts.push({ ...s, result: e.message });
          if (!target || e.status !== 409 || !/overlaps/.test(e.message)) throw target ? new OpError(`${e.message} (attempts: ${JSON.stringify(attempts)})`, e.status) : e;
          s = (await search(near!, w, h)).spots.find((c) => !attempts.some((p) => p.x === c.x && p.y === c.y));
        }
      }
      throw new OpError(`no spot near ${target!.what} worked after ${attempts.length} attempts: ${JSON.stringify(attempts)}`, 409);
    },
    "place.remove": async (a: Args<"place.remove">, dry) => {
      await types();
      const p = (await places()).find((x) => x.id === a.id);
      if (!p) throw new OpError(`unknown place "${a.id}"`, 404);
      if (!p.custom) throw new OpError(`${a.id} is a built-in place and cannot be removed; close it with toggle_place`, 403);
      if (!dry) await self(`/api/places/${encodeURIComponent(a.id)}`, undefined, "DELETE");
      return { before: p, after: null, revert: { op: "place.restore", args: { place: body(p), enabled: p.enabled } } };
    },
    /** Undo of remove_place: re-creates the place with its old id; 409 if that id or spot was taken since. */
    "place.restore": async ({ place, enabled }: { place: Body; enabled: boolean }, dry) => {
      const revert = { op: "place.remove", args: { id: place.id } };
      if (dry) return { before: null, after: place, revert };
      let r;
      try { r = await self("/api/places", place); } catch (e) {
        throw e instanceof OpError ? new OpError(`cannot restore place ${place.id}: ${e.message}`, e.status) : e;
      }
      if (!enabled) await self("/api/places/toggle", { id: place.id, enabled: false });
      return { before: null, after: r.place, revert };
    },
  };
}
