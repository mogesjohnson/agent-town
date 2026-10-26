import type { DayEvents } from "./types.js";

const MAX_CONVOS = 60, MAX_LINES = 8, MAX_OTHER = 40, MAX_TEXT = 160;
const OTHER_KINDS = ["season", "place", "places", "weather", "festival", "event"];
export const EVENT_KINDS = ["say", "convo", "minigame", ...OTHER_KINDS];

const clip = (s: unknown, n = MAX_TEXT) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const obj = (d: unknown) => (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
const empty = (day: number): DayEvents =>
  ({ day, convos: [], meetings: 0, games: [], other: [], speakers: {}, visitorLines: 0 });

/** Buffers one in-game day of bus events, by event name only, with hard size caps. */
export class Collector {
  private cur: DayEvents;
  constructor(day: number) { this.cur = empty(day); }

  ingest(kind: string, data: unknown) {
    const d = obj(data), c = this.cur;
    if (kind === "say") {
      const from = clip(d.from, 40), to = clip(d.to, 40), text = clip(d.text);
      if (!from || !text) return;
      if (from === "You") { c.visitorLines++; return; }
      c.speakers[from] = (c.speakers[from] ?? 0) + 1;
      const [a, b] = [from, to === "You" ? "a visitor" : to].sort();
      let last = c.convos[c.convos.length - 1];
      if (!last || last.a !== a || last.b !== b) {
        if (c.convos.length >= MAX_CONVOS) return;
        last = { a, b, lines: [] };
        c.convos.push(last);
      }
      if (last.lines.length < MAX_LINES) last.lines.push(`${from}: ${text}`);
    } else if (kind === "convo") {
      c.meetings++;
    } else if (kind === "minigame") {
      if (d.kind !== "end" || d.aborted) return;
      const winners = Array.isArray(d.winners) ? d.winners.map((w) => clip(w, 40)).join(", ") : "";
      const line = clip(d.summary) || `${clip(d.game, 30) || "A game"} ended${winners ? `, won by ${winners}` : ""}.`;
      if (c.games.length < MAX_OTHER) c.games.push(line);
    } else if (OTHER_KINDS.includes(kind)) {
      const what = clip(d.summary ?? d.text ?? d.name ?? d.title ?? d.id ?? (typeof data === "string" ? data : ""));
      if (what && c.other.length < MAX_OTHER) c.other.push(`${kind}: ${what}`);
    }
  }

  /** Close the current day and start the next one; returns the finished day. */
  rollover(nextDay: number): DayEvents {
    const done = this.cur;
    this.cur = empty(nextDay);
    return done;
  }
}
