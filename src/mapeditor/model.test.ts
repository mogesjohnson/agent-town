// Run: npm run build && node --test dist/mapeditor/
import { test } from "node:test";
import assert from "node:assert/strict";
import { TownMap, MapError } from "./model.js";

const status = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as MapError).status; } return 0; };

test("default map mirrors the sim grid and landmarks", () => {
  const m = new TownMap().json();
  assert.equal(m.tiles.length, m.height);
  assert.equal(m.tiles[0].length, m.width);
  assert.ok(m.buildings.some((b) => b.id === "plaza"));
});

test("paint tiles, log the actor, undo restores", () => {
  const tm = new TownMap();
  const { edit, changed } = tm.setTiles([{ x: 0, y: 0, type: "water" }, { x: 1, y: 0, type: "road" }], "claude");
  assert.equal(changed.length, 2);
  assert.equal(edit?.actor, "claude");
  assert.equal(tm.tile(0, 0), "water");
  tm.undo(undefined, "ui");
  assert.equal(tm.tile(0, 0), "grass");
  assert.equal(tm.history.at(-1)?.kind, "undo");
});

test("rejects bad tiles and out-of-bounds cells", () => {
  const tm = new TownMap();
  assert.equal(status(() => tm.setTiles([{ x: 0, y: 0, type: "lava" }], "x")), 400);
  assert.equal(status(() => tm.setTiles([{ x: 99, y: 0, type: "road" }], "x")), 400);
  assert.equal(status(() => tm.setTiles(Array(501).fill({ x: 0, y: 0, type: "road" }), "x")), 400);
  assert.equal(tm.history.length, 0);
});

test("add, move, remove buildings with overlap checks", () => {
  const tm = new TownMap();
  const { building } = tm.building({ op: "add", type: "house", x: 14, y: 0 }, "codex");
  assert.equal(status(() => tm.building({ op: "add", type: "house", x: 15, y: 1 }, "x")), 409);
  assert.equal(status(() => tm.building({ op: "add", type: "castle", x: 0, y: 0 }, "x")), 400);
  tm.building({ op: "move", id: building.id, x: 0, y: 22 }, "codex");
  assert.equal(tm.map.buildings.find((b) => b.id === building.id)?.y, 22);
  tm.building({ op: "remove", id: building.id }, "codex");
  assert.ok(!tm.map.buildings.some((b) => b.id === building.id));
  tm.undo(undefined, "ui");
  tm.undo(undefined, "ui");
  assert.equal(tm.map.buildings.find((b) => b.id === building.id)?.y, 0);
});

test("reserved place footprints are skipped for tiles and block buildings", () => {
  const tm = new TownMap(() => [{ id: "bakery", x: 0, y: 0, w: 2, h: 2 }]);
  const r = tm.setTiles([{ x: 1, y: 1, type: "road" }, { x: 2, y: 2, type: "road" }], "x");
  assert.deepEqual(r.skipped, [{ x: 1, y: 1 }]);
  assert.equal(r.changed.length, 1);
  assert.equal(tm.setTiles([{ x: 0, y: 0, type: "road" }], "x").edit, null);
  assert.equal(status(() => tm.building({ op: "add", type: "house", x: 1, y: 0 }, "x")), 409);
});

test("undo by editId only for the latest live edit", () => {
  const tm = new TownMap();
  const a = tm.setTiles([{ x: 0, y: 0, type: "hill" }], "x").edit;
  tm.setTiles([{ x: 1, y: 0, type: "tree" }], "x");
  assert.equal(status(() => tm.undo(a?.editId, "x")), 409);
});

test("load replaces the map, is validated and undoable", () => {
  const tm = new TownMap();
  const saved = tm.json();
  saved.tiles[3][3] = "road";
  saved.buildings = [{ id: "home", type: "house", x: 0, y: 0, w: 3, h: 3 }];
  tm.load(saved, "ui");
  assert.deepEqual(tm.map.buildings.map((b) => b.id), ["home"]);
  assert.equal(status(() => tm.load({ ...saved, width: 10 }, "ui")), 400);
  tm.undo(undefined, "ui");
  assert.ok(tm.map.buildings.some((b) => b.id === "plaza"));
});
