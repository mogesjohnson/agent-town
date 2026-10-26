// Headless day: runs the real sim with every agent on the built-in mock adapter, on a virtual
// clock (Date.now and setTimeout/setInterval scaled by `speed`) with a seeded Math.random,
// and records it. No server, no CLIs, no network.
import { Town } from "../sim.js";
import { loadConfig } from "../config.js";
import { mock } from "../plugins/mock.js";
import { Adapter } from "../types.js";
import { Recorder } from "./recorder.js";

export interface HeadlessOptions { out: string; seed?: number; minutes?: number; speed?: number; visitor?: string }

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function recordHeadlessDay(o: HeadlessOptions) {
  const seed = o.seed ?? 7, minutes = o.minutes ?? 6, speed = o.speed ?? 20;
  const real = { now: Date.now, setTimeout: globalThis.setTimeout, setInterval: globalThis.setInterval, random: Math.random };
  const t0 = real.now();
  Date.now = () => t0 + (real.now() - t0) * speed;
  globalThis.setTimeout = ((fn: () => void, ms = 0, ...a: unknown[]) => real.setTimeout(fn, ms / speed, ...a)) as typeof setTimeout;
  Math.random = mulberry32(seed);
  try {
    const base = loadConfig();
    const config = { ...base, agents: base.agents.map((a) => ({ ...a, provider: "mock" as const, model: undefined, account: undefined })) };
    const rec = new Recorder(o.out, { seed, source: "headless", startedAt: new Date(t0).toISOString() });
    const town = new Town(config, new Map<string, Adapter>([["mock", mock]]), (ev, data) => rec.record(ev, data));
    town.setAgents(config.agents, new Map([["mock", { available: true, account: "built-in" }]]));
    town.broadcastState();
    const tick = real.setInterval(() => town.tick(), 400 / speed);
    const dayMs = minutes * 60_000;
    if (o.visitor) real.setTimeout(() => void town.human("*", o.visitor!), dayMs / 3 / speed);
    await new Promise((r) => real.setTimeout(r, dayMs / speed));
    clearInterval(tick);
    town.paused = true; // let in-flight conversations stop at their next turn
    await new Promise((r) => real.setTimeout(r, 1500 / speed));
    await rec.close();
    return { lines: rec.lines, usage: { ...town.usage }, seed, minutes, speed };
  } finally {
    Date.now = real.now; globalThis.setTimeout = real.setTimeout; Math.random = real.random;
  }
}
