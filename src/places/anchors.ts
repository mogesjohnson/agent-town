/** Anchored places follow their landmark when something (e.g. the map editor, #22) moves it. */
import { LANDMARKS } from "../sim.js";
import type { Place } from "./catalog.js";

/**
 * Reads the sim's LANDMARKS array, which the map editor rewrites in place on every edit
 * ({ name: building.name ?? building.id, x, y, w, h, color }). Names match case-insensitively
 * so a loaded map whose buildings only have ids ("cafe") still matches "Cafe".
 * Updates plot and footprint in place and returns the ids of places that moved.
 * Without a map editor LANDMARKS never changes, so this is a no-op. A removed landmark
 * leaves its place at the last known spot.
 */
export function followAnchors(places: Place[]): string[] {
  const moved: string[] = [];
  for (const p of places) {
    if (!p.anchor) continue;
    const key = p.anchor.toLowerCase();
    const l = LANDMARKS.find((m) => String(m.name).toLowerCase() === key);
    if (!l || ![l.x, l.y, l.w, l.h].every(Number.isInteger)) continue;
    if (l.x === p.plot.x && l.y === p.plot.y && l.w === p.footprint.w && l.h === p.footprint.h) continue;
    p.plot = { x: l.x, y: l.y }; p.footprint = { w: l.w, h: l.h };
    moved.push(p.id);
  }
  return moved;
}
