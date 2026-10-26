/** Agent moods and needs: tick-driven needs, mood resolution, prompt hook and /api/moods. */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PromptHook, Routes } from "../extensions.js";
import type { Agent, Town } from "../sim.js";
import { LANDMARKS } from "../sim.js";
import {
  clamp, DEFAULT_BASELINE, emojiFor, MOOD_CONFIG as C, needMood, NEEDS, Needs, NUDGE, restingHappiness, round,
} from "./model.js";

interface MoodState { needs: Needs; override: { mood: string; until: number } | null }
type Ctx = {
  town: Town; clients: Set<ServerResponse>; routes: Routes; promptHooks: PromptHook[];
  on: (e: string, fn: (d: any) => void) => void;
};

/** getPersonality from src/personalities/store.ts (PR #9) when present; loaded lazily so this compiles without it. */
let getPersonality: ((name: string) => { mood?: string } | undefined) | null = null;
async function loadPersonalities() {
  const spec = "../personalities/store.js"; // variable specifier: tsc does not need the module
  try { getPersonality = (await import(spec)).getPersonality ?? null; } catch { getPersonality = null; }
}
/** Read live on every call (the store re-reads town.personalities.json); falls back to "calm". */
export function baselineOf(name: string): string {
  try { return getPersonality?.(name)?.mood || DEFAULT_BASELINE; } catch { return DEFAULT_BASELINE; }
}

const states = new Map<string, MoodState>();
const msPerGameMinute = () => 400 / C.gameMinutesPerTick;

function stateOf(name: string): MoodState {
  let s = states.get(name);
  if (!s) {
    s = { needs: { ...C.start, happiness: restingHappiness(baselineOf(name)) }, override: null };
    states.set(name, s);
  }
  return s;
}

export function moodOf(name: string) {
  const s = stateOf(name), baseline = baselineOf(name);
  if (s.override && s.override.until <= Date.now()) s.override = null;
  const mood = s.override?.mood ?? needMood(s.needs) ?? baseline;
  return {
    agent: name, baseline, mood, emoji: emojiFor(mood), needs: round(s.needs),
    override: s.override ? { mood: s.override.mood, until: new Date(s.override.until).toISOString() } : null,
  };
}

const inside = (a: Agent, place: string) => {
  const l = LANDMARKS.find((x) => x.name === place);
  return !!l && a.x >= l.x && a.x < l.x + l.w && a.y >= l.y && a.y < l.y + l.h;
};
const centre = (place: string) => {
  const l = LANDMARKS.find((x) => x.name === place);
  return l && { x: l.x + Math.floor(l.w / 2), y: l.y + Math.floor(l.h / 2) };
};

/** Advance one tick of in-game time for one agent, and steer it toward what it needs. */
function step(town: Town, a: Agent) {
  const m = C.gameMinutesPerTick, n = stateOf(a.cfg.name).needs;
  const eating = inside(a, C.eatAt), resting = inside(a, C.restAt) && a.status === "idle";
  n.hunger = clamp(n.hunger + (eating ? C.eatRate : C.rates.hunger) * m);
  n.energy = clamp(n.energy + (resting ? C.restRate : C.rates.energy) * m);
  n.social = clamp(n.social + (a.status === "chatting" ? 0 : C.rates.social * m));
  const lows = (["hunger", "energy", "social"] as const).filter((k) => n[k] < C.lowThreshold).length;
  const rest = restingHappiness(baselineOf(a.cfg.name));
  n.happiness = clamp(n.happiness + (rest - n.happiness) * C.happinessDrift * m - lows * C.lowNeedHappinessPenalty * m);
  if (a.status !== "idle" || a.x !== a.tx || a.y !== a.ty) return;
  const need = needMood(n);
  const target =
    need === "hungry" && !eating ? centre(C.eatAt)
    : need === "tired" && !inside(a, C.restAt) ? centre(C.restAt)
    : need === "lonely" ? town.agents.filter((b) => b !== a && b.available)
        .sort((p, q) => Math.abs(p.x - a.x) + Math.abs(p.y - a.y) - Math.abs(q.x - a.x) - Math.abs(q.y - a.y))[0]
    : undefined;
  if (target) { a.tx = target.x; a.ty = target.y; }
}

