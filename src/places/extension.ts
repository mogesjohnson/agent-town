import type { IncomingMessage, ServerResponse } from "node:http";
import type { Town } from "../sim.js";
import { loadCatalog, type Place } from "./catalog.js";
import { assignJobs, Clock, free, isOpen, type Job, promptLines, workTick } from "./jobs.js";
import { EnabledStore } from "./store.js";

type Handler = (req: IncomingMessage, res: ServerResponse, url: URL) => unknown;
interface Ctx {
  town: Town;
  routes: { add(method: string, path: string, h: Handler): void };
  on(event: string, fn: (d: unknown) => void): void;
  promptHooks: ((prompt: string, info: { agent: string; partner: string }) => string)[];
}

/** Renderer-agnostic view of one place, in map tiles (origin top-left, same grid as agents). */
export interface PlaceView {
  id: string; name: string; type: string; sign: string; color: string; anchor?: string;
  x: number; y: number; w: number; h: number; enabled: boolean; open: boolean;
  hours: Place["hours"]; workers: { agent: string; role: string }[];
}

const send = (res: ServerResponse, code: number, o: unknown) => {
  res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o));
};
const readBody = (req: IncomingMessage) => new Promise<any>((done) => {
  let d = "";
  req.on("data", (c) => { d += c; if (d.length > 2_000) req.destroy(); });
  req.on("end", () => { try { done(JSON.parse(d || "{}")); } catch { done({}); } });
});

/** Places + pretend jobs. Loaded by src/extensions.ts; edits no server, sim or html file. */
export function register(ctx: Ctx) {
  const { town } = ctx;
  const catalog = loadCatalog();
  const store = new EnabledStore(catalog.map((p) => p.id));
  const clock = new Clock(), greeted = new Map<string, number>();
  let jobs: Job[] = [], signature = "";
  const enabled = () => catalog.filter((p) => store.isEnabled(p.id));
  const refreshJobs = () => {
    // Re-hire only when availability or toggles change, not on every status flip.
    const sig = town.agents.filter((a) => a.available).map((a) => a.cfg.name).join(",") + "|" + store.enabledIds().join(",");
    if (sig === signature) return;
    signature = sig;
    const staff = town.agents.filter(free); // skip agents another extension holds (e.g. "playing")
    jobs = assignJobs(staff.map((a) => ({ name: a.cfg.name, personality: a.cfg.personality })), enabled());
    console.log(`[places] jobs: ${jobs.map((j) => `${j.agent}=${j.role}@${j.place}`).join(", ") || "none"}`);
  };
  const views = (): PlaceView[] => catalog.map((p) => ({
    id: p.id, name: p.name, type: p.type, sign: p.sign, color: p.color, anchor: p.anchor,
    ...p.plot, ...p.footprint, enabled: store.isEnabled(p.id), open: store.isEnabled(p.id) && isOpen(p, clock.hour),
    hours: p.hours, workers: jobs.filter((j) => j.place === p.id).map((j) => ({ agent: j.agent, role: j.title })),
  }));

  const baseState = town.state.bind(town);
  town.state = () => ({ ...baseState(), places: { clock: clock.label, list: views() } });

  ctx.on("tick", () => {
    clock.advance(town.paused);
    refreshJobs();
    if (!town.paused) workTick(town, jobs, enabled(), clock.hour, greeted);
  });

  ctx.promptHooks.push((prompt, { agent }) => {
    const a = town.agents.find((x) => x.cfg.name === agent);
    if (!a) return prompt;
    const lines = promptLines(a, jobs.find((j) => j.agent === agent), enabled(), clock.hour, clock.label);
    return lines.length ? `${prompt}\n${lines.join("\n")}` : prompt;
  });

  ctx.routes.add("GET", "/api/places", (_req, res) => send(res, 200, {
    clock: clock.label,
    places: views().map((v) => {
      const p = catalog.find((c) => c.id === v.id)!;
      return { ...v, vibe: p.vibe, items: p.items, topics: p.topics };
    }),
  }));
  ctx.routes.add("POST", "/api/places/toggle", async (req, res) => {
    const b = await readBody(req);
    const id = String(b.id ?? ""), current = store.isEnabled(id);
    if (!store.set(id, typeof b.enabled === "boolean" ? b.enabled : !current)) return send(res, 404, { ok: false, error: "unknown place" });
    refreshJobs();
    town.broadcastState();
    send(res, 200, { ok: true, id, enabled: store.isEnabled(id) });
  });
  console.log(`[places] ${catalog.length} places, ${store.enabledIds().length} enabled`);
}
