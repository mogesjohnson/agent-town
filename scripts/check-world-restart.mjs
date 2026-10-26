// Isolated restart regression: seeded migration, renamed/removed anchors and persisted undo.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const root = process.cwd();
await mkdir(".runtime", { recursive: true });
const cwd = await mkdtemp(resolve(".runtime/world-restart-"));
const config = JSON.parse(await readFile("town.config.preview.json", "utf8"));
config.port = Number(process.env.WORLD_CHECK_PORT || 4331);
config.newspaper = { provider: "mock", model: "canned" };
await writeFile(resolve(cwd, "town.config.json"), JSON.stringify(config));
await mkdir(resolve(cwd, ".runtime"));
const venue = { ...JSON.parse(await readFile("src/places/data/cafe.json", "utf8")),
  id: "saved-shop", anchor: undefined, custom: true, plot: { x: 6, y: 0 }, footprint: { w: 2, h: 2 } };
await writeFile(resolve(cwd, ".runtime/places.json"), JSON.stringify({ enabled: [venue.id], custom: [venue] }));
let server;
async function start() {
  server = spawn(process.execPath, [resolve(root, "dist/server.js")], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(Error("restart test startup timeout")), 10_000);
    server.stdout.on("data", (s) => { if (s.toString().includes("agent-town on")) { clearTimeout(timer); done(); } });
    server.once("exit", (code) => { clearTimeout(timer); fail(Error(`town exited ${code}`)); });
  });
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  server.kill(); await new Promise((done) => server.once("exit", done));
}
async function api(path, body) {
  const response = await fetch(`http://127.0.0.1:${config.port}${path}`, body === undefined ? {} : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  assert(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
  return response.json();
}
async function attached() {
  for (let i = 0; i < 25; i++) {
    const p = (await api("/api/places")).places.find((p) => p.id === "cafe");
    if (p && !p.detached) return p;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.fail("cafe did not reattach");
}
try {
  await start();
  assert((await api("/api/places")).places.some((p) => p.id === venue.id));
  assert(!(await api("/api/map")).buildings.some((b) => b.id === "cottage-claude"));
  await api("/api/map/buildings", { op: "move", id: "cafe", x: 0, y: 0, name: "Renamed Cafe", actor: "codex" });
  await stop(); await start();
  assert.equal((await attached()).x, 0);
  assert((await api("/api/places")).places.some((p) => p.id === venue.id));
  await api("/api/map/buildings", { op: "remove", id: "cafe", actor: "codex" });
  await stop(); await start();
  assert.equal((await api("/api/places")).places.find((p) => p.id === "cafe")?.detached, true);
  await api("/api/map/undo", { actor: "codex" });
  assert.equal((await attached()).x, 0);
  console.log("pass: saved custom venue survives seeding; renamed and removed anchors survive restart; persisted undo reattaches");
} finally { await stop(); await rm(cwd, { recursive: true, force: true }); }
