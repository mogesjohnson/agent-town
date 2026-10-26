// Actual SDK client + stdio server + isolated mock town. No browser or provider credentials.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const root = process.cwd();
await mkdir(".runtime", { recursive: true });
const cwd = await mkdtemp(resolve(".runtime/mcp-check-"));
const config = JSON.parse(await readFile("town.config.preview.json", "utf8"));
config.port = Number(process.env.MCP_CHECK_PORT || 4329);
config.newspaper = { provider: "mock", model: "canned" };
await writeFile(resolve(cwd, "town.config.json"), JSON.stringify(config));
const server = spawn(process.execPath, [resolve("dist/server.js")], { cwd, stdio: ["ignore", "pipe", "pipe"] });
const client = new Client({ name: "codex-mcp-check", version: "1.0.0" });
try {
  await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error("isolated town startup timed out")), 10_000);
    server.stdout.on("data", (s) => { if (s.toString().includes("agent-town on")) { clearTimeout(timer); done(); } });
    server.once("exit", (code) => { clearTimeout(timer); fail(new Error(`town exited ${code}`)); });
  });
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(root, "dist/mcp/server.js")],
    cwd, env: { ...process.env, AGENT_TOWN_URL: `http://127.0.0.1:${config.port}` }, stderr: "pipe" });
  await client.connect(transport);
  const tools = await client.listTools();
  assert(tools.tools.some((t) => t.name === "add_place"));
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    assert(!result.isError, JSON.stringify(result));
    return JSON.parse(result.content[0].text);
  };
  const resources = await client.listResources();
  assert(resources.resources.some((r) => r.uri === "town://map"));
  await call("pause_town");
  const world = await call("get_world");
  assert.equal(world.town.paused, true);
  assert(world.placeTypes.types.length > 0);
  assert.equal(world.map.terrainCounts.grass, 1000);
  assert.equal(world.map.tiles, undefined);
  const error = async (name, args) => assert.equal((await client.callTool({ name, arguments: args })).isError, true);
  const mapBefore = await call("get_map");
  await error("place_building", { type: "house", x: 39, y: 24, dryRun: true });
  await error("place_building", { type: "house", x: 18, y: 10, dryRun: true });
  await call("place_building", { id: "mcp-house", type: "house", x: 0, y: 0, dryRun: true });
  assert.deepEqual(await call("get_map"), mapBefore);
  await call("place_building", { id: "mcp-house", type: "house", x: 0, y: 0 });
  await error("move_building", { id: "mcp-house", x: 39, y: 24, dryRun: true });
  await call("move_building", { id: "mcp-house", x: 10, y: 0, dryRun: true });
  assert.equal((await call("get_map")).buildings.find((b) => b.id === "mcp-house").x, 0);
  await call("move_building", { id: "mcp-house", x: 10, y: 0 });
  assert.equal((await call("get_map")).buildings.find((b) => b.id === "mcp-house").x, 10);
  await call("undo_last_change");
  assert.equal((await call("get_map")).buildings.find((b) => b.id === "mcp-house").x, 0);
  await call("remove_building", { id: "mcp-house" });
  assert(!(await call("get_map")).buildings.some((b) => b.id === "mcp-house"));
  await call("undo_last_change");
  assert((await call("get_map")).buildings.some((b) => b.id === "mcp-house"));
  await call("undo_last_change"); // undo original add after the move/removal were undone
  assert(!(await call("get_map")).buildings.some((b) => b.id === "mcp-house"));
  const before = await call("get_places");
  const types = await call("get_place_types");
  const type = types.types.find((t) => t.type === "food")?.type ?? types.types[0].type;
  const args = { id: "mcp-test-bakery", name: "MCP Test Bakery", type, near: { x: 38, y: 1 }, w: 2, h: 2 };
  for (const dryRun of [true, false]) {
    await error("add_place", { ...args, near: undefined, x: 39, y: 24, dryRun });
    await error("add_place", { ...args, near: undefined, x: 18, y: 10, dryRun });
  }
  const preview = await call("add_place", { ...args, dryRun: true });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.after.place.id, args.id);
  assert.deepEqual(await call("get_places"), before);
  const created = await call("add_place", args);
  const place = created.after.place;
  assert.equal(place.id, args.id);
  const post = async (path, body) => fetch(`http://127.0.0.1:${config.port}${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const path = `/api/places/${place.id}/move`;
  assert.equal((await post(path, { x: 39, y: 24, dryRun: true })).status, 400);
  assert.equal((await post(path, { x: 18, y: 10, dryRun: true })).status, 409);
  assert.equal((await post(path, { x: null, y: 0 })).status, 400);
  const layout = await call("get_map");
  const occupied = [...layout.buildings, ...layout.places.filter((p) => p.id !== place.id)];
  const overlaps = (x, y, r) => x < r.x + r.w && r.x < x + place.w && y < r.y + r.h && r.y < y + place.h;
  let spot;
  for (let y = 0; !spot && y + place.h <= layout.height; y++)
    for (let x = 0; x + place.w <= layout.width; x++)
      if ((x !== place.x || y !== place.y) && !occupied.some((r) => overlaps(x, y, r))) { spot = { x, y }; break; }
  assert(spot, "a free relocation spot exists");
  assert.equal((await post(path, { ...spot, dryRun: true })).status, 200);
  assert.equal((await call("get_places")).places.places.find((p) => p.id === place.id).x, place.x);
  await post("/api/places/toggle", { id: place.id, enabled: false });
  assert.equal((await post(path, spot)).status, 200);
  const relocated = (await call("get_places")).places.places.find((p) => p.id === place.id);
  assert.equal(relocated.x, spot.x); assert.equal(relocated.y, spot.y); assert.equal(relocated.enabled, false);
  assert.equal((await post(path, { x: place.x, y: place.y })).status, 200);
  await post("/api/places/toggle", { id: place.id, enabled: true });
  await error("move_place", { id: place.id, x: 39, y: 24, dryRun: true });
  const changesBefore = (await call("get_changes")).length;
  await call("move_place", { id: place.id, ...spot, dryRun: true });
  assert.equal((await call("get_changes")).length, changesBefore);
  assert.equal((await call("get_places")).places.places.find((p) => p.id === place.id).x, place.x);
  const moved = await call("move_place", { id: place.id, ...spot });
  assert.equal(moved.undoable, true);
  assert.equal(moved.after.x, spot.x);
  assert((await call("get_map")).places.some((p) => p.id === place.id && p.x === spot.x && p.y === spot.y));
  await call("undo_last_change");
  assert.equal((await call("get_places")).places.places.find((p) => p.id === place.id).x, place.x);
  assert((await call("get_map")).places.some((p) => p.id === place.id));
  await call("remove_place", { id: place.id });
  assert(!(await call("get_places")).places.places.some((p) => p.id === place.id));
  await call("undo_last_change");
  assert((await call("get_places")).places.places.some((p) => p.id === place.id));
  await call("undo_last_change");
  assert(!(await call("get_places")).places.places.some((p) => p.id === place.id));
  const simultaneous = await Promise.all([call("resume_town"), call("pause_town")]);
  assert.notEqual(simultaneous[0].change, simultaneous[1].change);
  const undone = await Promise.all([call("undo_last_change"), call("undo_last_change")]);
  assert.notEqual(undone[0].undid, undone[1].undid);
  assert.deepEqual(new Set(undone.map((r) => r.undid)), new Set(simultaneous.map((r) => r.change)));
  assert.equal((await call("get_town")).paused, true);
  console.log(`pass: MCP handshake, ${tools.tools.length} tools, resources, truthful previews, building/place add/move/remove/undo and concurrent change/undo serialization`);
} finally {
  await client.close();
  server.kill();
  if (server.exitCode === null) await new Promise((done) => server.once("exit", done));
  await rm(cwd, { recursive: true, force: true });
}
