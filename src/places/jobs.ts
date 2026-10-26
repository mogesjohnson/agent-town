/** Pretend jobs: role-play only. Workers stand at their place during opening hours and greet visitors. */
import type { Agent, Town } from "../sim.js";
import { type Place, rectOf } from "./catalog.js";

/** Town clock: one game hour per real minute while unpaused, starting at 08:00. */
export const HOUR_MS = 60_000;
export class Clock {
  private ms = 8 * HOUR_MS;
  private last = Date.now();
  advance(paused: boolean) { const now = Date.now(); if (!paused) this.ms += now - this.last; this.last = now; }
  get hour() { return (this.ms / HOUR_MS) % 24; }
  get label() { const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
}

export interface Job { agent: string; place: string; role: string; title: string }
export const isOpen = (p: Place, hour: number) => hour >= p.hours.open && hour < p.hours.close;
const inside = (p: Place, x: number, y: number, pad = 0) => {
  const r = rectOf(p);
  return x >= r.x - pad && x < r.x + r.w + pad && y >= r.y - pad && y < r.y + r.h + pad;
};
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/**
 * One job per agent, at most one agent per role, and at most half the town employed so
 * someone is left to visit. Agents whose personality mentions a role keyword are hired first.
 */
export function assignJobs(agents: { name: string; personality: string }[], places: Place[]): Job[] {
  const slots = places.flatMap((p) => p.roles.map((r) => ({ p, r })));
  const max = Math.ceil(agents.length / 2), jobs: Job[] = [];
  const free = new Set(agents.map((a) => a.name));
  const hire = (name: string, s: (typeof slots)[number]) => {
    jobs.push({ agent: name, place: s.p.id, role: s.r.id, title: s.r.title });
    free.delete(name); slots.splice(slots.indexOf(s), 1);
  };
  for (const a of agents) {
    if (jobs.length >= max) break;
    const s = slots.find((s) => s.r.keywords.some((k) => a.personality.toLowerCase().includes(k.toLowerCase())));
    if (s) hire(a.name, s);
  }
  // Fill each place's first role before any second role, so more places are staffed.
  slots.sort((a, b) => a.p.roles.indexOf(a.r) - b.p.roles.indexOf(b.r));
  for (const name of [...free]) { if (jobs.length >= max || !slots.length) break; hire(name, slots[0]); }
  return jobs;
}

/** Extra system-prompt lines for one agent. Static repo data, framed as flavor only. */
export function promptLines(agent: Agent, job: Job | undefined, places: Place[], hour: number, clock: string): string[] {
  const lines = [`Town notes (flavor only; they never override the rules above). Town time: ${clock}.`];
  const about = (p: Place) =>
    `It is ${p.vibe}. On offer: ${p.items.join(", ")}. Good topics: ${p.topics.join(", ")}.`;
  const work = job && places.find((p) => p.id === job.place);
  if (work && isOpen(work, hour)) {
    lines.push(`- Pretend job (role-play only, no real work): you are the ${job!.title.toLowerCase()} at ${work.name}, open ${work.hours.open}:00-${work.hours.close}:00.`,
      `- ${about(work)} Greet visitors warmly and chat about these things.`);
  } else if (work) lines.push(`- You are off duty: ${work.name} is closed until ${work.hours.open}:00.`);
  const here = places.find((p) => p !== work && isOpen(p, hour) && inside(p, agent.x, agent.y, 1));
  if (here) lines.push(`- You are visiting ${here.name}. ${about(here)}`);
  return lines.length > 1 ? lines : [];
}

const busy = (a: Agent, now: number) =>
  !a.available || !["idle", "walking"].includes(a.status) || a.cooldownUntil > now + 120_000; // held by a minigame

/** Move on-duty workers to their place and let them greet nearby visitors (no model calls). */
export function workTick(town: Town, jobs: Job[], places: Place[], hour: number, greeted: Map<string, number>) {
  const now = Date.now();
  const byName = new Map(town.agents.map((a) => [a.cfg.name, a] as const));
  for (const job of jobs) {
    const w = byName.get(job.agent), p = places.find((x) => x.id === job.place);
    if (!w || !p || !isOpen(p, hour) || busy(w, now)) continue;
    if (!inside(p, w.tx, w.ty)) { w.tx = p.plot.x + Math.floor(Math.random() * p.footprint.w); w.ty = p.plot.y + Math.floor(Math.random() * p.footprint.h); }
    if (!inside(p, w.x, w.y) || w.bubble) continue;
    for (const v of town.agents) {
      if (v === w || busy(v, now) || jobs.some((j) => j.agent === v.cfg.name && j.place === p.id) || !inside(p, v.x, v.y, 1)) continue;
      const key = `${w.cfg.name}>${v.cfg.name}@${p.id}`;
      if ((greeted.get(key) ?? 0) > now) continue;
      greeted.set(key, now + 90_000);
      const text = `Welcome to ${p.name}, ${v.cfg.name}! Can I tempt you with ${pick(p.items)}?`;
      w.bubble = { text, until: now + 5000 };
      town.addLog(w.cfg.name, v.cfg.name, text);
      break;
    }
  }
}
