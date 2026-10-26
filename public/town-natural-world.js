import * as THREE from "three";
import { createScenery, fallbackMap } from "./town-scenery.js";

// Scanned materials and foliage remain local after asset setup; voxel style is separate.
export function buildNaturalWorld() {
  const root = new THREE.Group(), glow = [], lamps = [], labels = [];
  const textures = new Set(), pending = [], materials = new Map();
  let disposed = false;
  function pbr(id, repeat = 1, color = "#ffffff") {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.88 });
    for (const [suffix, key] of [["diff", "map"], ["nor_gl", "normalMap"], ["rough", "roughnessMap"]]) {
      pending.push(new THREE.TextureLoader().loadAsync(`/assets/natural/${id}/${id}_${suffix}_1k.jpg`).then((texture) => {
        if (disposed) { texture.dispose(); return; }
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeat, repeat);
        texture.anisotropy = 4;
        if (key === "map") texture.colorSpace = THREE.SRGBColorSpace;
        textures.add(texture); material[key] = texture; material.needsUpdate = true;
      }));
    }
    return material;
  }
  const grass = pbr("forrest_ground_01", 14, "#bbc9a0");
  const cobble = pbr("cobblestone_floor_08", 5);
  const plaster = pbr("plastered_wall_04", 2);
  const tiles = pbr("roof_tiles_14", 3);
  const wood = pbr("wood_planks_grey", 2, "#937961");
  function plain(color, properties = {}) {
    const key = color + JSON.stringify(properties);
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...properties }));
    return materials.get(key);
  }
  function mesh(geometry, material, x, y, z, parent = root) {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(x, y, z); item.castShadow = item.receiveShadow = true;
    parent.add(item); return item;
  }
  function ground(material, x, z, w, d, y = 0.02) {
    const item = mesh(new THREE.PlaneGeometry(w, d), material, x, y, z);
    item.rotation.x = -Math.PI / 2; item.castShadow = false; return item;
  }
  ground(grass, 0, 0, 120, 120, -0.02);
  const scenery = createScenery(root, { cobble, plaster, tiles, glow });
  pending.push((async () => {
    let map;
    try { const response = await fetch("/api/map"); if (response.ok) map = await response.json(); } catch { /* static preview */ }
    if (!map?.scenery) map = fallbackMap(await (await fetch("/world-default.json")).json());
    scenery.apply(map);
  })());
  for (const [x, z] of [[-5, -3], [5, -3], [-5, 3], [5, 3], [-12, 2], [12, 2]]) {
    const metal = plain("#333d38", { metalness: 0.65, roughness: 0.3 });
    mesh(new THREE.CylinderGeometry(0.05, 0.09, 3.3, 12), metal, x, 1.65, z);
    const lantern = plain("#fff0cc", { emissive: "#ffd49b", emissiveIntensity: 0.1 }).clone(); glow.push(lantern);
    mesh(new THREE.SphereGeometry(0.22, 16, 12), lantern, x, 3.35, z);
    mesh(new THREE.ConeGeometry(0.38, 0.2, 16), metal, x, 3.65, z);
    const light = new THREE.PointLight("#ffd49b", 0, 10, 2);
    light.position.set(x, 3.3, z); root.add(light); lamps.push(light);
  }
  const ready = Promise.all(pending);
  return { root, glow, lamps, labels, ready, materials: { plaster, tiles, wood }, applyScenery: (map) => scenery.apply(map),
    dispose() { disposed = true; scenery.dispose(); textures.forEach((t) => t.dispose()); } };
}
