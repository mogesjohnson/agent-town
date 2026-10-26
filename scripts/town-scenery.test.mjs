import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createScenery } from "../public/town-scenery.js";

test("newer scenery wins, house moves keep identity and disposed scenes stay empty", () => {
  const root = new THREE.Group(), material = new THREE.MeshStandardMaterial(), glow = [];
  const scenery = createScenery(root, { plaster: material, tiles: material, cobble: material, glow });
  const map = (version, x = 2) => ({ width: 40, height: 25, version,
    scenery: [{ id: "building:home", kind: "house", x, y: 2, w: 3, h: 3 }] });
  scenery.apply(map(5));
  const house = root.getObjectByName("building:home");
  assert.ok(house.children.every((o) => o.castShadow && o.receiveShadow));
  assert.equal(glow.length, 1);
  glow[0].emissiveIntensity = 1.5;
  assert.ok(house.children.some((o) => o.material.emissiveIntensity === 1.5));
  scenery.apply(map(6, 10));
  assert.equal(root.getObjectByName("building:home"), house);
  const moved = house.position.x;
  scenery.apply(map(4));
  assert.equal(house.position.x, moved, "late initial response cannot roll back movement");
  scenery.apply({ width: 40, height: 25, scenery: [] });
  assert.equal(root.getObjectByName("building:home"), house, "unversioned fallback cannot replace saved map");
  scenery.apply({ ...map(7), scenery: [] });
  assert.equal(glow.length, 0, "removed window material leaves lighting registry");
  scenery.dispose(); scenery.apply(map(8));
  assert.equal(root.children.length, 0);
  material.dispose();
});
