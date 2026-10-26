// Write ops, run inside the town server. Each returns before/after and, when it can be undone,
// the op that restores `before`. Only in-memory town state and .runtime/town-data change.
import { W, H, type Town } from "../sim.js";
import type { AgentConfig } from "../types.js";
import { schemas, type Args, type OpName } from "./schema.js";
import { featureOps } from "./features.js";
import { lastUndoable, readOverlay, record, writeOverlay } from "./store.js";

export class OpError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

export interface Result { before: unknown; after: unknown; revert?: { op: string; args: unknown } }
export type Run = (args: any, dry: boolean, actor: string) => Promise<Result>;
export type Self = (path: string, body?: unknown) => Promise<any>;
type SeasonEvent = Args<"season.upsert">;
type Active = { custom: string | null; ext: { source: string; id: string | null } | null };

const strip = ({ account: _a, ...c }: AgentConfig) => c;
const rnd = (n: number) => Math.floor(Math.random() * n);

export function makeOps(town: Town) {
  let custom: string | null = null; // active custom season event id
  const self: Self = async (path, body) => {
    const init = body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    const res = await fetch(`http://127.0.0.1:${town.config.port}${path}`, { ...init, signal: AbortSignal.timeout(5_000) });
    const data = await res.json().catch(() => null);
    if (!res.ok || data === null) throw new OpError(`${path}: ${data?.error ?? `not available (HTTP ${res.status})`}`, res.status === 404 ? 404 : 502);
    return data;
  };
  const find = (name: string) => town.agents.find((a) => a.cfg.name.toLowerCase() === name.toLowerCase());
  const say = (from: string, text: string) => {
    town.addLog(from, "All", text);
    for (const a of town.agents) { a.heard.push(`${from}: ${text}`); if (a.heard.length > 20) a.heard.shift(); }
  };

  /** Puts one agent config into the live town (null removes it). Also used after /api/reload. */
  function applyAgent(name: string, cfg: AgentConfig | null) {
    const i = town.agents.findIndex((a) => a.cfg.name.toLowerCase() === name.toLowerCase());
    if (!cfg) { if (i >= 0) town.agents.splice(i, 1); return; }
    if (i >= 0) { town.agents[i].cfg = { ...cfg, account: town.agents[i].cfg.account }; return; }
    const available = cfg.provider === "mock" || town.agents.some((a) => a.cfg.provider === cfg.provider && a.available);
    const x = rnd(W), y = rnd(H);
    town.agents.push({ cfg, x, y, tx: x, ty: y, status: available ? "idle" : "unavailable", turns: 0, cooldownUntil: 0, heard: [], met: {}, available });
  }
  const restoreAgent = async ({ name, cfg }: { name: string; cfg: AgentConfig | null }, dry: boolean): Promise<Result> => {
    const cur = find(name);
    const before = cur ? strip(cur.cfg) : null;
    if (!cur && cfg && town.agents.length >= 32) throw new OpError("town is full (32 agents)");
    if (!dry) { applyAgent(name, cfg); writeOverlay("agents", cur?.cfg.name ?? name, cfg); town.broadcastState(); }
    return { before, after: cfg, revert: { op: "agent.restore", args: { name, cfg: before } } };
  };
  const seasonExt = async (): Promise<Active["ext"]> => {
    try { const s = await self("/api/season"); return { source: s.source, id: s.active?.id ?? null }; } catch { return null; }
  };
  const setActive = async (a: Active, dry: boolean): Promise<Result> => {
    const before: Active = { custom, ext: await seasonExt() };
    if (!dry) {
      custom = a.custom;
      if (before.ext && a.ext) await (a.ext.source === "manual" && a.ext.id ? self("/api/season", { id: a.ext.id }) : self("/api/season/clear", {}));
      town.broadcastState();
    }
    return { before, after: a, revert: { op: "season.active", args: before } };
  };

  const ops: Record<string, Run> = {
    ...featureOps(self),
    "agent.restore": restoreAgent,
    "agent.upsert": (a: Args<"agent.upsert">, dry) => {
      const cur = find(a.name);
      const cfg: AgentConfig = cur
        ? { ...strip(cur.cfg), ...a, name: cur.cfg.name, provider: cur.cfg.provider }
        : { personality: "a friendly newcomer", color: "#888888", provider: "mock", ...a };
      return restoreAgent({ name: cfg.name, cfg }, dry);
    },
    "personality.set": (a: Args<"personality.set">, dry) => {
      const cur = find(a.agent);
      if (!cur) throw new OpError(`unknown agent "${a.agent}"`, 404);
      return restoreAgent({ name: cur.cfg.name, cfg: { ...strip(cur.cfg), personality: a.personality } }, dry);
    },
    "place.toggle": async (a: Args<"place.toggle">, dry) => {
      const place = (await self("/api/places")).places?.find((p: { id: string }) => p.id === a.id);
      if (!place) throw new OpError(`unknown place "${a.id}"`, 404);
      const enabled = a.enabled ?? !place.enabled;
      if (!dry) await self("/api/places/toggle", { id: a.id, enabled });
      return { before: { id: a.id, enabled: place.enabled }, after: { id: a.id, enabled }, revert: { op: "place.toggle", args: { id: a.id, enabled: place.enabled } } };
    },
    "season.restore": async ({ id, event }: { id: string; event: SeasonEvent | null }, dry) => {
      const before = readOverlay<SeasonEvent>("seasons")[id] ?? null;
      if (!dry) { writeOverlay("seasons", id, event); if (!event && custom === id) custom = null; }
      return { before, after: event, revert: { op: "season.restore", args: { id, event: before } } };
    },
    "season.upsert": (a: Args<"season.upsert">, dry, actor) => ops["season.restore"]({ id: a.id, event: a }, dry, actor),
    "season.active": setActive,
    "event.trigger": async (a: Args<"event.trigger">, dry) => {
      let r: Result = { before: null, after: null };
      if (a.season === null) r = await setActive({ custom: null, ext: { source: "date", id: null } }, dry);
      else if (a.season !== undefined) {
        if (readOverlay<SeasonEvent>("seasons")[a.season]) r = await setActive({ custom: a.season, ext: await seasonExt() }, dry);
        else if (!(await seasonExt())) throw new OpError(`unknown season "${a.season}" (no custom event and no seasons extension)`, 404);
        else if (dry) r = { before: await seasonExt(), after: { source: "manual", id: a.season } };
        else {
          const before: Active = { custom, ext: await seasonExt() };
          await self("/api/season", { id: a.season });
          custom = null;
          r = { before, after: { custom: null, ext: { source: "manual", id: a.season } }, revert: { op: "season.active", args: before } };
        }
      }
      if (a.announcement && !dry) say("Town event", a.announcement);
      return { ...r, after: { season: r.after, announcement: a.announcement ?? null } };
    },
    "pause.set": async (a: Args<"pause.set">, dry) => {
      const before = town.paused;
      if (!dry) { town.paused = a.paused; town.broadcastState(); }
      return { before: { paused: before }, after: a, revert: { op: "pause.set", args: { paused: before } } };
    },
    "narrator.say": async (a: Args<"narrator.say">, dry) => {
      if (!dry) say("Narrator", a.text);
      return { before: null, after: a };
    },
  };

  /** Validates and runs a public op; logs it unless dryRun. */
  async function apply(op: string, args: unknown, actor: string, dryRun = false) {
    if (!Object.hasOwn(schemas, op)) throw new OpError(`unknown op "${op.slice(0, 40)}"`);
    const parsed = schemas[op as OpName].safeParse(args ?? {});
    if (!parsed.success) throw new OpError(parsed.error.issues.map((i) => `${i.path.join(".") || "args"}: ${i.message}`).join("; "));
    const { revert, ...r } = await ops[op](parsed.data, dryRun, actor);
    if (dryRun) return { ok: true, dryRun: true, op, ...r, undoable: !!revert };
    const c = record({ actor, op, args: parsed.data, ...r, revert });
    return { ok: true, change: c.id, op, ...r, undoable: !!revert };
  }

  /** Reverts the newest change that can be undone and logs the undo. */
  async function undo(actor: string, dryRun = false) {
    const c = lastUndoable();
    if (!c?.revert) throw new OpError("nothing to undo", 409);
    const { revert: _r, ...r } = await ops[c.revert.op](c.revert.args, dryRun, actor);
    if (dryRun) return { ok: true, dryRun: true, undoes: c.id, op: c.op, ...r };
    const u = record({ actor, op: "undo", args: { change: c.id, op: c.op }, ...r, undoOf: c.id });
    return { ok: true, change: u.id, undid: c.id, op: c.op, ...r };
  }

  const activeHint = () => { const ev = custom && readOverlay<SeasonEvent>("seasons")[custom]; return ev ? `Town event: ${ev.name}. ${ev.topicHint}` : ""; };
  return { apply, undo, applyAgent, activeHint };
}
