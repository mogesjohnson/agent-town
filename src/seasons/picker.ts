import { parseMonthDay } from "./loader.js";
import { DateWindow, SeasonEvent } from "./types.js";

/** Month/day as one sortable number, e.g. Oct 31 is 1031. */
const key = (month: number, day: number) => month * 100 + day;
const keyOf = (s: string) => { const [m, d] = parseMonthDay(s)!; return key(m, d); };

/** True when `date` (local time) is inside the inclusive window; `from` after `to` wraps the year end. */
export function inWindow(date: Date, w: DateWindow): boolean {
  const k = key(date.getMonth() + 1, date.getDate()), from = keyOf(w.from), to = keyOf(w.to);
  return from <= to ? k >= from && k <= to : k >= from || k <= to;
}

/** Days covered by a window in a leap year, used to prefer the more specific event. */
function span(w: DateWindow): number {
  const doy = (s: string) => { const [m, d] = parseMonthDay(s)!; return (Date.UTC(2024, m - 1, d) - Date.UTC(2024, 0, 1)) / 86_400_000; };
  const n = doy(w.to) - doy(w.from);
  return (n >= 0 ? n : n + 366) + 1;
}

/**
 * The event whose window contains `date`, or null. Ties are broken in order:
 * higher priority, then the shorter matching window (more specific), then id A to Z,
 * so the result never depends on file order.
 */
export function pickFrom(events: readonly SeasonEvent[], date: Date): SeasonEvent | null {
  let best: SeasonEvent | null = null, bestSpan = Infinity;
  for (const ev of events) {
    const hits = ev.windows.filter((w) => inWindow(date, w));
    if (!hits.length) continue;
    const s = Math.min(...hits.map(span));
    if (!best || ev.priority > best.priority
      || (ev.priority === best.priority && (s < bestSpan || (s === bestSpan && ev.id < best.id)))) {
      best = ev; bestSpan = s;
    }
  }
  return best;
}
