import { W, H, LANDMARKS } from "../sim.js";
import { coherentDefault, legacyDefault, projectScenery, seed, WORLD_VERSION, type Scenery } from "../world/layout.js";

export const TILE_TYPES = ["grass", "road", "water", "hill", "tree"] as const;
/** Building types with footprint and the color the 2D canvas paints for them. */
export const BUILDING_TYPES: Record<string, { w: number; h: number; color: string }> = {
  plaza: { w: 5, h: 5, color: "#e9c46a" }, cafe: { w: 6, h: 4, color: "#f4a261" },
  park: { w: 8, h: 7, color: "#90be6d" }, library: { w: 7, h: 5, color: "#a5a58d" },
  house: { w: 3, h: 3, color: "#e5bc86" }, shop: { w: 4, h: 3, color: "#b5a8c5" },
};

export interface Building { id: string; type: string; x: number; y: number; w: number; h: number; name?: string }
export interface MapData { width: number; height: number; tiles: string[][]; buildings: Building[]; scenery: Scenery[]; worldVersion: number }
export interface Edit { editId: string; actor: string; kind: string; summary: string; at: number; undone: boolean; before: MapData }

export type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export class MapError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

const clone = (m: MapData): MapData => JSON.parse(JSON.stringify(m));
const isInt = (n: unknown): n is number => Number.isInteger(n);

export function defaultMap(): MapData { return coherentDefault(LANDMARKS); }

/** The town map plus an undoable, author-tagged edit log. */
export class TownMap {
  map = defaultMap();
  version = 1;
  history: Edit[] = [];
  private seq = 0;
  private bseq = 0;
  /** Footprints owned by other features (e.g. places from #14); edits may not touch them. */
  constructor(public reserved: () => (Rect & { id: string })[] = () => []) {}

  tile(x: number, y: number) { return this.map.tiles[y]?.[x]; }

  private checkCell(x: unknown, y: unknown) {
    if (!isInt(x) || !isInt(y) || x < 0 || y < 0 || x >= W || y >= H) throw new MapError(`cell ${x},${y} out of bounds (${W}x${H})`);
  }

  private refresh() { this.map.scenery = projectScenery(this.map); this.map.worldVersion = WORLD_VERSION; }

