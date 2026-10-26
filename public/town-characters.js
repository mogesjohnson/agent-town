import * as THREE from "three";

export function createCrowd(scene) {
  const people = new Map(), geometry = new THREE.BoxGeometry(1, 1, 1);
  const palette = new Map();
  function part(parent, color, x, y, z, w, h, d) {
    if (!palette.has(color)) palette.set(color, new THREE.MeshLambertMaterial({ color }));
    const mesh = new THREE.Mesh(geometry, palette.get(color));
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function make(agent, index) {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body); scene.add(root);
    const kind = ["claude-code", "codex", "grok", "gemini", "ollama"].indexOf(agent.provider);
    const style = kind < 0 ? index % 5 : kind;
    const coat = ["#cb8b64", "#69a99a", "#8f80ae", "#7b9ec9", "#c6c4ab"][style];
    const b = (...args) => part(body, ...args);
    b(coat, 0, 0.95, 0, 0.65, 0.7, 0.4);
    b("#eed3ad", 0, 1.6, 0, 0.65, 0.6, 0.56);
    b("#56483f", 0, 1.92, -0.05, 0.7, 0.15, 0.6);
    for (const x of [-0.16, 0.16]) b("#293d40", x, 1.65, 0.3, 0.09, 0.1, 0.05);
    const limbs = [-1, 1].map((side) => {
      const leg = new THREE.Group(); leg.position.set(side * 0.19, 0.6, 0); body.add(leg);
      part(leg, "#4c5a61", 0, -0.25, 0, 0.24, 0.5, 0.26);
      part(leg, "#554b42", 0, -0.5, 0.05, 0.27, 0.15, 0.4);
      const arm = new THREE.Group(); arm.position.set(side * 0.44, 1.22, 0); body.add(arm);
      part(arm, coat, 0, -0.22, 0, 0.2, 0.46, 0.26);
      part(arm, "#eed3ad", 0, -0.48, 0, 0.2, 0.17, 0.24);
      return { leg, arm, side };
    });
    if (style === 0) { // Librarian glasses and book.
      b("#684e41", 0, 1.63, 0.34, 0.55, 0.06, 0.06);
      b("#ad634c", -0.5, 0.8, 0.22, 0.18, 0.38, 0.28);
    } else if (style === 1) { // Robot visor and antenna.
      b("#c0d8cb", 0, 1.7, 0, 0.74, 0.55, 0.64);
      b("#355d60", 0, 1.73, 0.34, 0.58, 0.18, 0.05);
      b("#9de2bd", 0, 2.12, 0, 0.12, 0.35, 0.12);
    } else if (style === 2) { // Violet star-gazer's hat.
      b("#675485", 0, 1.99, 0, 0.95, 0.12, 0.8);
      b("#796497", 0, 2.2, 0, 0.55, 0.38, 0.5);
      b("#f4d98b", 0, 2.2, 0.27, 0.16, 0.16, 0.08);
    } else if (style === 3) {
      b("#7292b9", 0, 1.97, 0, 0.9, 0.12, 0.8);
      b("#d9b75c", 0, 1.2, 0.23, 0.6, 0.12, 0.1);
    } else { // Llama ears and muzzle.
      for (const x of [-0.22, 0.22]) b("#e1ddbf", x, 2.08, 0, 0.17, 0.5, 0.2);
      b("#e6ddc6", 0, 1.48, 0.4, 0.38, 0.25, 0.28);
    }
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12),
      new THREE.MeshBasicMaterial({ color: "#344b45", transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.25; root.add(shadow);
    return { root, body, limbs, shadow, target: new THREE.Vector3(), agent, index };
  }
  function update(state) {
    const names = new Set(state.agents.map((a) => a.name));
    for (const [name, p] of people) if (!names.has(name)) {
      scene.remove(p.root); p.shadow.geometry.dispose(); p.shadow.material.dispose(); people.delete(name);
    }
    state.agents.forEach((agent, index) => {
      let p = people.get(agent.name);
      if (p && p.agent.provider !== agent.provider) {
        scene.remove(p.root); p.shadow.geometry.dispose(); p.shadow.material.dispose();
        people.delete(agent.name); p = null;
      }
      const fresh = !p;
      if (fresh) { p = make(agent, index); people.set(agent.name, p); }
      p.agent = agent;
      p.target.set((agent.x + 0.5) * 40 / state.w - 20, 0.18, (agent.y + 0.5) * 30 / state.h - 15);
      if (fresh || state.paused) p.root.position.copy(p.target);
      p.paused = state.paused;
      p.body.scale.setScalar(agent.status === "unavailable" ? 0.82 : 1);
    });
  }
  let previous = 0, clock = 0;
  function animate(now) {
    const dt = Math.min((now - previous) / 1000, 0.05); previous = now;
    if (![...people.values()].some((p) => p.paused)) clock += dt;
    for (const p of people.values()) {
      const delta = p.target.clone().sub(p.root.position);
      const moving = !p.paused && delta.lengthSq() > 0.002;
      if (moving) {
        p.root.position.lerp(p.target, 1 - Math.exp(-dt * 12));
        p.body.rotation.y = Math.atan2(delta.x, delta.z);
      }
      const swing = moving ? Math.sin(clock * 13 + p.index) * 0.55 : 0;
      p.body.position.y = moving ? Math.abs(Math.sin(clock * 13 + p.index)) * 0.1 : 0;
      for (const { leg, arm, side } of p.limbs) { leg.rotation.x = swing * side; arm.rotation.x = -swing * side; }
    }
  }
  return { people, update, animate };
}
