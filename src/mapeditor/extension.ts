import type { IncomingMessage, ServerResponse } from "node:http";
import { LANDMARKS, type Town } from "../sim.js";
import { TownMap, MapError, TILE_TYPES, BUILDING_TYPES } from "./model.js";

type Ctx = {
  town: Town;
  clients: Set<ServerResponse>;
  routes: { add: (method: string, path: string, h: (req: IncomingMessage, res: ServerResponse, url: URL) => unknown) => void };
  on: (event: string, fn: (d: unknown) => void) => void;
};

const LOCAL = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const send = (res: ServerResponse, status: number, o: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(o));
};

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => { d += c; if (d.length > 256_000) { reject(new MapError("body too large", 413)); req.destroy(); } });
    req.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch { reject(new MapError("invalid JSON body")); } });
  });
}

const actorOf = (b: any) => String(b?.actor ?? b?.author ?? "unknown").slice(0, 40) || "unknown";

/** Map editor: tile/building edits with an undoable, actor-tagged log, over /api/map*. */
export function register(ctx: Ctx) {
  const tm = new TownMap();

  // The sim walks agents to LANDMARKS, so mirror buildings into it in place.
  const syncSim = () => {
    LANDMARKS.splice(0, LANDMARKS.length, ...tm.map.buildings.map((b) => ({
      name: b.name ?? b.id, x: b.x, y: b.y, w: b.w, h: b.h, color: BUILDING_TYPES[b.type].color,
    })));
    ctx.town.broadcastState();
  };
  const changed = (actor: string, kind: string, changes: unknown) => {
    const msg = `event: map:changed\ndata: ${JSON.stringify({ version: tm.version, actor, kind, changes })}\n\n`;
    for (const c of ctx.clients) c.write(msg);
    syncSim();
  };
  // Agents never pick a water tile as a walk target.
  ctx.on("tick", () => {
    for (const a of ctx.town.agents) if (tm.tile(a.tx, a.ty) === "water") { a.tx = a.x; a.ty = a.y; }
  });

  const route = (method: string, path: string, fn: (b: any, url: URL) => unknown) =>
    ctx.routes.add(method, path, async (req, res, url) => {
      if (!LOCAL.has(req.socket.remoteAddress ?? "")) return send(res, 403, { ok: false, error: "local requests only" });
      try {
        const b = method === "POST" ? await readBody(req) : {};
        send(res, 200, await fn(b, url));
      } catch (e) {
        const status = e instanceof MapError ? e.status : 500;
        send(res, status, { ok: false, error: (e as Error).message });
      }
    });

  route("GET", "/api/map", () => tm.json());
  route("GET", "/api/map/palette", () => ({ tiles: TILE_TYPES, buildings: Object.keys(BUILDING_TYPES) }));
  route("GET", "/api/map/history", (_b, url) => {
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit")) || 50));
    return tm.history.slice(-limit).reverse().map(({ before: _, ...e }) => e);
  });
  route("POST", "/api/map/tiles", (b) => {
    const actor = actorOf(b), { edit, changed: cells } = tm.setTiles(b.tiles, actor);
    changed(actor, "tiles", { tiles: cells });
    return { ok: true, version: tm.version, changed: cells.length, editId: edit.editId };
  });
  route("POST", "/api/map/buildings", (b) => {
    const actor = actorOf(b), { edit, building } = tm.building(b, actor);
    changed(actor, edit.kind, { op: b.op, building });
    return { ok: true, building, version: tm.version, editId: edit.editId };
  });
  route("POST", "/api/map/undo", (b) => {
    const actor = actorOf(b), { edit, undone } = tm.undo(b.editId, actor);
    changed(actor, "undo", { undoneEditId: undone.editId, map: tm.json() });
    return { ok: true, version: tm.version, undoneEditId: undone.editId, editId: edit.editId };
  });
  route("POST", "/api/map/load", (b) => {
    const actor = actorOf(b), edit = tm.load(b.map, actor);
    changed(actor, "load", { map: tm.json() });
    return { ok: true, version: tm.version, editId: edit.editId };
  });
  syncSim();
}
