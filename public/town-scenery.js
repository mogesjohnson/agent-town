import * as THREE from "three";

const DRAWN = new Set(["house", "path", "tree", "pond"]);

export function cellFrame(item, width, height) {
  const w = item.w * 40 / width, d = item.h * 30 / height;
  return { x: (item.x + item.w / 2) * 40 / width - 20, z: (item.y + item.h / 2) * 30 / height - 15, w, d };
}

/** Used only when /api/map has no scenery yet. The JSON is the same seed the server loads. */
export function fallbackMap(layout) {
  const width = 40, height = 25, tiles = Array.from({ length: height }, () => Array(width).fill("grass"));
  const scenery = [];
  const paint = (x, y, type, kind, atmosphere) => {
    if (tiles[y]?.[x] !== "grass") return;
    tiles[y][x] = type;
    const prefix = kind === "path" ? "path" : kind === "tree" ? "tree" : "pond";
    scenery.push({ id: `${prefix}-${x}-${y}`, kind, x, y, w: 1, h: 1, atmosphere });
  };
  for (let x = 0; x < width; x++) paint(x, layout.roadRow, "road", "path");
  for (const col of layout.roadCols) for (let y = 0; y < height; y++) paint(col, y, "road", "path");
  for (const [x, y] of layout.trees) paint(x, y, "tree", "tree", "vegetation");
  for (let y = layout.pond.y; y < layout.pond.y + layout.pond.h; y++)
    for (let x = layout.pond.x; x < layout.pond.x + layout.pond.w; x++) paint(x, y, "water", "pond", "water");
  for (const house of layout.houses) scenery.push({
    id: `building:${house.id}`, kind: "house", x: house.x, y: house.y, w: 3, h: 3, buildingId: house.id, name: house.name,
  });
  return { width, height, tiles, scenery };
}

export function createScenery(root, mats) {
  const group = new THREE.Group();
  group.name = "town-scenery";
  root.add(group);
  const items = new Map();
  let disposed = false, version = -1;
  const waterBase = new THREE.MeshPhysicalMaterial({ color: "#659b9a", metalness: 0.3, roughness: 0.16, clearcoat: 1 });
  const trunk = new THREE.MeshStandardMaterial({ color: "#725d44", roughness: 0.9 });
  const leaf = new THREE.MeshStandardMaterial({ color: "#547a45", roughness: 0.85 });
  function drop(node) {
    node.removeFromParent();
    const owned = new Set();
    node.traverse((child) => {
      child.geometry?.dispose();
      if (child.material?.isMeshPhysicalMaterial) child.material.dispose();
      if (child.material?.userData.ownedScenery) owned.add(child.material);
    });
    for (const material of owned) {
      const index = mats.glow?.indexOf(material) ?? -1;
      if (index >= 0) mats.glow.splice(index, 1);
      material.dispose();
    }
  }
  function build(item) {
    const node = new THREE.Group();
    node.name = item.id;
    node.userData.worldId = item.id;
    node.userData.kind = item.kind;
    if (item.atmosphere) node.userData.atmosphere = item.atmosphere;
    if (item.kind === "path" || item.kind === "pond") {
      const material = item.kind === "pond" ? waterBase.clone() : mats.cobble;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = item.kind === "pond" ? 0.05 : 0.03;
      plane.receiveShadow = true;
      if (item.kind === "pond") plane.userData.atmosphere = "water";
      node.add(plane);
    } else if (item.kind === "tree") {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.1, 6), trunk);
      stem.position.y = 0.55; node.add(stem);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.2, 7), leaf);
      crown.position.y = 1.4; node.add(crown);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 1), mats.plaster);
      body.position.y = 0.55; node.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.45, 4), mats.tiles);
      roof.position.y = 1.15; roof.rotation.y = Math.PI / 4; node.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.04), mats.tiles);
      door.position.set(0, 0.375, 0.52); node.add(door);
      const glass = new THREE.MeshStandardMaterial({ color: "#d6dfd1", emissive: "#ffc77d", emissiveIntensity: 0.1 });
      glass.userData.ownedScenery = true; mats.glow?.push(glass);
      for (const x of [-0.32, 0.32]) {
        const window = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.04), glass);
        window.position.set(x, 0.7, 0.52); node.add(window);
      }
    }
    node.traverse((o) => { if (o.isMesh) { o.castShadow = !["path", "pond"].includes(item.kind); o.receiveShadow = true; } });
    return node;
  }
  function apply(map) {
    if (disposed || (version >= 0 && (!Number.isFinite(map?.version) || map.version < version))) return;
    if (Number.isFinite(map?.version)) version = map.version;
    const wanted = (map?.scenery ?? []).filter((item) => DRAWN.has(item.kind));
    const ids = new Set(wanted.map((item) => item.id));
    for (const [id, node] of items) if (!ids.has(id)) { drop(node); items.delete(id); }
    for (const item of wanted) {
      let node = items.get(item.id);
      if (!node) { node = build(item); items.set(item.id, node); group.add(node); }
      const frame = cellFrame(item, map.width, map.height);
      node.position.set(frame.x, 0, frame.z);
      if (item.kind === "path" || item.kind === "pond") node.children[0].scale.set(frame.w * 0.98, frame.d * 0.98, 1);
      else node.scale.setScalar(Math.min(frame.w, frame.d) * (item.kind === "house" ? 0.85 : 0.7));
    }
  }
  return {
    apply,
    dispose() { disposed = true; for (const node of items.values()) drop(node); items.clear(); group.removeFromParent(); waterBase.dispose(); trunk.dispose(); leaf.dispose(); },
  };
}
