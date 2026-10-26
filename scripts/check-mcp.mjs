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
  const before = await call("get_places");
  const types = await call("get_place_types");
  const type = types.types.find((t) => t.type === "food")?.type ?? types.types[0].type;
  const args = { id: "mcp-test-bakery", name: "MCP Test Bakery", type, near: { x: 38, y: 1 }, w: 2, h: 2 };
  const preview = await call("add_place", { ...args, dryRun: true });
  assert.equal(preview.dryRun, true);
  assert.deepEqual(await call("get_places"), before);
  const created = await call("add_place", args);
  const place = created.after.place;
  assert.equal(place.id, args.id);
  assert((await call("get_map")).places.some((p) => p.id === place.id));
  await call("remove_place", { id: place.id });
  assert(!(await call("get_places")).places.places.some((p) => p.id === place.id));
  await call("undo_last_change");
  assert((await call("get_places")).places.places.some((p) => p.id === place.id));
  await call("undo_last_change");
  assert(!(await call("get_places")).places.places.some((p) => p.id === place.id));
  console.log(`pass: MCP handshake, ${tools.tools.length} tools, resources, preview/add/read/remove and two undo steps`);
} finally {
  await client.close();
  server.kill();
  if (server.exitCode === null) await new Promise((done) => server.once("exit", done));
  await rm(cwd, { recursive: true, force: true });
}
