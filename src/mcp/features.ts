// Ops for other features' routes: the map editor (/api/map*) and moods (/api/moods*).
// The town checks everything again; these add palette checks, dryRun previews and revert info.
import type { Args } from "./schema.js";
import { OpError, type Run, type Self } from "./ops.js";

type Building = { id: string; type: string; x: number; y: number; w: number; h: number; name?: string };
type MapJson = { width: number; height: number; tiles: string[][]; buildings: Building[]; version: number };

/** The map editor tags edits with "claude" or "codex". */
const who = (actor: string) => (/codex/i.test(actor) ? "codex" : "claude");

export function featureOps(self: Self): Record<string, Run> {
  const map = (): Promise<MapJson> => self("/api/map");
  const palette = (): Promise<{ tiles: string[]; buildings: string[] } | null> => self("/api/map/palette").catch(() => null);
  const inside = (m: MapJson, x: number, y: number) => {
    if (x >= m.width || y >= m.height) throw new OpError(`cell ${x},${y} is outside the ${m.width}x${m.height} map`);
  };
  const building = (m: MapJson, id: string) => {
    const b = m.buildings.find((o) => o.id === id);
    if (!b) throw new OpError(`no building with id ${id}`, 404);
    return b;
  };
  /** Runs one map edit (or previews it) and reverts it later with the editor's own undo of that edit. */
  const edit = async (path: string, body: object, dry: boolean, actor: string, before: unknown, preview: unknown) => {
    if (dry) return { before, after: preview };
    const r = await self(path, { ...body, actor: who(actor) });
    return { before, after: r, revert: r.editId ? { op: "map.undo", args: { editId: r.editId } } : undefined };
  };

  return {
    "map.paint": async (a: Args<"map.paint">, dry, actor) => {
      const [m, pal] = await Promise.all([map(), palette()]);
      for (const t of a.tiles) {
        inside(m, t.x, t.y);
        if (pal && !pal.tiles.includes(t.type)) throw new OpError(`unknown tile type ${t.type}; palette: ${pal.tiles.join(", ")}`);
      }
      const before = a.tiles.map(({ x, y }) => ({ x, y, type: m.tiles[y]?.[x] }));
      return edit("/api/map/tiles", { tiles: a.tiles }, dry, actor, before, a.tiles);
    },
    "map.add": async (a: Args<"map.add">, dry, actor) => {
      const [m, pal] = await Promise.all([map(), palette()]);
      inside(m, a.x, a.y);
      if (pal && !pal.buildings.includes(a.type)) throw new OpError(`unknown building type ${a.type}; palette: ${pal.buildings.join(", ")}`);
      if (a.id && m.buildings.some((b) => b.id === a.id)) throw new OpError(`id ${a.id} already exists`, 409);
      return edit("/api/map/buildings", { op: "add", ...a }, dry, actor, null, { ...a, note: "overlap is checked when applied" });
    },
    "map.move": async (a: Args<"map.move">, dry, actor) => {
      const m = await map();
      inside(m, a.x, a.y);
      const b = building(m, a.id);
      return edit("/api/map/buildings", { op: "move", ...a }, dry, actor, b, { ...b, x: a.x, y: a.y, ...(a.name ? { name: a.name } : {}) });
    },
    "map.remove": async (a: Args<"map.remove">, dry, actor) => {
      const b = building(await map(), a.id);
      return edit("/api/map/buildings", { op: "remove", id: a.id }, dry, actor, b, null);
    },
    "map.undo": async (a: Args<"map.undo">, dry, actor) => {
      const hist: { editId: string; kind: string; undone: boolean; summary: string }[] = await self("/api/map/history?limit=200");
      const last = hist.find((e) => !e.undone && e.kind !== "undo");
      if (!last) throw new OpError("nothing to undo on the map", 409);
      if (a.editId && a.editId !== last.editId) throw new OpError(`map edit ${a.editId} is no longer the latest (${last.editId}: ${last.summary}); undo refused`, 409);
      if (dry) return { before: last, after: { undone: last.editId } };
      return { before: last, after: await self("/api/map/undo", { editId: last.editId, actor: who(actor) }) };
    },
    "mood.set": async (a: Args<"mood.set">, dry) => {
      const { agents } = await self("/api/moods");
      const cur = agents?.find((x: { agent: string }) => x.agent.toLowerCase() === a.agent.toLowerCase());
      if (!cur) throw new OpError(`unknown agent "${a.agent}"`, 404);
      const { agent: _a, ...body } = a;
      const revert = { op: "mood.set", args: { agent: cur.agent, mood: cur.override?.mood ?? null, needs: cur.needs } };
      if (dry) return { before: cur, after: body, revert };
      return { before: cur, after: await self(`/api/moods/${encodeURIComponent(cur.agent)}`, body), revert };
    },
  };
}
