import test from "node:test";
import assert from "node:assert/strict";
import { TownMap } from "../mapeditor/model.js";

test("loading an old export advances the live revision", () => {
  const m = new TownMap(), old = m.json();
  m.setTiles([{ x: 1, y: 1, type: "hill" }], "test");
  m.setTiles([{ x: 2, y: 1, type: "hill" }], "test");
  const version = m.version;
  m.load(old, "test");
  assert.equal(m.version, version + 1);
});
test("fresh and legacy seeding preserves reserved venues", () => {
  const reserved = [{ id: "old-custom", x: 6, y: 0, w: 2, h: 2 }, { id: "pond-shop", x: 31, y: 22, w: 2, h: 2 }];
  const m = new TownMap(() => reserved);
  assert(!m.map.buildings.some((b) => b.id === "cottage-claude"));
  assert.equal(m.tile(31, 22), "grass");
  const legacy = m.json();
  delete (legacy as any).worldVersion;
  legacy.tiles = legacy.tiles.map((row) => row.map(() => "grass"));
  legacy.buildings = legacy.buildings.filter((b) => ["plaza", "cafe", "library", "park"].includes(b.id));
  m.install(legacy);
  assert(!m.map.buildings.some((b) => b.id === "cottage-claude"));
  assert.equal(m.tile(31, 22), "grass");
});
test("undo rejects a newly occupied former footprint without changing the world", () => {
  let reserved: { id: string; x: number; y: number; w: number; h: number }[] = [];
  const m = new TownMap(() => reserved);
  m.building({ op: "add", type: "house", id: "test", x: 0, y: 0 }, "test");
  m.building({ op: "move", id: "test", x: 10, y: 0 }, "test");
  reserved = [{ id: "new-venue", x: 0, y: 0, w: 3, h: 3 }];
  const before = m.json();
  assert.throws(() => m.undo(undefined, "test"), /overlaps place/);
  assert.deepEqual(m.json(), before);
  assert.equal(m.history.at(-1)?.undone, false);
});
