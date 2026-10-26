import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyBook, observeMeeting } from "./model.js";
import { observeSpeech, observeVisit } from "./model.js";
import { readMemories, writeMemories } from "./store.js";

test("a full supported book survives save/restart without losing residents", () => {
  const path = join(mkdtempSync(join(tmpdir(), "town-full-memory-")), "memories.json");
  const book = emptyBook();
  for (let a = 0; a < 32; a++) {
    const name = `Resident ${a}`;
    for (let b = 0; b < 32; b++) if (a !== b) observeMeeting(book, name, `Resident ${b}`, b);
    for (let i = 0; i < 8; i++) observeVisit(book, name, `${i} ${"木".repeat(75)}`, i);
    for (let i = 0; i < 4; i++) observeSpeech(book, "Visitor", name, "木".repeat(80), i);
  }
  writeMemories(path, book);
  const restored = readMemories(path);
  assert.equal(Object.keys(restored.residents).length, 32);
  assert.deepEqual(restored.residents["Resident 0"].favorites, book.residents["Resident 0"].favorites);
});

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
