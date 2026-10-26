import type { ServerResponse } from "node:http";
import type { Town } from "../sim.js";
import type { TownConfig } from "../types.js";
import { buildAdapters } from "../plugins/index.js";
import { DayClock } from "./clock.js";
import { Collector, EVENT_KINDS } from "./collector.js";
import { loadNewspaperConfig } from "./config.js";
import { Rumors } from "./rumors.js";
import { Store } from "./store.js";
import { writePaper } from "./writer.js";

type Handler = (req: unknown, res: ServerResponse, url: URL) => unknown;
interface Ctx { town: Town; config: TownConfig; routes: { add(method: string, path: string, h: Handler): void }; on(event: string, fn: (d: unknown) => void): unknown }

/** Town newspaper: collects each in-game day from the bus and prints a paper every morning. */
export function register(ctx: Ctx) {
  const cfg = loadNewspaperConfig(ctx.config);
  if (!cfg.enabled) { console.log("[newspaper] disabled"); return; }
  const store = new Store(cfg.dataDir);
  const clock = new DayClock(cfg.dayMinutes * 60_000);
  const collector = new Collector(clock.day);
  const rumors = new Rumors(store.loadRumors());
  const adapter = cfg.provider === "mock" ? undefined : buildAdapters(ctx.config).get(cfg.provider);
  const names = () => ctx.town.agents.map((a) => a.cfg.name);
  let sessionCalls = 0, busy = false;

  async function morning() {
    const ev = collector.rollover(clock.day);
    if (busy) return;
    busy = true;
    try {
      const paper = store.save(await writePaper(ev, {
        adapter, cfg, past: store.recent(3), rumors: rumors.active(ev.day), names: names(),
        allow: () => sessionCalls < cfg.maxCallsPerSession && store.callsToday() < cfg.maxCallsPerRealDay,
        onCall: () => { sessionCalls++; store.countCall(); },
      }));
      store.saveRumors(rumors.all);
      console.log(`[newspaper] issue ${paper.issue} (day ${paper.day}, ${paper.source}): ${paper.headline}`);
    } catch (e) { console.error(`[newspaper] ${(e as Error).message}`); } finally { busy = false; }
  }

  ctx.on("tick", () => { if (clock.tick(ctx.town.paused)) void morning(); });
  for (const k of ["day", "clock"]) ctx.on(k, (d) => { if (clock.set(Number((d as { day?: unknown })?.day))) void morning(); });
  for (const k of EVENT_KINDS) ctx.on(k, (d) => { collector.ingest(k, d); if (k === "say") rumors.hear(d, names(), clock.day); });

  const send = (res: ServerResponse, body: unknown) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  ctx.routes.add("GET", "/api/newspaper/today", (_q, res) => send(res, store.latest()));
  ctx.routes.add("GET", "/api/newspaper/issues", (_q, res) => send(res, store.list()));
  ctx.routes.add("GET", "/api/newspaper/issue", (_q, res, url) => send(res, store.get(Number(url.searchParams.get("n")))));
  console.log(`[newspaper] writer ${cfg.provider}/${cfg.model}, day = ${cfg.dayMinutes} min, data in ${cfg.dataDir}`);
}
