import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Routes } from "../extensions.js";
import { Town } from "../sim.js";
import { DEFAULT_CONFIG } from "../types.js";
import { register } from "./extension.js";

function fixture() {
  const cfg = { name: "Ada", personality: "quiet reader", provider: "mock" as const, color: "#fff" };
  const town = new Town({ ...DEFAULT_CONFIG, agents: [cfg] }, new Map(), () => {});
  town.setAgents([cfg], new Map([["mock", { available: true }]]));
  const events = new Map<string, (data: unknown) => void>();
  const hooks: Town["promptHooks"] = [];
  register({ town, routes: new Routes(), promptHooks: hooks, on: (name, fn) => events.set(name, fn) });
  return { town, a: town.agents[0], tick: () => events.get("tick")?.(town), hooks };
}
test("agency respects pause and retains goals rather than rechoosing every tick", () => {
  const { town, a, tick, hooks } = fixture();
  tick();
  const target = [a.tx, a.ty];
  assert.match(hooks[0]("speech", { agent: a.cfg.name, partner: "Ben" }), /In-game intention/);
  for (let i = 0; i < 10; i++) tick();
  assert.deepEqual([a.tx, a.ty], target);
  town.paused = true;
  const before = town.state();
  for (let i = 0; i < 200; i++) tick();
  assert.deepEqual(town.state(), before);
  assert.equal(town.usage.calls, 0);
});
test("busy, unavailable and exhausted residents retain their own control", () => {
  const { town, a, tick } = fixture();
  for (const status of ["working", "playing", "chatting", "thinking", "out-of-turns"]) {
    a.status = status; a.tx = 39; a.ty = 24;
    tick();
    assert.deepEqual([a.status, a.tx, a.ty], [status, 39, 24]);
  }
  a.status = "idle"; a.available = false;
  tick();
  assert.deepEqual([a.tx, a.ty], [39, 24]);
  assert.equal(town.usage.calls, 0);
});
