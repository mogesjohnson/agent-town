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
  // Subtle checkerboard grass rather than a wire grid.
  for (let x = -20; x < 20; x++) for (let z = -15; z < 15; z++) {
    if ((x + z) % 3 === 0) block("#acc580", x + 0.5, 0.015, z + 0.5, 1, 0.025, 1);
  }
  block("#d6c6a1", 0, 0.055, 0, 40, 0.08, 2.5);
  block("#d6c6a1", 0, 0.055, 0, 2.5, 0.08, 30);
  block("#c2b79c", 0, 0.09, 0, 10, 0.12, 8);
  for (let x = -4; x <= 4; x++) for (let z = -3; z <= 3; z++) {
    block((x + z) % 2 ? "#e6d9b8" : "#d9cba9", x, 0.17, z, 0.94, 0.06, 0.94);
  }
  // A little tiered fountain at the heart of the plaza.
  block("#8c9d9b", 0, 0.35, 0, 3.8, 0.45, 3.8);
  block("#6bb8bd", 0, 0.59, 0, 3.2, 0.08, 3.2);
  block("#b2c2b7", 0, 1.05, 0, 0.65, 1.2, 0.65);
  block("#c9d5bc", 0, 1.65, 0, 1.8, 0.25, 1.8);
  block("#83d0cc", 0, 1.81, 0, 1.4, 0.08, 1.4);
  block("#bce9da", 0, 2.18, 0, 0.25, 0.65, 0.25);
  function house(name, x, wall, roof) {
    const g = new THREE.Group();
    g.position.set(x, 0, -10.5);
    root.add(g);
    const b = (...args) => box(g, ...args);
    block("#d6c6a1", x, 0.05, -5.2, 1.5, 0.07, 8);
    b("#a99b81", 0, 0.18, 0, 5, 0.35, 4.6);
    b(wall, 0, 1.65, 0, 4.5, 3, 4);
    for (const sx of [-2.15, 2.15]) b("#f6dfb1", sx, 1.65, 0, 0.2, 3, 4.05);
    for (let i = 0; i < 5; i++) {
      b(roof, 0, 3.15 + i * 0.32, 0, 5.1 - i * 0.82, 0.34, 4.7);
    }
    b("#69564e", 1.25, 4.3, -0.7, 0.6, 1.5, 0.7);
    b("#e8d2ae", 1.25, 5.08, -0.7, 0.8, 0.16, 0.9);
    b("#725645", 0, 0.95, 2.03, 0.9, 1.65, 0.13);
    b("#d3ad64", 0.25, 1, 2.13, 0.1, 0.1, 0.1);
    for (const wx of [-1.35, 1.35]) {
      b("#f4dfb3", wx, 1.9, 2.04, 1, 1.3, 0.15);
      const window = b("#8dbdc2", wx, 1.9, 2.14, 0.76, 1, 0.1);
      luminous(window);
      b("#f6dfb1", wx, 1.9, 2.22, 0.08, 1, 0.06);
      b("#f6dfb1", wx, 1.9, 2.22, 0.76, 0.08, 0.06);
      b("#745847", wx, 1.15, 2.25, 1.12, 0.3, 0.4);
      for (const dx of [-0.32, 0, 0.32]) b("#dd8e8c", wx + dx, 1.42, 2.25, 0.2, 0.24, 0.2);
    }
    b("#e4d3b3", 0, 0.15, 2.6, 1.5, 0.3, 0.8);
    labels.push({ text: name, position: new THREE.Vector3(x, 5.5, -10.5) });
  }
  house("Claude · The Library", -14, "#e5bc86", "#a15c50");
  house("Codex · Workshop", -5, "#a2b8ad", "#4c7f7c");
  house("Grok · Stargazer", 5, "#b5a8c5", "#695c88");
  house("Ollama · Garden House", 14, "#e6d0a7", "#849c66");
  function tree(x, z, variant = 0) {
    const h = 2.5 + variant * 0.35;
    block("#856748", x, h / 2, z, 0.48, h, 0.48);
    block("#658958", x, h, z, 2.2, 1.5, 2.1);
    block(variant % 2 ? "#aabc74" : "#85a666", x - 0.2, h + 0.8, z, 1.9, 1.2, 1.8);
    block("#b1c47d", x - 0.3, h + 1.35, z - 0.15, 1.1, 0.6, 1.1);
  }
  for (let i = 0; i < 10; i++) {
    tree(-18.5 + i * 4, 13.2, i % 3);
    if (i % 2 === 0) tree(-18.5 + i * 4, -14, i % 3);
  }
  for (const z of [-6, -1, 5, 9]) { tree(-18, z, 1); tree(18.5, z, 2); }
  // Stepped pond edge, reeds, lilies and a timber footbridge.
  block("#c8bc91", 12, 0.06, 7, 8.6, 0.16, 6.6);
  block("#6bafb2", 12, 0.16, 7, 7.8, 0.12, 5.8);
  block("#87c4c0", 11.4, 0.23, 6.4, 6.3, 0.025, 4.5);
  for (const [x, z] of [[9, 6], [13, 8.5], [14.5, 5.5]]) {
    block("#7b9e63", x, 0.27, z, 0.65, 0.06, 0.65);
    block("#f2c6c5", x, 0.38, z, 0.23, 0.2, 0.23);
  }
  for (let i = 0; i < 9; i++) block("#a5815b", 12, 0.45, 4 + i * 0.72, 1.5, 0.22, 0.64);
  for (const x of [11.2, 12.8]) block("#715b45", x, 0.9, 7, 0.12, 0.12, 6.8);
  for (let i = 0; i < 7; i++) block("#7a9454", 8.2, 0.65, 4.8 + i * 0.65, 0.12, 1.1, 0.12);
  function bench(x, z, angle = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = angle; root.add(g);
    box(g, "#9c734d", 0, 0.65, 0, 2, 0.2, 0.7);
    box(g, "#b28c5f", 0, 1.2, -0.35, 2, 0.8, 0.13);
    for (const dx of [-0.7, 0.7]) box(g, "#53655c", dx, 0.3, 0, 0.15, 0.6, 0.6);
  }
  bench(-4, 4); bench(4, 4); bench(-8, 7, Math.PI / 2);
  for (const [x, z] of [[-5, -3], [5, -3], [-5, 3], [5, 3], [-12, 1.8], [12, 1.8]]) {
    block("#54655c", x, 1.6, z, 0.13, 3.2, 0.13);
    block("#66736a", x, 3.25, z, 0.7, 0.12, 0.7);
    const glass = block("#ffe0a0", x, 3, z, 0.45, 0.5, 0.45);
    luminous(glass);
    const light = new THREE.PointLight("#ffc77c", 0, 9, 2);
    light.position.set(x, 2.9, z); root.add(light); lamps.push(light);
  }
  // Picket fences, garden beds, mushrooms, and wildflowers.
  for (let x = -17; x < 18; x += 0.75) {
    if (Math.abs(x) > 1.4) block("#e8d7ad", x, 0.65, 11, 0.14, 1.1, 0.14);
  }
  for (const x of [-9.5, 9.5]) block("#ddcba0", x, 0.7, 11, 15, 0.14, 0.14);
  for (let i = 0; i < 70; i++) {
    const x = ((i * 17) % 37) - 18, z = ((i * 11) % 9) + 3;
    if (x > 7 && x < 17 && z < 11 || Math.abs(x) < 6 && z < 5) continue;
    block("#6c9057", x, 0.22, z, 0.08, 0.4, 0.08);
    block(["#eab5ac", "#f0d689", "#d4c9e3"][i % 3], x, 0.45, z, 0.22, 0.18, 0.22);
  }
  return { root, glow, lamps, labels };
}
