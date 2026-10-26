import * as THREE from "three";
import { GLTFLoader } from "/vendor/loaders/GLTFLoader.js";

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
  const box = (material, x, y, z, w, h, d, parent) => mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent);
  function ground(material, x, z, w, d, y = 0.02) {
    const item = mesh(new THREE.PlaneGeometry(w, d), material, x, y, z);
    item.rotation.x = -Math.PI / 2; item.castShadow = false; return item;
  }
  ground(grass, 0, 0, 120, 120, -0.02);
  ground(cobble, 0, 0, 40, 2.6);
  ground(cobble, 0, 0, 2.6, 30, 0.025);
  ground(cobble, 0, 0, 10, 8, 0.03);
  // A proper pitched roof uses a continuous extruded profile with scanned tiles.
  const profile = new THREE.Shape();
  profile.moveTo(-2.7, 0); profile.lineTo(0, 2); profile.lineTo(2.7, 0); profile.closePath();
  const roofGeometry = new THREE.ExtrudeGeometry(profile, { depth: 5.3, bevelEnabled: false });
  roofGeometry.translate(0, 0, -2.65);
  for (const [index, name] of ["Claude · Library", "Codex · Workshop", "Grok · Observatory", "Ollama · Garden"].entries()) {
    const x = -14 + index * 9.3, z = -10.3;
    const house = new THREE.Group(); house.position.set(x, 0, z); root.add(house);
    ground(cobble, x, -5.5, 1.5, 7, 0.04);
    box(plain("#8d8c80"), 0, 0.2, 0, 5, 0.4, 4.8, house);
    box(plaster, 0, 1.9, 0, 4.6, 3.4, 4.6, house);
    mesh(roofGeometry, tiles, 0, 3.5, 0, house);
    box(plain("#7d7468"), 1.3, 4.7, -0.8, 0.65, 2, 0.65, house);
    box(wood, 0, 1.1, 2.34, 1.05, 2.1, 0.12, house);
    box(plain("#b7b2a2"), 0, 0.15, 2.8, 1.8, 0.3, 0.8, house);
    for (const wx of [-1.45, 1.45]) {
      box(wood, wx, 2, 2.36, 1.15, 1.45, 0.15, house);
      const glass = plain("#cbd9d0", { emissive: "#ffc77d", emissiveIntensity: 0.1 }).clone();
      glow.push(glass);
      box(glass, wx, 2, 2.46, 0.95, 1.25, 0.05, house);
      box(wood, wx, 2, 2.5, 0.045, 1.25, 0.05, house);
      box(wood, wx, 2, 2.5, 0.95, 0.045, 0.05, house);
      for (const dx of [-0.72, 0.72]) box(wood, wx + dx, 2, 2.36, 0.26, 1.4, 0.12, house);
    }
    labels.push({ text: name, position: new THREE.Vector3(x, 5.9, z) });
  }
  // Rounded stone fountain, shallow glossy water, and an irregular pond shoreline.
  const stone = plain("#b8b6a9");
  const water = new THREE.MeshPhysicalMaterial({ color: "#659b9a", metalness: 0.3, roughness: 0.16, clearcoat: 1 });
  mesh(new THREE.CylinderGeometry(2, 2.15, 0.45, 48), stone, 0, 0.25, 0);
  mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.04, 48), water, 0, 0.5, 0);
  mesh(new THREE.CylinderGeometry(0.25, 0.45, 1.3, 24), stone, 0, 1.1, 0);
  mesh(new THREE.CylinderGeometry(1, 0.7, 0.18, 32), stone, 0, 1.8, 0);
  const pond = new THREE.Shape();
  const outline = Array.from({ length: 15 }, (_, i) => {
    const a = i / 14 * Math.PI * 2, r = 1 + Math.sin(i * 3) * 0.09;
    return new THREE.Vector2(Math.cos(a) * 4 * r, Math.sin(a) * 3 * r);
  });
  const curve = new THREE.SplineCurve(outline);
  pond.setFromPoints(curve.getPoints(90));
  const lake = mesh(new THREE.ShapeGeometry(pond), water, 12, 0.055, 7);
  lake.rotation.x = -Math.PI / 2; lake.castShadow = false;
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    const rock = mesh(new THREE.DodecahedronGeometry(0.4 + (i % 3) * 0.1, 1), stone, 12 + Math.cos(a) * 4.2, 0.16, 7 + Math.sin(a) * 3.2);
    rock.scale.set(1.2, 0.7, 0.8); rock.rotation.set(i, i * 2, 0);
  }
  box(wood, 12, 0.32, 7, 1.5, 0.18, 7.2);
  for (const x of [11.2, 12.8]) box(wood, x, 1.1, 7, 0.08, 0.08, 7.2);
  for (const z of [3.5, 7, 10.5]) for (const x of [11.2, 12.8]) box(wood, x, 0.7, z, 0.12, 1.4, 0.12);
  for (const [x, z] of [[-5, -3], [5, -3], [-5, 3], [5, 3], [-12, 2], [12, 2]]) {
    const metal = plain("#333d38", { metalness: 0.65, roughness: 0.3 });
    mesh(new THREE.CylinderGeometry(0.05, 0.09, 3.3, 12), metal, x, 1.65, z);
    const lantern = plain("#fff0cc", { emissive: "#ffd49b", emissiveIntensity: 0.1 }).clone(); glow.push(lantern);
    mesh(new THREE.SphereGeometry(0.22, 16, 12), lantern, x, 3.35, z);
    mesh(new THREE.ConeGeometry(0.38, 0.2, 16), metal, x, 3.65, z);
    const light = new THREE.PointLight("#ffd49b", 0, 10, 2);
    light.position.set(x, 3.3, z); root.add(light); lamps.push(light);
  }
  pending.push(new GLTFLoader().loadAsync("/assets/natural/pine/pine_sapling_small_1k.gltf").then(({ scene }) => {
    scene.traverse((o) => {
      if (o.isMesh) { o.castShadow = o.receiveShadow = true; }
      for (const m of [o.material].flat().filter(Boolean)) for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
    });
    if (disposed) {
      scene.traverse((o) => { o.geometry?.dispose(); for (const m of [o.material].flat().filter(Boolean)) m.dispose(); });
      textures.forEach((t) => t.dispose()); return;
    }
    // This asset contains three alternative saplings, not one combined tree.
    const variants = scene.children;
    const positions = [[-18, 12], [-10, 14], [0, 14], [9, 14], [19, 12], [-19, -5], [19, -5], [-20, -14], [0, -16], [20, -14]];
    for (const [i, [x, z]] of positions.entries()) {
      const tree = variants[i % variants.length].clone(true);
      tree.position.set(0, 0, 0);
      const bounds = new THREE.Box3().setFromObject(tree), center = bounds.getCenter(new THREE.Vector3());
      const scale = (5.5 + i % 3) / (bounds.max.y - bounds.min.y);
      tree.scale.setScalar(scale); tree.position.set(x - center.x * scale, -bounds.min.y * scale, z - center.z * scale);
      tree.rotation.y = i * 2.4; root.add(tree);
    }
  }));
  const ready = Promise.all(pending);
  return { root, glow, lamps, labels, ready, materials: { plaster, tiles, wood },
    dispose() { disposed = true; textures.forEach((t) => t.dispose()); } };
}
