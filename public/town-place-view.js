import * as THREE from "three";

// Places use the same grid conversion as residents, including custom places.
export function createPlaceView(view) {
  const entries = new Map();
  const group = new THREE.Group(); view.world.root.add(group);
  function remove(entry) {
    entry.sign.remove(); entry.root.removeFromParent();
    entry.root.traverse((o) => { o.geometry?.dispose(); });
    entry.materials.forEach((m) => m.dispose());
  }
  function make(place, state) {
    const root = new THREE.Group(); group.add(root);
    root.position.set((place.x + place.w / 2) * 40 / state.w - 20, 0.08,
      (place.y + place.h / 2) * 30 / state.h - 15);
    const width = place.w * 40 / state.w, depth = place.h * 30 / state.h;
    const materials = [];
    function material(color, base) {
      const m = base ? base.clone() : new THREE.MeshStandardMaterial({ roughness: 0.85 });
      m.color.set(color); materials.push(m); return m;
    }
    function box(w, h, d, x, y, z, mat) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
    }
    if (!place.anchor) {
      const wall = material(place.color, view.world.materials?.plaster);
      const timber = material("#79674f", view.world.materials?.wood);
      box(width * 0.8, 2.6, depth * 0.8, 0, 1.3, 0, wall);
      const profile = new THREE.Shape();
      profile.moveTo(-width * 0.46, 0); profile.lineTo(0, 1.4); profile.lineTo(width * 0.46, 0); profile.closePath();
      const roof = new THREE.ExtrudeGeometry(profile, { depth: depth * 0.95, bevelEnabled: false });
      roof.translate(0, 2.6, -depth * 0.475);
      const mesh = new THREE.Mesh(roof, material("#aa8062", view.world.materials?.tiles));
      mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
      box(0.8, 1.9, 0.08, 0, 0.95, depth * 0.41, timber);
      const window = material("#d7e2d8");
      window.emissive.set("#f7c176"); window.emissiveIntensity = 0.12;
      for (const x of [-width * 0.27, width * 0.27]) box(0.65, 0.9, 0.1, x, 1.65, depth * 0.41, window);
    }
    const sign = document.createElement("span"); sign.className = "town-sign place-sign";
    sign.textContent = `${place.name}${place.open ? "" : " · closed"}`;
    view.overlay.append(sign);
    const position = root.position.clone().add(new THREE.Vector3(0, place.anchor ? 1 : 4.3, 0));
    return { root, sign, position, materials, signature: JSON.stringify([place, state.w, state.h]) };
  }
  function update(state) {
    const places = (state.places?.list || []).filter((p) => p.enabled && !p.detached);
    const ids = new Set(places.map((p) => p.id));
    for (const [id, entry] of entries) if (!ids.has(id)) { remove(entry); entries.delete(id); }
    for (const place of places) {
      const old = entries.get(place.id);
      if (old?.signature === JSON.stringify([place, state.w, state.h])) continue;
      if (old) remove(old);
      entries.set(place.id, make(place, state));
    }
  }
  return { update, animate() {
    for (const entry of entries.values()) {
      view.project(entry.position, entry.sign);
      for (const m of entry.materials) if (m.emissive?.getHex()) {
        m.emissiveIntensity = view.world.glow[0]?.emissiveIntensity ?? 0.1;
      }
    }
  }, dispose() { for (const e of entries.values()) remove(e); entries.clear(); group.removeFromParent(); } };
}
