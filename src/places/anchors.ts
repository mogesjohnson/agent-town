/** Anchored places follow their building when the map editor (#22) moves, removes or reloads it. */
import { LANDMARKS } from "../sim.js";
import type { Place } from "./catalog.js";

/** A building from the editor's GET /api/map. Default ids are the lowercased landmark names. */
export type Building = { id: string; name?: string; x: number; y: number; w: number; h: number };

/**
 * Anchor "Cafe" keys on building id "cafe". `buildings` (last GET /api/map, undefined without
 * the editor) maps the id to its LANDMARKS label (name ?? id); LANDMARKS gives the live spot.
 * A missing building detaches the place until the id returns. Returns ids that changed.
 */
export function followAnchors(places: Place[], buildings?: Building[]): string[] {
  const changed: string[] = [];
  for (const p of places) {
    if (!p.anchor) continue;
    const id = p.anchor.toLowerCase();
    const b = buildings?.find((x) => x.id === id);
    const label = (buildings ? b && (b.name ?? b.id) : id)?.toLowerCase();
    const l = label && LANDMARKS.find((m) => String(m.name).toLowerCase() === label);
    if (!l || ![l.x, l.y, l.w, l.h].every(Number.isInteger)) {
      if (!p.detached) { p.detached = true; changed.push(p.id); }
      continue;
    }
    const back = !!p.detached;
    delete p.detached;
    if (!back && l.x === p.plot.x && l.y === p.plot.y && l.w === p.footprint.w && l.h === p.footprint.h) continue;
    p.plot = { x: l.x, y: l.y }; p.footprint = { w: l.w, h: l.h };
    changed.push(p.id);
  }
  return changed;
}
