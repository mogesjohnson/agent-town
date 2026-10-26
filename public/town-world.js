import * as THREE from "three";

// Original CC0 geometry: one shared cube and a small reusable palette.
export function buildWorld() {
  const root = new THREE.Group(), cube = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map(), glow = [], lamps = [], labels = [];
  function box(parent, color, x, y, z, w, h, d) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshLambertMaterial({ color }));
    const mesh = new THREE.Mesh(cube, materials.get(color));
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const block = (...args) => box(root, ...args);
  function luminous(mesh) {
    mesh.material = mesh.material.clone();
    mesh.material.emissive.set("#ffc875");
    glow.push(mesh.material);
  }
  block("#777658", 0, -0.65, 0, 40.4, 1.1, 30.4);
  block("#a3bd78", 0, -0.12, 0, 40, 0.25, 30);
  for (let x = -20; x < 20; x++) for (let z = -15; z < 15; z++) {
    if ((x + z) % 3 === 0) block("#acc580", x + 0.5, 0.015, z + 0.5, 1, 0.025, 1);
  }
  for (const [x, z] of [[-5, -3], [5, -3], [-5, 3], [5, 3], [-12, 1.8], [12, 1.8]]) {
    block("#54655c", x, 1.6, z, 0.13, 3.2, 0.13);
    block("#66736a", x, 3.25, z, 0.7, 0.12, 0.7);
    const glass = block("#ffe0a0", x, 3, z, 0.45, 0.5, 0.45);
    luminous(glass);
    const light = new THREE.PointLight("#ffc77c", 0, 9, 2);
    light.position.set(x, 2.9, z); root.add(light); lamps.push(light);
  }
  // Batch static cubes by material so night lighting stays inexpensive.
  root.updateMatrixWorld(true);
  const batches = new Map();
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push(mesh);
  });
  for (const [material, meshes] of batches) {
    const batch = new THREE.InstancedMesh(cube, material, meshes.length);
    batch.castShadow = batch.receiveShadow = true;
    meshes.forEach((mesh, i) => {
      batch.setMatrixAt(i, mesh.matrixWorld);
      mesh.removeFromParent();
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingSphere();
    root.add(batch);
  }
  return { root, glow, lamps, labels };
}
