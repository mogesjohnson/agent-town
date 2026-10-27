import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { setImmediate } from "node:timers/promises";
import { Routes } from "../extensions.js";
import { Town } from "../sim.js";
import { DEFAULT_CONFIG } from "../types.js";
import { registerMinigames } from "./index.js";

function fixture() {
  const agents = ["Ada", "Ben"].map((name) => ({ name, personality: "friendly", provider: "mock" as const, color: "#fff" }));
  const town = new Town({ ...DEFAULT_CONFIG, agents }, new Map(), () => {});
  town.setAgents(agents, new Map([["mock", { available: true }]]));
  for (const a of town.agents) { a.x = a.y = 0; a.status = "idle"; a.cooldownUntil = 0; }
  const routes = new Routes();
  const events: string[] = [];
  const host = registerMinigames(town, (event) => events.push(event), routes, () => {});
  return { town, routes, host, events };
}

async function start(routes: Routes, body: unknown, raw = false) {
  const path = "/api/minigames/start";
  const handler = routes.find("POST", path)!;
  const req = Readable.from([raw ? String(body) : JSON.stringify(body)]) as IncomingMessage;
  let status = 0, data = "";
  const res = { writeHead: (code: number) => { status = code; }, end: (s: string) => { data = s; } } as unknown as ServerResponse;
  await handler(req, res, new URL(path, "http://localhost"));
  return { status, body: JSON.parse(data) };
}

for (const game of ["tag", "trivia", "rps"]) {
  test(`manual ${game} reserves one game and rejects a second start`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { town, routes, host, events } = fixture();
    t.after(async () => {
      town.agents = []; // Abort gathering without model calls or dangling timers.
      t.mock.timers.tick(200);
      await setImmediate();
    });
    const first = await start(routes, { game });
    assert.equal(first.status, 202);
    assert.equal(first.body.current.game, game);
    assert.equal(first.body.current.players.length, 2);
    const second = await start(routes, { game });
    assert.equal(second.status, 409);
    assert.match(second.body.error, /already running/);
    assert.equal(events.filter((e) => e === "minigame").length, 1);
    assert.equal(host.snapshot().current?.game, game);
    assert.equal(town.usage.calls, 0);
  });
}

test("manual start rejects malformed input, paused towns and busy residents", async () => {
  const { town, routes, host } = fixture();
  for (const body of [null, [], {}, { game: "chess" }, { game: 1 }])
    assert.equal((await start(routes, body)).status, 400);
  assert.equal((await start(routes, "{", true)).status, 400);
  assert.equal((await start(routes, '"' + "x".repeat(10_001) + '"', true)).status, 413);
  town.paused = true;
  assert.match((await start(routes, { game: "tag" })).body.error, /Resume/);
  town.paused = false;
  town.agents[0].status = "thinking";
  assert.equal((await start(routes, { game: "tag" })).status, 409);
  town.agents[0].status = "idle";
  town.agents[0].cooldownUntil = Date.now() + 60_000;
  assert.equal((await start(routes, { game: "tag" })).status, 409);
  town.agents[0].cooldownUntil = 0;
  town.agents[0].available = false;
  assert.equal((await start(routes, { game: "tag" })).status, 409);
  assert.equal(host.snapshot().current, null);
});
