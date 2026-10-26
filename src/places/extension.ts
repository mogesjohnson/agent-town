import type { IncomingMessage, ServerResponse } from "node:http";
import type { Town } from "../sim.js";
import { loadCatalog, type Place } from "./catalog.js";
import { type Building, followAnchors } from "./anchors.js";
import { LANDMARKS } from "../sim.js";
import { assignJobs, Clock, endShifts, free, isOpen, type Job, promptLines, retarget, type Shifts, workTick, WORKING } from "./jobs.js";
import { acceptSaved, buildPlace, typeList } from "./custom.js";
import { EnabledStore } from "./store.js";

type Handler = (req: IncomingMessage, res: ServerResponse, url: URL, params: Record<string, string>) => unknown;
interface Ctx {
  town: Town;
  routes: { add(method: string, path: string, h: Handler): void };
  on(event: string, fn: (d: unknown) => void): void;
  promptHooks: ((prompt: string, info: { agent: string; partner: string }) => string)[];
  chattyStatuses?: Set<string>; // from #15 83f7542; absent on older loaders
  config?: { port?: number };
}

/** Renderer-agnostic view of one place, in map tiles (origin top-left, same grid as agents). */
export interface PlaceView {
  id: string; name: string; type: string; sign: string; color: string; anchor?: string;
  x: number; y: number; w: number; h: number; enabled: boolean; open: boolean; detached: boolean; custom: boolean;
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
  ctx.chattyStatuses?.add(WORKING); // on-shift staff can still chat with visitors, using the job prompt
  const catalog = loadCatalog();
  const store = new EnabledStore(catalog.map((p) => p.id), undefined, (raw) => acceptSaved(raw, catalog));
  catalog.push(...store.custom);
  const clock = new Clock(), greeted = new Map<string, number>(), shifts: Shifts = new Map();
  let jobs: Job[] = [], signature = "";
  // Custom places first, so a new place gets staff (still at most half the town works).
  const enabled = () => catalog.filter((p) => store.isEnabled(p.id)).sort((a, b) => Number(!!b.custom) - Number(!!a.custom));
  const refreshJobs = () => {
    // Re-hire only when availability or toggles change, not on every status flip.
    const sig = town.agents.filter((a) => a.available).map((a) => a.cfg.name).join(",") + "|" + store.enabledIds().join(",");
    if (sig === signature) return;
    signature = sig;
    const staff = town.agents.filter(free); // skip agents another extension holds (e.g. "playing")
    jobs = assignJobs(staff.map((a) => ({ name: a.cfg.name, personality: a.cfg.personality })), enabled());
    // Job removed or place toggled off: end those shifts now, even while paused.
    endShifts(town, shifts, (name, place) => jobs.some((j) => j.agent === name && j.place === place));
    console.log(`[places] jobs: ${jobs.map((j) => `${j.agent}=${j.role}@${j.place}`).join(", ") || "none"}`);
  };
  // Called from state() too, so the broadcast right after a map edit already shows the new spot.
  let buildings: Building[] | undefined, seen = "", reading = false;
  const follow = () => {
    for (const id of followAnchors(catalog, buildings)) {
      const p = catalog.find((c) => c.id === id)!;
      console.log(`[places] ${id} ${p.detached ? `detached: building ${p.anchor} is gone` : `follows ${p.anchor} to ${p.plot.x},${p.plot.y}`}`);
      if (p.detached) endShifts(town, shifts, (_n, place) => place !== id);
      else if (store.isEnabled(id)) retarget(town, jobs, p, clock.hour, shifts);
    }
  };
  // Every editor edit (load included) rewrites LANDMARKS; then re-read building ids once.
  const readMap = () => {
    const sig = JSON.stringify(LANDMARKS);
    if (sig === seen || reading || !ctx.config?.port) return;
    seen = sig; reading = true;
    fetch(`http://127.0.0.1:${ctx.config.port}/api/map`, { signal: AbortSignal.timeout(2_000) })
      .then((r) => (r.ok ? r.json() : undefined)) // 404 without the editor: match LANDMARKS names
      .then((m: any) => { buildings = Array.isArray(m?.buildings) ? m.buildings : undefined; })
      .catch(() => { seen = ""; }) // server not listening yet: retry next tick
      .finally(() => { reading = false; follow(); });
  };
  const views = (): PlaceView[] => (follow(), catalog).map((p) => ({
    id: p.id, name: p.name, type: p.type, sign: p.sign, color: p.color, anchor: p.anchor,
    ...p.plot, ...p.footprint, enabled: store.isEnabled(p.id), detached: !!p.detached, custom: !!p.custom, open: store.isEnabled(p.id) && isOpen(p, clock.hour),
    hours: p.hours, workers: jobs.filter((j) => j.place === p.id).map((j) => ({ agent: j.agent, role: j.title })),
  }));

