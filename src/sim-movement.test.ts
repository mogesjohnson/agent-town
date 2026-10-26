import test from "node:test";
import assert from "node:assert/strict";
import { Town, LANDMARKS } from "./sim.js";
import { DEFAULT_CONFIG } from "./types.js";
const town = () => {
  const t = new Town({ ...DEFAULT_CONFIG, agents: [] }, new Map(), () => {});
  t.setAgents([{ name: "A", personality: "kind", provider: "mock", color: "red" }], new Map([["mock", { available: true }]]));
  Object.assign(t.agents[0], { x: 0, y: 0, tx: 2, ty: 0, status: "walking" });
  return t;
};
test("a resident routes around blocked terrain before stepping toward a free goal", () => {
  const t = town(), a = t.agents[0];
  t.canEnter = (x, y) => x >= 0 && y >= 0 && x < 40 && y < 25 && !(x === 1 && y === 0);
  for (let i = 0; i < 4; i++) { t.tick(); assert(t.canEnter(a.x, a.y)); }
  assert.deepEqual([a.x, a.y], [2, 0]);
});
test("blocked destinations are abandoned without entering them", () => {
  const t = town(), a = t.agents[0];
  t.canEnter = () => false;
  t.tick();
  assert.deepEqual([a.x, a.y, a.tx, a.ty, a.status], [0, 0, 0, 0, "idle"]);
});
test("removing all buildings does not crash random wandering", () => {
  const t = town(), a = t.agents[0], original = [...LANDMARKS], random = Math.random;
  try {
    LANDMARKS.splice(0); Math.random = () => 0;
    a.tx = a.x; a.ty = a.y;
    assert.doesNotThrow(() => t.tick());
    assert(t.canEnter(a.tx, a.ty));
  } finally { LANDMARKS.splice(0, LANDMARKS.length, ...original); Math.random = random; }
});
