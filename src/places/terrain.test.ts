import test from "node:test";
import assert from "node:assert/strict";
import { buildPlace } from "./custom.js";
import { loadCatalog } from "./catalog.js";
const catalog = loadCatalog();
const request = { id: "test-venue", name: "Test Venue", type: catalog.find((p) => !p.anchor)!.type, x: 31, y: 22, w: 2, h: 2 };
test("custom venue validation checks every terrain cell before adding or moving", () => {
  const blocked = buildPlace(request, catalog, (x, y) => !(x === 32 && y === 23));
  assert("error" in blocked);
  assert.equal(blocked.status, 409);
  assert.match(blocked.error, /blocked terrain at 32,23/);
  const clear = buildPlace(request, catalog, () => true);
  assert("place" in clear);
  assert.equal(clear.place.id, request.id);
  assert.equal(catalog.some((p) => p.id === request.id), false);
});
