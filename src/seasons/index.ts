// Public API of the season system. Import from "./seasons/index.js".
import { loadEvents } from "./loader.js";
import { pickFrom } from "./picker.js";
import { SeasonEvent, Visuals } from "./types.js";

export type { SeasonEvent, Visuals, Weather, TimeOfDay, DateWindow } from "./types.js";
export { validateEvent, loadEvents } from "./loader.js";

let events: SeasonEvent[] | null = null;
let overrideId: string | null = null;

/** All loaded events (read from disk on first use). */
export function getEvents(): readonly SeasonEvent[] {
  return (events ??= loadEvents());
}

/** Re-reads seasons/*.json. A manual override is dropped if its event no longer exists. */
export function reloadEvents(dir?: string): readonly SeasonEvent[] {
  events = loadEvents(dir);
  if (overrideId && !events.some((e) => e.id === overrideId)) overrideId = null;
  return events;
}

/** The date-based pick for `date` (local time), ignoring any manual override. */
export function pickEvent(date: Date = new Date()): SeasonEvent | null {
  return pickFrom(getEvents(), date);
}

/** Forces event `id` until clearEvent(). Returns the event, or null when the id is unknown. */
export function triggerEvent(id: string): SeasonEvent | null {
  const ev = getEvents().find((e) => e.id === id) ?? null;
  if (ev) overrideId = ev.id;
  return ev;
}

/** Drops the manual override and goes back to the date-based pick. */
export function clearEvent(): void {
  overrideId = null;
}

/** "manual" while an override is set, otherwise "date". */
export function getSource(): "manual" | "date" {
  return overrideId ? "manual" : "date";
}

/** The manual override if set, otherwise the date-based pick for `date`. */
export function getActiveEvent(date: Date = new Date()): SeasonEvent | null {
  return (overrideId && getEvents().find((e) => e.id === overrideId)) || pickEvent(date);
}

/** Plain-data visuals for any renderer. `eventId` is null and the scene is neutral when no event is active. */
export interface SceneVisuals extends Visuals { eventId: string | null; eventName: string | null }

const NEUTRAL: Visuals = { decor: [], weather: "clear", tint: "#ffffff", ambient: { timeOfDay: "day", brightness: 1 } };

/**
 * A line to append to an agent's system prompt, or "" when no event is active.
 * The hint is flavour only; it never adds tools or instructions to do real work.
 */
export function getTopicHint(date: Date = new Date()): string {
  const ev = getActiveEvent(date);
  return ev ? `Town event: ${ev.name}. ${ev.topicHint}` : "";
}

/** A fresh copy of the active event's visuals (safe to mutate), JSON-serialisable, no drawing code. */
export function getVisuals(date: Date = new Date()): SceneVisuals {
  const ev = getActiveEvent(date);
  const v = ev?.visuals ?? NEUTRAL;
  return {
    eventId: ev?.id ?? null, eventName: ev?.name ?? null,
    decor: [...v.decor], weather: v.weather, tint: v.tint,
    ...(v.ambient ? { ambient: { ...v.ambient } } : {}),
  };
}
