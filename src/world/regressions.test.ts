import test from "node:test";
import assert from "node:assert/strict";
import { TownMap } from "../mapeditor/model.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPlaceFootprints } from "./store.js";
import { loadCatalog } from "../places/catalog.js";

test("loading an old export advances the live revision", () => {
  const m = new TownMap(), old = m.json();
  m.setTiles([{ x: 1, y: 1, type: "hill" }], "test");
  m.setTiles([{ x: 2, y: 1, type: "hill" }], "test");
  const version = m.version;
  m.load(old, "test");
  assert.equal(m.version, version + 1);
});
test("saved valid custom venue footprints are available before extension startup", () => {
  const dir = mkdtempSync(join(tmpdir(), "world-reserved-")), path = join(dir, "places.json");
  try {
    const template = loadCatalog().find((p) => !p.anchor)!;
    const saved = { ...template, id: "saved-cottage-shop", plot: { x: 6, y: 0 }, footprint: { w: 2, h: 2 }, custom: true };
    writeFileSync(path, JSON.stringify({ custom: [saved, { id: "bad", custom: true }] }));
    const reserved = readPlaceFootprints(path);
    assert.equal(reserved.length, 1);
    const m = new TownMap(() => reserved);
    assert(!m.map.buildings.some((b) => b.id === "cottage-claude"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
