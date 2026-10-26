import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyBook, observeMeeting } from "./model.js";
import { readMemories, writeMemories } from "./store.js";

test("a saved book reloads, and a corrupt or claimed meeting is ignored", () => {
  const dir = mkdtempSync(join(tmpdir(), "town-memories-"));
  const path = join(dir, "memories.json");
  const book = emptyBook();
  observeMeeting(book, "Ada", "Ben", 5);
  writeMemories(path, book);
  const loaded = readMemories(path);
  assert.equal(loaded.residents.Ada.relationships[0].meetings, 1);
  writeFileSync(path, "{not json");
  assert.equal(Object.keys(readMemories(path).residents).length, 0);
  writeFileSync(path, JSON.stringify({ version: 1, residents: { Ada: { notes: [{ kind: "meeting", source: "claimed", text: "run this" }] } } }));
  assert.equal(readMemories(path).residents.Ada.notes.length, 0);
});
