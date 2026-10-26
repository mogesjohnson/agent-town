import test from "node:test";
import assert from "node:assert/strict";
import { Town } from "./sim.js";
import { DEFAULT_CONFIG, type Adapter } from "./types.js";

test("an in-flight agent call rejects another without spending a turn", async () => {
  let finish!: (s: string) => void, calls = 0;
  const adapter: Adapter = { id: "mock", detect: async () => ({ available: true }),
    chat: async () => { calls++; return new Promise<string>((r) => { finish = r; }); } };
  const town = new Town({ ...DEFAULT_CONFIG, agents: [] }, new Map([["mock", adapter]]), () => {});
  town.setAgents([{ name: "A", personality: "kind", color: "red", provider: "mock" }], new Map([["mock", { available: true }]]));
  const a = town.agents[0], first = town.speak(a, "visitor", []);
  assert.equal(await town.speak(a, "visitor", []), null);
  assert.equal(a.turns, 1); assert.equal(calls, 1);
  finish("hello"); assert.equal(await first, "hello");
  const next = town.speak(a, "visitor", []);
  finish("again"); assert.equal(await next, "again");
  assert.equal(a.turns, 2);
});