  private checkFootprint(b: Building, ignore?: string) {
    if (b.x < 0 || b.y < 0 || b.x + b.w > W || b.y + b.h > H) throw new MapError(`building ${b.id} does not fit at ${b.x},${b.y}`);
    for (const o of this.map.buildings) if (o.id !== ignore && overlaps(b, o)) throw new MapError(`overlaps building ${o.id}`, 409);
    for (const r of this.reserved()) if (overlaps(b, r)) throw new MapError(`overlaps place ${r.id}`, 409);
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
      const tile = this.map.tiles[y]?.[x];
      if (tile === "water" || tile === "tree") throw new MapError(`overlaps ${tile} at ${x},${y}`, 409);
    }
  }

  private commit(actor: string, kind: string, summary: string, before: MapData) {
    const edit = { editId: `e${++this.seq}`, actor, kind, summary, at: Date.now(), undone: false, before };
    this.history.push(edit);
    if (this.history.length > 200) this.history.shift();
    this.version++;
    return edit;
  }

  setTiles(list: unknown, actor: string) {
    if (!Array.isArray(list) || list.length === 0) throw new MapError("tiles must be a non-empty array");
    if (list.length > 500) throw new MapError("at most 500 tiles per call");
    for (const t of list) {
      this.checkCell(t?.x, t?.y);
      if (!TILE_TYPES.includes(t.type)) throw new MapError(`unknown tile type ${t.type}`);
    }
    const before = clone(this.map), reserved = this.reserved();
    const occupied = (x: number, y: number) => this.map.buildings.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
    const changed: { x: number; y: number; type: string }[] = [], skipped: { x: number; y: number }[] = [];
    for (const { x, y, type } of list) {
      if (reserved.some((r) => overlaps({ x, y, w: 1, h: 1 }, r))) skipped.push({ x, y });
      else if ((type === "water" || type === "tree") && occupied(x, y)) skipped.push({ x, y });
      else if (this.map.tiles[y][x] !== type) { this.map.tiles[y][x] = type; changed.push({ x, y, type }); }
    }
    if (changed.length) this.refresh();
    const edit = changed.length ? this.commit(actor, "tiles", `painted ${changed.length} tile(s)`, before) : null;
    return { edit, changed, skipped };
  }

  private addBuilding(b: any) {
    const def = BUILDING_TYPES[b?.type];
    if (!def) throw new MapError(`unknown building type ${b?.type}`);
    this.checkCell(b.x, b.y);
    const taken = (id: string) => this.map.buildings.some((o) => o.id === id);
    let id = typeof b.id === "string" && /^[\w-]{1,32}$/.test(b.id) ? b.id : "";
    if (id && taken(id)) throw new MapError(`id ${id} already exists`, 409);
    while (!id || taken(id)) id = `${b.type}-${++this.bseq}`;
    const nb: Building = { id, type: b.type, x: b.x, y: b.y, w: def.w, h: def.h };
    if (b.name != null) nb.name = String(b.name).slice(0, 40);
    this.checkFootprint(nb);
    this.map.buildings.push(nb);
    return nb;
  }

  building(b: any, actor: string) {
    const before = clone(this.map);
    const list = this.map.buildings;
    const found = list.find((o) => o.id === b?.id);
    if (b?.op === "add") {
      const nb = this.addBuilding(b);
      this.refresh();
      return { edit: this.commit(actor, "building:add", `added ${nb.type} ${nb.id} at ${nb.x},${nb.y}`, before), building: nb };
    }
    if (b?.op !== "move" && b?.op !== "remove") throw new MapError("op must be add, move or remove");
    if (!found) throw new MapError(`no building with id ${b.id}`, 404);
    if (b.op === "remove") {
      list.splice(list.indexOf(found), 1);
      this.refresh();
      return { edit: this.commit(actor, "building:remove", `removed ${found.id}`, before), building: found };
    }
    this.checkCell(b.x, b.y);
    this.checkFootprint({ ...found, x: b.x, y: b.y }, found.id);
    found.x = b.x; found.y = b.y;
    if (b.name != null) found.name = String(b.name).slice(0, 40);
    this.refresh();
    return { edit: this.commit(actor, "building:move", `moved ${found.id} to ${b.x},${b.y}`, before), building: found };
  }

  /** Replace the map without writing history. Restarts use this so undo stays empty until a new edit. */
  install(m: any) {
    if (!m || m.width !== W || m.height !== H) throw new MapError(`map must be ${W}x${H}`);
    if (!Array.isArray(m.tiles) || m.tiles.length !== H || m.tiles.some((r: unknown) => !Array.isArray(r) || r.length !== W)) throw new MapError("tiles must be string[height][width]");
    if (m.tiles.flat().some((t: string) => !TILE_TYPES.includes(t as any))) throw new MapError("unknown tile type in map");
    if (!Array.isArray(m.buildings)) throw new MapError("buildings must be an array");
    const before = clone(this.map);
    const tiles = m.tiles.map((r: string[]) => [...r]);
    this.map = { width: W, height: H, tiles, buildings: [], scenery: [], worldVersion: 0 };
    try {
      for (const b of m.buildings) this.addBuilding(b);
      if (m.worldVersion == null && legacyDefault(m.buildings, tiles)) seed(this.map);
      this.refresh();
      if (Number.isInteger(m.version) && m.version > 0) this.version = m.version;
    } catch (e) { this.map = before; throw e; }
  }

  load(m: any, actor: string) {
    const before = clone(this.map);
    this.install(m);
    return this.commit(actor, "load", `loaded map with ${this.map.buildings.length} building(s)`, before);
  }

  /** Restore a saved log. Ids already used are not issued again. */
  adoptHistory(entries: Edit[]) {
    this.history = entries.filter((e) => e && typeof e.editId === "string" && e.before).slice(-200);
    for (const e of this.history) {
      const n = Number(/^e(\d+)$/.exec(e.editId)?.[1] ?? 0);
      if (n > this.seq) this.seq = n;
    }
  }

  /** Undo the latest live edit; if editId is given it must be that edit. */
  undo(editId: unknown, actor: string) {
    const last = [...this.history].reverse().find((e) => !e.undone && e.kind !== "undo");
    if (!last) throw new MapError("nothing to undo", 409);
    if (editId != null && editId !== last.editId) throw new MapError(`only the latest edit (${last.editId}) can be undone`, 409);
    const before = clone(this.map);
    this.map = clone(last.before);
    this.refresh();
    last.undone = true;
    const edit = this.commit(actor, "undo", `undid ${last.editId} (${last.summary})`, before);
    return { edit, undone: last };
  }

  json() { return { ...clone(this.map), version: this.version }; }
}
