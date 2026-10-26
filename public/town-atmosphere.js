import * as THREE from "three";

export function createAtmosphere(view, host) {
  const group = new THREE.Group(); group.name = "town-atmosphere"; view.scene.add(group);
  const count = 400, rain = new Float32Array(count * 6), snow = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry(), snowGeometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(rain, 3));
  snowGeometry.setAttribute("position", new THREE.BufferAttribute(snow, 3));
  const drops = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: "#adcbdc", transparent: true, opacity: 0.5 }));
  const flakes = new THREE.Points(snowGeometry, new THREE.PointsMaterial({ color: "#f2f6ff", size: 0.12, transparent: true, opacity: 0.85 }));
  drops.frustumCulled = flakes.frustumCulled = false; group.add(drops, flakes);
  for (let i = 0; i < count; i++) {
    const x = (i * 17.31 % 48) - 24, y = i * 1.73 % 18, z = (i * 13.97 % 38) - 19;
    snow.set([x, y, z], i * 3); rain.set([x, y, z, x, y + 0.55, z], i * 6);
  }
  const panel = document.createElement("label"), select = document.createElement("select");
  panel.className = "atmosphere-controls"; panel.textContent = "Weather ";
  select.setAttribute("aria-label", "Town weather");
  const weatherTypes = ["clear", "rain", "snow", "fog", "wind", "storm"];
  for (const kind of ["season", ...weatherTypes]) select.append(new Option(kind === "season" ? "Follow season" : kind, kind));
  const requested = new URLSearchParams(location.search).get("weather");
  select.value = weatherTypes.includes(requested) ? requested : "season";
  panel.append(select); host.append(panel);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const trees = new Map(), water = new Map(), time = { value: 0 };
  const weatherTint = new THREE.Color("#7d909c");
  const fogRange = [view.scene.fog?.near ?? 65, view.scene.fog?.far ?? 125];
  let season = globalThis.townSeason || {}, previous = 0, elapsed = 0, scanAt = -1;
  let weather = "clear";
  const onSeason = (event) => { season = event.detail || {}; };
  addEventListener("town:season", onSeason);
  function scan() {
    const present = new Set();
    view.world.root.traverse((object) => {
      present.add(object);
      const tag = object.userData.atmosphere;
      if (tag === "vegetation" || (object.parent === view.world.root && /pine|sapling/i.test(object.name))) {
        if (!trees.has(object)) trees.set(object, object.rotation.z);
      }
      for (const material of [object.material].flat().filter(Boolean)) {
        const legacyWater = material.isMeshPhysicalMaterial && material.roughness === 0.16 && material.metalness === 0.3;
        if (!(tag === "water" || legacyWater) || water.has(material)) continue;
        const original = material.onBeforeCompile;
        water.set(material, { original, object });
        material.onBeforeCompile = function(shader, renderer) {
          original.call(this, shader, renderer);
          shader.uniforms.townRippleTime = time;
          shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 townWaterUV;")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\ntownWaterUV = position.xz;");
          shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float townRippleTime; varying vec2 townWaterUV;")
            .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = normalize(normal + vec3(sin(townWaterUV.x * 8.0 + townRippleTime * 1.4) * 0.08, cos(townWaterUV.y * 7.0 + townRippleTime) * 0.08, 0.0));");
        };
        material.needsUpdate = true;
      }
    });
    for (const [tree, rotation] of trees) if (!present.has(tree)) { tree.rotation.z = rotation; trees.delete(tree); }
    for (const [material, entry] of water) if (!present.has(entry.object)) {
      material.onBeforeCompile = entry.original; material.needsUpdate = true; water.delete(material);
    }
  }
  function animate(now, paused) {
    const dt = Math.max(0, Math.min((now - (previous || now)) / 1000, 0.1)); previous = now;
    const moving = !paused && !document.hidden && !reduced.matches;
    if (moving) elapsed += dt;
    if (now > scanAt) { scan(); scanAt = now + 1000; }
    weather = select.value === "season" ? season.weather : select.value;
    if (!weatherTypes.includes(weather)) weather = "clear";
    host.dataset.weather = weather; host.dataset.motion = reduced.matches ? "reduced" : paused ? "paused" : "active";
    host.dataset.atmosphereTime = elapsed.toFixed(3);
    const wet = weather === "rain" || weather === "storm";
    drops.visible = wet && !reduced.matches; flakes.visible = weather === "snow" && !reduced.matches;
    time.value = elapsed;
    const wind = weather === "wind" || weather === "storm" ? 1 : 0.25;
    let index = 0;
    for (const [tree, base] of trees) tree.rotation.z = base + (reduced.matches ? 0 : Math.sin(elapsed * 1.1 + index++) * 0.018 * wind);
    if (moving) for (let i = 0; i < count; i++) {
      const at = i * 3, speed = wet ? 13 : 1.1;
      snow[at + 1] = (snow[at + 1] - dt * speed + 18) % 18;
      const x = snow[at] + Math.sin(elapsed + i) * wind * 0.3;
      rain.set([x, snow[at + 1], snow[at + 2], x - 0.06 * wind, snow[at + 1] + 0.55, snow[at + 2]], i * 6);
    }
    geometry.attributes.position.needsUpdate = snowGeometry.attributes.position.needsUpdate = true;
    if (view.scene.fog) {
      view.scene.fog.near = weather === "fog" ? 6 : wet ? 24 : fogRange[0];
      view.scene.fog.far = weather === "fog" ? 40 : wet ? 85 : fogRange[1];
    }
    if (wet || weather === "fog") {
      view.scene.background.lerp(weatherTint, weather === "storm" ? 0.45 : 0.2);
      view.scene.fog?.color.copy(view.scene.background);
      view.sun.intensity *= weather === "storm" ? 0.45 : 0.7;
    }
  }
  return { animate, get weather() { return weather; }, dispose() {
    removeEventListener("town:season", onSeason); panel.remove();
    if (view.scene.fog) [view.scene.fog.near, view.scene.fog.far] = fogRange;
    for (const [tree, base] of trees) tree.rotation.z = base;
    for (const [material, entry] of water) { material.onBeforeCompile = entry.original; material.needsUpdate = true; }
    group.removeFromParent(); geometry.dispose(); snowGeometry.dispose(); drops.material.dispose(); flakes.material.dispose();
  } };
}
