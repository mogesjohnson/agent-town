import { readFileSync } from "node:fs";
import { H, LANDMARKS, W } from "../sim.js";

export const WORLD_VERSION = 1;
export interface Scenery {
  id: string; kind: "house" | "path" | "tree" | "pond" | "plaza" | "venue";
  x: number; y: number; w: number; h: number;
  atmosphere?: "water" | "vegetation"; buildingId?: string; name?: string;
}
export interface WorldMap {
  width: number; height: number; tiles: string[][]; scenery: Scenery[]; worldVersion: number;
  buildings: { id: string; type: string; x: number; y: number; w: number; h: number; name?: string }[];
}
interface Layout {
  houses: { id: string; name: string; x: number; y: number }[];
  roadRow: number; roadCols: number[]; trees: [number, number][];
  pond: { x: number; y: number; w: number; h: number };
}

const layout = JSON.parse(readFileSync(new URL("../../public/world-default.json", import.meta.url), "utf8")) as Layout;
const blank = (): string[][] => Array.from({ length: H }, () => Array.from({ length: W }, () => "grass"));

/** Fresh town: sim venues plus the scenic houses, paths, trees and pond. */
export function coherentDefault(landmarks: { name: string; x: number; y: number; w: number; h: number }[], reserved: Rect[] = []): WorldMap {
  const map: WorldMap = {
    width: W, height: H, tiles: blank(), scenery: [], worldVersion: WORLD_VERSION,
    buildings: landmarks.map((l) => ({ id: l.name.toLowerCase(), type: l.name.toLowerCase(), x: l.x, y: l.y, w: l.w, h: l.h, name: l.name })),
  };
  seed(map, reserved);
  map.scenery = projectScenery(map);
  return map;
}

function paint(tiles: string[][], x: number, y: number, type: string) {
  if (tiles[y]?.[x] === "grass") tiles[y][x] = type;
}

/** Adds default terrain and cottages. House footprints match BUILDING_TYPES.house (3x3). */
type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export function seed(map: WorldMap, reserved: Rect[] = []) {
  const occupied = (r: Rect) => [...reserved, ...map.buildings].some((b) => overlaps(r, b));
  for (let x = 0; x < W; x++) paint(map.tiles, x, layout.roadRow, "road");
  for (const col of layout.roadCols) for (let y = 0; y < H; y++) paint(map.tiles, col, y, "road");
  for (const [x, y] of layout.trees) if (!occupied({ x, y, w: 1, h: 1 })) paint(map.tiles, x, y, "tree");
  for (let y = layout.pond.y; y < layout.pond.y + layout.pond.h; y++)
    for (let x = layout.pond.x; x < layout.pond.x + layout.pond.w; x++)
      if (!occupied({ x, y, w: 1, h: 1 })) paint(map.tiles, x, y, "water");
  for (const house of layout.houses) if (!occupied({ ...house, w: 3, h: 3 }) && !map.buildings.some((b) => b.id === house.id))
    map.buildings.push({ id: house.id, type: "house", x: house.x, y: house.y, w: 3, h: 3, name: house.name });
}

const kindOf = (type: string): Scenery["kind"] => type === "plaza" ? "plaza" : type === "house" ? "house" : "venue";

/** One scenery record per building and per path, tree or pond cell. Ids stay stable when moved. */
export function projectScenery(map: { tiles: string[][]; buildings: WorldMap["buildings"] }): Scenery[] {
  const scenery: Scenery[] = map.buildings.map((b) => ({
    id: `building:${b.id}`, kind: kindOf(b.type), x: b.x, y: b.y, w: b.w, h: b.h, buildingId: b.id, name: b.name,
  }));
  map.tiles.forEach((row, y) => row.forEach((type, x) => {
    if (type === "road") scenery.push({ id: `path-${x}-${y}`, kind: "path", x, y, w: 1, h: 1 });
    else if (type === "tree") scenery.push({ id: `tree-${x}-${y}`, kind: "tree", x, y, w: 1, h: 1, atmosphere: "vegetation" });
    else if (type === "water") scenery.push({ id: `pond-${x}-${y}`, kind: "pond", x, y, w: 1, h: 1, atmosphere: "water" });
  }));
  return scenery;
}

/** An all-grass map whose buildings are still the original sim landmarks. */
export function legacyDefault(buildings: { id: string; x: number; y: number; w: number; h: number }[], tiles: string[][]): boolean {
  if (buildings.length !== LANDMARKS.length || tiles.some((row) => row.some((tile) => tile !== "grass"))) return false;
  return LANDMARKS.every((l) => buildings.some((b) => b.id === l.name.toLowerCase() && b.x === l.x && b.y === l.y && b.w === l.w && b.h === l.h));
}