  const baseState = town.state.bind(town);
  town.state = () => ({ ...baseState(), places: { clock: clock.label, list: views() } });

  ctx.on("tick", () => {
    clock.advance(town.paused);
    refreshJobs();
    readMap();
    follow();
    if (!town.paused) workTick(town, jobs, enabled(), clock.hour, greeted, shifts);
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
  const detail = (id: string) => {
    const v = views().find((x) => x.id === id)!, p = catalog.find((c) => c.id === id)!;
    return { ...v, vibe: p.vibe, items: p.items, topics: p.topics };
  };
  ctx.routes.add("POST", "/api/places/:id/move", async (req, res, _url, params) => {
    const p = catalog.find((c) => c.id === params.id);
    if (!p) return send(res, 404, { ok: false, error: "unknown place" });
    if (!p.custom) return send(res, 403, { ok: false, error: "move the built-in place's anchor building instead" });
    const b = await readBody(req);
    if (!b || typeof b !== "object" || Array.isArray(b)
      || Object.keys(b).some((k) => !["x", "y", "dryRun"].includes(k))
      || !Number.isInteger(b.x) || !Number.isInteger(b.y)
      || (b.dryRun !== undefined && typeof b.dryRun !== "boolean"))
      return send(res, 400, { ok: false, error: "integer x and y, optional boolean dryRun required" });
    const before = detail(p.id);
    const r = buildPlace({ ...before, x: b.x, y: b.y }, catalog.filter((c) => c !== p));
    if (!("place" in r)) return send(res, r.status, { ok: false, error: r.error });
    if (!b.dryRun) {
      Object.assign(p, r.place); // catalog and persisted custom list share this object
      store.set(p.id, before.enabled); // preserve open/closed setting and save once
      retarget(town, jobs, p, clock.hour, shifts);
      town.broadcastState();
    }
    send(res, 200, { ok: true, dryRun: !!b.dryRun,
      place: b.dryRun ? { ...before, x: b.x, y: b.y } : detail(p.id) });
  });
  ctx.routes.add("GET", "/api/places/types", (_req, res) => send(res, 200, { types: typeList(catalog) }));
  ctx.routes.add("POST", "/api/places/preview", async (req, res) => {
    const r = buildPlace(await readBody(req), catalog);
    if (!("place" in r)) return send(res, r.status, { ok: false, error: r.error });
    const { plot, footprint, roles: _roles, ...p } = r.place;
    send(res, 200, { ok: true, place: { ...p, ...plot, ...footprint, enabled: true } });
  });
  ctx.routes.add("POST", "/api/places", async (req, res) => {
    const r = buildPlace(await readBody(req), catalog);
    if (!("place" in r)) return send(res, r.status, { ok: false, error: r.error });
    catalog.push(r.place);
    store.addCustom(r.place);
    refreshJobs();
    town.broadcastState();
    console.log(`[places] created ${r.place.id} at ${r.place.plot.x},${r.place.plot.y}`);
    send(res, 201, { ok: true, place: detail(r.place.id) });
  });
  ctx.routes.add("DELETE", "/api/places/:id", (_req, res, _url, params) => {
    const p = catalog.find((c) => c.id === params.id);
    if (!p) return send(res, 404, { ok: false, error: "unknown place" });
    if (!p.custom) return send(res, 403, { ok: false, error: "built-in places cannot be deleted" });
    catalog.splice(catalog.indexOf(p), 1);
    store.removeCustom(p.id);
    refreshJobs(); // its jobs go; endShifts sets idle only if still working
    town.broadcastState();
    console.log(`[places] deleted ${p.id}`);
    send(res, 200, { ok: true, id: p.id });
  });
  console.log(`[places] ${catalog.length} places, ${store.enabledIds().length} enabled`);
}
