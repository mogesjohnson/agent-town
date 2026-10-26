import test from "node:test";
import assert from "node:assert/strict";
import { LANDMARKS } from "../sim.js";
import { loadCatalog } from "./catalog.js";
import { followAnchors } from "./anchors.js";
import { clash } from "./custom.js";

test("catalog survives a moved anchor when loading after world restoration", () => {
  const cafe = LANDMARKS.find((l) => l.name === "Cafe")!, original = { ...cafe };
  try {
    cafe.x = 0; cafe.y = 0;
    const catalog = loadCatalog();
    const place = catalog.find((p) => p.id === "cafe")!;
    assert(place); assert.equal(place.plot.x, 0); assert.equal(place.plot.y, 0);
  } finally { Object.assign(cafe, original); }
});
test("missing and renamed anchors remain detached until their stable id returns", () => {
  const before = [...LANDMARKS], cafe = LANDMARKS.find((l) => l.name === "Cafe")!;
  try {
    LANDMARKS.splice(LANDMARKS.indexOf(cafe), 1);
    const catalog = loadCatalog(), place = catalog.find((p) => p.id === "cafe")!;
    assert(place); assert.equal(place.detached, true);
    assert.equal(clash({ ...place, id: "new-venue", anchor: undefined }, [place]), undefined);
    LANDMARKS.push({ ...cafe, name: "Renamed Cafe" });
    followAnchors(catalog, [{ ...cafe, id: "cafe", name: "Renamed Cafe" }]);
    assert.equal(place.detached, undefined);
    assert.deepEqual(place.plot, { x: cafe.x, y: cafe.y });
  } finally { LANDMARKS.splice(0, LANDMARKS.length, ...before); }
});