/** Insert before the "You are talking with" line (like personalities), else append. No "Mood:" line: PR #9 adds that. */
export const moodsPromptHook: PromptHook = (prompt, { agent }) => {
  const m = moodOf(agent), n = m.needs;
  const line = `Right now you feel: ${m.mood} (baseline: ${m.baseline}). Needs: hunger ${n.hunger}, energy ${n.energy}, ` +
    `social ${n.social}, happiness ${n.happiness}. ${NUDGE[m.mood] ?? "Let this colour how you talk."}`;
  const at = prompt.indexOf("\nYou are talking with ");
  return at === -1 ? `${prompt}\n${line}` : `${prompt.slice(0, at)}\n${line}${prompt.slice(at)}`;
};

function send(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => { d += c; if (d.length > 10_000) { reject(new Error("body too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch { reject(new Error("invalid JSON")); } });
  });
}

/** Validate a POST body; returns an error string or applies it. */
function apply(name: string, b: any): string | null {
  if (!b || typeof b !== "object" || Array.isArray(b)) return "body must be a JSON object";
  const { mood, needs, durationMinutes } = b;
  if (mood !== undefined && mood !== null && (typeof mood !== "string" || !/^[a-z][a-z-]{0,23}$/.test(mood)))
    return "mood must be a lowercase word (a-z, -), at most 24 chars, or null to clear";
  if (durationMinutes !== undefined && (typeof durationMinutes !== "number" || !Number.isFinite(durationMinutes)
    || durationMinutes <= 0 || durationMinutes > C.maxOverrideMinutes))
    return `durationMinutes must be a number in (0, ${C.maxOverrideMinutes}]`;
  if (needs !== undefined) {
    if (!needs || typeof needs !== "object" || Array.isArray(needs)) return "needs must be an object";
    for (const [k, v] of Object.entries(needs)) {
      if (!(NEEDS as readonly string[]).includes(k)) return `unknown need: ${k}`;
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) return `${k} must be a number 0-100`;
    }
  }
  const s = stateOf(name);
  if (needs) Object.assign(s.needs, needs);
  if (mood === null) s.override = null;
  else if (mood !== undefined)
    s.override = { mood, until: Date.now() + (durationMinutes ?? C.defaultOverrideMinutes) * msPerGameMinute() };
  return null;
}

export async function register(ctx: Ctx) {
  await loadPersonalities();
  const { town, clients } = ctx;
  const all = () => ({ agents: town.agents.map((a) => moodOf(a.cfg.name)) });
  const broadcast = () => {
    const msg = `event: moods\ndata: ${JSON.stringify(all())}\n\n`;
    for (const c of clients) c.write(msg);
  };

  ctx.promptHooks.push(moodsPromptHook);
  ctx.on("convo", ({ a, b }: { a: string; b: string }) => {
    for (const n of [a, b]) {
      const s = stateOf(n).needs;
      s.social = clamp(s.social + C.convoSocial); s.happiness = clamp(s.happiness + C.convoHappiness);
    }
  });
  ctx.on("say", ({ from }: { from: string }) => {
    if (town.agents.some((a) => a.cfg.name === from)) { const s = stateOf(from).needs; s.social = clamp(s.social + C.saySocial); }
  });
  let ticks = 0;
  ctx.on("tick", () => {
    if (!town.paused) for (const a of town.agents) if (a.available) step(town, a);
    if (++ticks % C.broadcastEveryTicks === 0) broadcast();
  });

  ctx.routes.add("GET", "/api/moods", (_req, res) => send(res, 200, all()));
  // Params arrive URL-decoded from Routes; the name matches case-insensitively.
  ctx.routes.add("POST", "/api/moods/:agent", async (req, res, _url, { agent: raw }) => {
    const a = town.agents.find((x) => x.cfg.name.toLowerCase() === raw.toLowerCase());
    if (!a) return send(res, 404, { error: "unknown agent" });
    let b: unknown;
    try { b = await readJson(req); } catch (e) { return send(res, 400, { error: (e as Error).message }); }
    const err = apply(a.cfg.name, b);
    if (err) return send(res, 400, { error: err });
    broadcast();
    send(res, 200, moodOf(a.cfg.name));
  });
}
