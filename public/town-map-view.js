import * as THREE from "three";

export function createMapView(view) {
  const root = new THREE.Group(), tiles = new THREE.Group(), buildings = new Map();
  root.name = "editable-map"; root.add(tiles); view.scene.add(root);
  const cube = new THREE.BoxGeometry(1, 1, 1), cone = new THREE.ConeGeometry(1, 1, 12);
  const sphere = new THREE.SphereGeometry(1, 12, 8), materials = new Map();
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.16);
  const canvas = view.controls?.domElement ?? view.overlay.parentElement.querySelector("canvas");
  const abort = new AbortController();
  let width = 40, height = 25, version = -1, disposed = false;
  const material = (color) => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.83 }));
    return materials.get(color);
  };
  function part(parent, color, x, y, z, w, h, d, geometry = cube) {
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function tree(parent, x, z, scale = 1) {
    part(parent, "#725d44", x, 0.8 * scale, z, 0.16 * scale, 1.6 * scale, 0.16 * scale);
    part(parent, "#547a45", x, 1.8 * scale, z, 0.8 * scale, 1.1 * scale, 0.8 * scale, sphere);
  }
  function build(b) {
    const group = new THREE.Group(), label = document.createElement("span");
    group.name = `map-building:${b.id}`;
    const w = b.w * 40 / width, d = b.h * 30 / height;
    if (["plaza", "park"].includes(b.type)) {
      part(group, b.type === "park" ? "#8cad70" : "#c7ba9d", 0, 0.14, 0, w, 0.1, d);
      if (b.type === "park") for (const side of [-1, 1]) tree(group, side * w * 0.3, -d * 0.25, 1.2);
    } else {
      part(group, "#a59e8a", 0, 0.24, 0, w * 0.92, 0.35, d * 0.92);
      part(group, ({ cafe: "#e1c4a7", library: "#abbdb8", shop: "#b8abc7" })[b.type] ?? "#decba7",
        0, 1.4, 0, w * 0.82, 2.3, d * 0.8);
      const roof = part(group, "#775f50", 0, 3.1, 0, w * 0.7, 1.3, d * 0.7, cone);
      roof.geometry = roofGeometry;
      part(group, "#665044", 0, 1.02, d * 0.405, 0.6, 1.55, 0.07);
      for (const side of [-1, 1]) part(group, "#bed9dd", side * w * 0.27, 1.75, d * 0.41, w * 0.17, 0.9, 0.08);
    }
    label.className = "town-sign"; label.dataset.mapBuilding = b.id;
    label.textContent = b.name ?? b.id; view.overlay.append(label); root.add(group);
    return { group, label, position: new THREE.Vector3(), shape: `${b.type}:${b.w}:${b.h}` };
  }
  const roofGeometry = new THREE.ConeGeometry(1, 1, 4);
  roofGeometry.rotateY(Math.PI / 4);
  function update(map) {
    if (disposed || !map?.tiles || !Array.isArray(map.buildings)) return;
    if (Number.isFinite(map.version) && map.version < version) return;
    width = map.width; height = map.height; version = map.version ?? version;
    // Shared geometry/materials survive rebuilds; InstancedMesh owns its instance data.
    for (const tile of [...tiles.children]) { tile.removeFromParent(); tile.dispose?.(); }
    const palette = { road: "#bdb298", water: "#6aabb2", hill: "#99946b", tree: "#71945a" };
    for (const [type, color] of Object.entries(palette)) {
      const cells = [];
      map.tiles.forEach((row, y) => row.forEach((t, x) => { if (t === type) cells.push({ x, y }); }));
      if (!cells.length) continue;
      const batch = new THREE.InstancedMesh(cube, material(color), cells.length);
      batch.name = `map-tiles:${type}`; batch.receiveShadow = true; tiles.add(batch);
      const matrix = new THREE.Matrix4();
      cells.forEach(({ x, y }, index) => {
        matrix.makeScale(40 / width, type === "hill" ? 0.7 : 0.08, 30 / height);
        matrix.setPosition((x + 0.5) * 40 / width - 20, type === "hill" ? 0.4 : 0.16, (y + 0.5) * 30 / height - 15);
        batch.setMatrixAt(index, matrix);
      });
      batch.instanceMatrix.needsUpdate = true; batch.computeBoundingSphere();
      if (type === "tree") for (const [geometry, color, h, scale] of [
        [cube, "#725d44", 0.56, [0.112, 1.12, 0.112]], [sphere, "#547a45", 1.26, [0.56, 0.77, 0.56]],
      ]) {
        const trees = new THREE.InstancedMesh(geometry, material(color), cells.length);
        trees.name = "painted-tree"; trees.castShadow = trees.receiveShadow = true; tiles.add(trees);
        cells.forEach(({ x, y }, index) => {
          matrix.makeScale(...scale);
          matrix.setPosition((x + 0.5) * 40 / width - 20, h, (y + 0.5) * 30 / height - 15);
          trees.setMatrixAt(index, matrix);
        });
        trees.instanceMatrix.needsUpdate = true; trees.computeBoundingSphere();
      }
    }
    const present = new Set(map.buildings.map((b) => b.id));
    for (const [id, item] of buildings) if (!present.has(id)) {
      item.group.removeFromParent(); item.label.remove(); buildings.delete(id);
    }
    for (const b of map.buildings) {
      let item = buildings.get(b.id);
      if (item && item.shape !== `${b.type}:${b.w}:${b.h}`) {
        item.group.removeFromParent(); item.label.remove(); buildings.delete(b.id); item = null;
      }
      if (!item) { item = build(b); buildings.set(b.id, item); }
      item.group.position.set((b.x + b.w / 2) * 40 / width - 20, 0, (b.y + b.h / 2) * 30 / height - 15);
      item.position.copy(item.group.position).add(new THREE.Vector3(0, ["park", "plaza"].includes(b.type) ? 1.3 : 4, 0));
      item.label.textContent = b.name ?? b.id;
    }
  }
  function pickCell(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width, y = (clientY - rect.top) / rect.height;
    if (disposed || x < 0 || y < 0 || x >= 1 || y >= 1) return null;
    view.camera.updateMatrixWorld();
    ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), view.camera);
    const point = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!point) return null;
    const cell = { x: Math.floor((point.x + 20) * width / 40), y: Math.floor((point.z + 15) * height / 30) };
    return cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height ? cell : null;
  }
  const namespace = window.agentTown ??= {}, previousPick = namespace.pickCell;
  namespace.pickCell = pickCell;
  const onMap = (event) => update(event.detail?.map);
  window.addEventListener("agenttown:map", onMap);
  const ready = fetch("/api/map", { signal: abort.signal }).then((response) => {
    if (!response.ok) throw Error(`Map unavailable (${response.status})`);
    return response.json();
  }).then(update).catch((error) => { if (!abort.signal.aborted) throw error; });
  return {
    update, pickCell, ready,
    animate() { for (const item of buildings.values()) view.project(item.position, item.label); },
    dispose() {
      if (disposed) return;
      disposed = true; abort.abort(); window.removeEventListener("agenttown:map", onMap);
      if (namespace.pickCell === pickCell) {
        if (previousPick) namespace.pickCell = previousPick; else delete namespace.pickCell;
      }
      for (const item of buildings.values()) item.label.remove(); buildings.clear();
      for (const item of tiles.children) item.dispose?.();
      root.removeFromParent();
      [cube, cone, sphere, roofGeometry].forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
