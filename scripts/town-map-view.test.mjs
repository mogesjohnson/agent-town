import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createMapView } from "../public/town-map-view.js";

const emptyMap = (version = 1) => ({ width: 40, height: 25, version,
  tiles: Array.from({ length: 25 }, () => Array(40).fill("grass")), buildings: [] });
function fixture(camera, initial = emptyMap()) {
  globalThis.window = new EventTarget();
  const labels = [];
  globalThis.document = { createElement: () => ({ dataset: {}, remove() { this.removed = true; } }) };
  globalThis.fetch = async () => ({ ok: true, json: async () => initial });
  const view = { scene: new THREE.Scene(), camera,
    controls: { domElement: { getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 600 }) } },
    overlay: { append(label) { labels.push(label); } }, project(p, label) { label.projected = p.clone(); } };
  const bridge = createMapView(view);
  return { bridge, view, labels, root: view.scene.getObjectByName("editable-map") };
}
test("map events update tiles, buildings and labels without touching scenery", async () => {
  const { bridge, view, root, labels } = fixture(new THREE.PerspectiveCamera());
  const scenery = new THREE.Group(); view.scene.add(scenery);
  await bridge.ready;
  const map = emptyMap(2); map.tiles[8][6] = "road"; map.tiles[9][7] = "tree";
  map.buildings.push({ id: "house-1", type: "house", x: 2, y: 3, w: 3, h: 3, name: "<b>Bakery</b>" });
  window.dispatchEvent(new CustomEvent("agenttown:map", { detail: { map } }));
  const road = root.getObjectByName("map-tiles:road"), matrix = new THREE.Matrix4();
  assert.equal(road.count, 1); road.getMatrixAt(0, matrix);
  assert.equal(matrix.elements[12], -13.5);
  assert.ok(Math.abs(matrix.elements[14] + 4.8) < 0.001);
  assert.ok(root.getObjectByName("painted-tree"));
  const house = root.getObjectByName("map-building:house-1");
  assert.equal(house.position.x, -16.5); assert.equal(labels[0].textContent, "<b>Bakery</b>");
  map.version = 3; map.buildings[0].x = 20; map.tiles[8][6] = "grass";
  bridge.update(map); bridge.animate();
  assert.equal(root.getObjectByName("map-tiles:road"), undefined);
  assert.equal(root.getObjectByName("map-building:house-1"), house);
  assert.equal(house.position.x, 1.5); assert.equal(labels[0].projected.x, 1.5);
  bridge.update(emptyMap(1)); assert.ok(root.getObjectByName("map-building:house-1"));
  bridge.update(emptyMap(4));
  assert.equal(root.getObjectByName("map-building:house-1"), undefined); assert.equal(labels[0].removed, true);
  bridge.dispose(); assert.deepEqual(view.scene.children, [scenery]);
  assert.equal(window.agentTown.pickCell, undefined);
  window.dispatchEvent(new CustomEvent("agenttown:map", { detail: { map } }));
  assert.equal(root.children[0].children.length, 0);
});
test("ray picking maps both camera types to exact 40 by 25 cells", async () => {
  for (const camera of [new THREE.PerspectiveCamera(55, 4 / 3, 0.1, 200), new THREE.OrthographicCamera(-26, 26, 19.5, -19.5, 0.1, 200)]) {
    camera.position.set(0, 40, 30); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const { bridge } = fixture(camera); await bridge.ready;
    for (const [x, y] of [[0, 0], [6, 8], [20, 12], [39, 24]]) {
      const point = new THREE.Vector3(x + 0.5 - 20, 0.16, (y + 0.5) * 1.2 - 15).project(camera);
      assert.deepEqual(bridge.pickCell(10 + (point.x + 1) * 400, 20 + (1 - point.y) * 300), { x, y });
    }
    assert.equal(bridge.pickCell(0, 0), null); bridge.dispose();
    assert.equal(bridge.pickCell(410, 320), null);
  }
});
test("late initial fetch cannot undo a newer event and cleanup restores picking", async () => {
  const { bridge } = fixture(new THREE.PerspectiveCamera()); await bridge.ready; bridge.dispose();
  const previous = () => "previous"; window.agentTown.pickCell = previous;
  let finish;
  globalThis.fetch = () => new Promise((resolve) => { finish = resolve; });
  const scene = new THREE.Scene();
  const active = createMapView({ scene, camera: new THREE.PerspectiveCamera(),
    controls: { domElement: {} }, overlay: { append() {} }, project() {} });
  const newer = emptyMap(5); newer.tiles[0][0] = "water";
  window.dispatchEvent(new CustomEvent("agenttown:map", { detail: { map: newer } }));
  finish({ ok: true, json: async () => emptyMap(1) }); await active.ready;
  assert.ok(scene.getObjectByName("map-tiles:water"));
  active.dispose(); active.dispose(); assert.equal(window.agentTown.pickCell, previous);
});
