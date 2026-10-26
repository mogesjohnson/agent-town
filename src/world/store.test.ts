// Run: npm run build && node --test dist/world/store.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TownMap } from "../mapeditor/model.js";
import { readWorld, writeWorld } from "./store.js";

test("a saved world reloads scenery, edits and refuses a stale undo", () => {
  const dir = mkdtempSync(join(tmpdir(), "town-world-"));
  const path = join(dir, "world.json");
  try {
    const tm = new TownMap();
    const paint = tm.setTiles([{ x: 2, y: 2, type: "hill" }], "ui").edit;
    tm.setTiles([{ x: 2, y: 3, type: "road" }], "ui");
    writeWorld({ map: tm.json(), history: tm.history }, path);
    const next = new TownMap();
    const saved = readWorld(path);
    assert.ok(saved);
    next.install(saved.map);
    next.adoptHistory(saved.history);
    assert.equal(next.tile(2, 2), "hill");
    assert.equal(next.tile(2, 3), "road");
    assert.ok(next.map.buildings.some((b) => b.id === "cottage-claude"));
    assert.equal(next.history.filter((e) => !e.undone && e.kind !== "undo").at(-1)?.editId, tm.history.at(-1)?.editId);
    assert.throws(() => next.undo(paint?.editId, "ui"));
    next.undo(undefined, "ui");
    assert.equal(next.tile(2, 3), "grass");
    assert.equal(next.tile(2, 2), "hill");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
