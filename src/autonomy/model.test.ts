import { test } from "node:test";
import { strict as assert } from "node:assert";
import { chooseGoal } from "./model.js";

const agent = { name: "Ada", personality: "quiet reader", x: 1, y: 1, met: { Ben: 3 } };
const needs = { hunger: 80, energy: 80, social: 80 };
const places = [{ name: "Cafe", x: 5, y: 5 }, { name: "Park", x: 30, y: 20 }, { name: "Library", x: 8, y: 19 }];
test("hunger and energy drive useful destinations", () => {
  assert.equal(chooseGoal(agent, { ...needs, hunger: 10 }, places, [], 40, 25).name, "Cafe");
  assert.equal(chooseGoal(agent, { ...needs, energy: 10 }, places, [], 40, 25).action, "rest");
});
test("loneliness favors less familiar residents and personality favors books", () => {
  const others = ["Ben", "Cora"].map((name) => ({ ...agent, name }));
  assert.equal(chooseGoal(agent, { ...needs, social: 5 }, places, others, 40, 25, () => 0.5).name, "Cora");
  assert.equal(chooseGoal(agent, needs, places, [], 40, 25, () => 0.5).name, "Library");
});
test("destinations stay inside the map even after malformed place coordinates", () => {
  const g = chooseGoal(agent, { ...needs, hunger: 1 }, [{ name: "Cafe", x: -50, y: 200 }], [], 40, 25);
  assert.equal(g.x, 0); assert.equal(g.y, 24);
  const explore = chooseGoal(agent, needs, [], [], 40, 25, () => 0.999);
  assert.equal(explore.action, "explore"); assert.equal(explore.x, 39); assert.equal(explore.y, 24);
});
