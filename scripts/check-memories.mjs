// Live memory check: SSE state, process restart, and MCP stdio preview/apply.
// Uses the preview config and the mock provider. No real model credentials.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import http from "node:http";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const port = Number(process.env.MEMORY_CHECK_PORT || 4379);
const phrase = "The pond lanterns were lit";
await mkdir(".runtime", { recursive: true });
const cwd = await mkdtemp(resolve(".runtime/memory-check-"));
const config = JSON.parse(await readFile("town.config.preview.json", "utf8"));
config.port = port;
config.newspaper = { provider: "mock", model: "canned" };
await writeFile(resolve(cwd, "town.config.json"), JSON.stringify(config));

function start() {
  const child = spawn(process.execPath, [resolve(root, "dist/server.js")], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (chunk) => { log += chunk; });
  child.stderr.on("data", (chunk) => { log += chunk; });
  const ready = new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error(`startup timed out\n${log.slice(-500)}`)), 15_000);
    child.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("agent-town on")) { clearTimeout(timer); done(); }
    });
    child.once("exit", (code) => { clearTimeout(timer); fail(new Error(`town exited ${code}\n${log.slice(-500)}`)); });
  });
  return { child, ready, stop: async () => {
    child.kill();
    if (child.exitCode === null) await new Promise((done) => child.once("exit", done));
  } };
}

async function connect() {
  const client = new Client({ name: "memory-check", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [resolve(root, "dist/mcp/server.js")], cwd,
    env: { ...process.env, AGENT_TOWN_URL: `http://127.0.0.1:${port}` }, stderr: "pipe",
  });
  await client.connect(transport);
  return client;
}

async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(Boolean(result.isError), false, JSON.stringify(result));
  return JSON.parse(result.content[0].text);
}

function watch() {
  const states = [];
  const req = http.get({ hostname: "127.0.0.1", port, path: "/events" }, (res) => {
    res.setEncoding("utf8");
    let buf = "";
    res.on("data", (chunk) => {
      buf += chunk;
      let cut;
      while ((cut = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        if (!block.startsWith("event: state")) continue;
        const data = block.split("\n").find((line) => line.startsWith("data: "));
        if (data) states.push(JSON.parse(data.slice(6)));
      }
    });
  });
  return { states, close: () => req.destroy() };
}

const bookHas = (book) => book?.town?.some((event) => event.text === phrase && event.source === "observed");
const stateHas = (state) => bookHas(state?.memories);
async function until(check) {
  const start = Date.now();
  while (Date.now() - start < 5_000) {
    if (check()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 40));
  }
  throw new Error("timed out waiting for memory state");
}

let active;
const launch = start;
function startTracked() {
  const town = launch();
  active = town.child;
  return town;
}
try {
  let town = startTracked();
  await town.ready;
  let client = await connect();
  const sse = watch();
  await until(() => sse.states.length > 0);
  await call(client, "pause_town");
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_200));
  const callsBefore = sse.states.at(-1).usage.calls;
  await call(client, "narrator_say", { text: phrase });
  await until(() => sse.states.some(stateHas));
  assert.equal(sse.states.at(-1).usage.calls, callsBefore);
  assert.equal(bookHas(await call(client, "get_memories")), true);
  sse.close();
  await client.close();
  await town.stop();

  town = startTracked();
  await town.ready;
  client = await connect();
  const kept = await call(client, "get_memories");
  await call(client, "pause_town");
  assert.equal(bookHas(kept), true);
  const preview = await call(client, "forget_memories", { agent: "Claude", dryRun: true });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.undoable, false);
  assert.deepEqual(await call(client, "get_memories"), kept);
  const cleared = await call(client, "forget_memories", {});
  assert.deepEqual(cleared.after, { town: [], residents: [] });
  await client.close();
  await town.stop();

  // Test persistence of deletion, not newly observed meetings/visits after startup.
  config.agents = [];
  await writeFile(resolve(cwd, "town.config.json"), JSON.stringify(config));
  town = startTracked();
  await town.ready;
  client = await connect();
  assert.deepEqual(await call(client, "get_memories"), { town: [], residents: [] });
  await client.close();
  await town.stop();
  console.log("pass: memory SSE, restart persistence, stdio preview and reset");
} finally {
  active?.kill();
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 400));
  for (let attempt = 0; attempt < 5; attempt++) {
    try { await rm(cwd, { recursive: true, force: true }); break; }
    catch (error) {
      if (attempt === 4) console.error(`[cleanup] ${error.code}`);
      else await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
    }
  }
}
