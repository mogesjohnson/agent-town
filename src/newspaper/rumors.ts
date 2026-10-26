export interface Hop { from: string; to: string; text: string; day: number }
export interface Rumor { id: number; about: string; origin: string; heard: string[]; hops: Hop[]; firstDay: number; lastDay: number }

const MAX_RUMORS = 30, MAX_HOPS = 8;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Cheap rumor tracking, no model calls: a line that mentions a third agent starts a rumor about
 * them, and when someone who heard it mentions that agent again, the rumor gains a hop.
 * Each hop keeps its own wording, so the paper can show how the story changed.
 */
export class Rumors {
  constructor(public all: Rumor[] = []) {}

  hear(data: unknown, names: string[], day: number) {
    const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const from = String(d.from ?? ""), to = String(d.to ?? "");
    const text = String(d.text ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!from || from === "You" || !text) return;
    for (const about of names) {
      if (about === from || about === to || !new RegExp(`\\b${esc(about)}\\b`, "i").test(text)) continue;
      let r = this.all.find((x) => x.about === about && (x.origin === from || x.heard.includes(from)));
      if (!r) {
        r = { id: (this.all[this.all.length - 1]?.id ?? 0) + 1, about, origin: from, heard: [], hops: [], firstDay: day, lastDay: day };
        this.all.push(r);
        if (this.all.length > MAX_RUMORS) this.all.shift();
      }
      if (r.hops.length >= MAX_HOPS) continue;
      r.hops.push({ from, to, text, day });
      r.lastDay = day;
      if (to && !r.heard.includes(to)) r.heard.push(to);
    }
  }

  /** Rumors that spread on the given day. */
  active(day: number) { return this.all.filter((r) => r.lastDay === day && r.hops.length > 0); }
}

export function describeRumor(r: Rumor): string {
  const chain = [r.origin];
  for (const h of r.hops) for (const n of [h.from, h.to]) if (n && chain[chain.length - 1] !== n) chain.push(n);
  const first = r.hops[0].text, last = r.hops[r.hops.length - 1].text;
  const since = r.firstDay === r.lastDay ? "" : ` since day ${r.firstDay}`;
  return `Rumor about ${r.about}, started by ${r.origin}${since}: ${chain.join(" → ")} (${r.hops.length} hop${r.hops.length > 1 ? "s" : ""}). `
    + `It began as "${first}"${r.hops.length > 1 ? ` and is now "${last}"` : ""}.`;
}
