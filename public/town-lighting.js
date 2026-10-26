import * as THREE from "three";

const STOPS = [
  { t: 0, sky: "#bfd5ce", sun: "#fff0cf", sunPower: 3, ambient: 2.3, glow: 0 },
  { t: 0.32, sky: "#bfd5ce", sun: "#fff0cf", sunPower: 3, ambient: 2.3, glow: 0 },
  { t: 0.47, sky: "#b9989f", sun: "#ffb779", sunPower: 1.7, ambient: 1.4, glow: 0.45 },
  { t: 0.62, sky: "#263c56", sun: "#a9c7ef", sunPower: 0.65, ambient: 0.85, glow: 1 },
  { t: 0.82, sky: "#263c56", sun: "#a9c7ef", sunPower: 0.65, ambient: 0.85, glow: 1 },
  { t: 1, sky: "#bfd5ce", sun: "#fff0cf", sunPower: 3, ambient: 2.3, glow: 0 },
].map((s) => ({ ...s, sky: new THREE.Color(s.sky), sun: new THREE.Color(s.sun) }));

export function createLighting(view, host) {
  const toolbar = document.createElement("div");
  toolbar.className = "town-toolbar";
  const label = document.createElement("label"), select = document.createElement("select");
  label.textContent = "Light ";
  select.setAttribute("aria-label", "Town lighting");
  for (const [value, text] of [["cycle", "Day cycle"], ["noon", "Noon"], ["dusk", "Dusk"], ["night", "Night"]]) {
    const option = document.createElement("option");
    option.value = value; option.textContent = text; select.append(option);
  }
  const requested = new URLSearchParams(location.search).get("time");
  select.value = ["noon", "dusk", "night"].includes(requested) ? requested : "cycle";
  const help = document.createElement("span");
  help.textContent = "Drag: orbit · right-drag: pan · scroll: zoom";
  label.append(select); toolbar.append(label, help); host.append(toolbar);
  const fireflies = new THREE.Group();
  const geometry = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  const material = new THREE.MeshBasicMaterial({ color: "#ffe5a4", transparent: true });
  for (let i = 0; i < 18; i++) {
    const fly = new THREE.Mesh(geometry, material);
    fly.position.set(7 + (i * 7 % 10), 0.8 + i % 3, 4 + (i * 3 % 6));
    fireflies.add(fly);
  }
  view.scene.add(fireflies);
  let elapsed = 0, previous = performance.now();
  function animate(now, paused) {
    if (!paused) elapsed += Math.max(0, Math.min((now - previous) / 1000, 0.1));
    previous = now;
    const phase = { noon: 0.15, dusk: 0.47, night: 0.72 }[select.value] ?? (elapsed / 240) % 1;
    const index = STOPS.findIndex((s) => s.t > phase);
    const a = STOPS[index - 1], b = STOPS[index];
    const fraction = (phase - a.t) / (b.t - a.t);
    const t = fraction * fraction * (3 - 2 * fraction);
    const blend = (key) => THREE.MathUtils.lerp(a[key], b[key], t);
    view.scene.background.copy(a.sky).lerp(b.sky, t);
    view.scene.fog.color.copy(view.scene.background);
    view.sun.color.copy(a.sun).lerp(b.sun, t);
    view.sun.intensity = blend("sunPower");
    view.ambient.intensity = blend("ambient");
    view.ambient.color.copy(a.sun).lerp(b.sun, t);
    const glow = blend("glow");
    for (const m of view.world.glow) m.emissiveIntensity = 0.08 + glow * 1.5;
    for (const light of view.world.lamps) light.intensity = glow * 18;
    fireflies.visible = glow > 0.65;
    material.opacity = glow * 0.85;
    fireflies.children.forEach((fly, i) => {
      fly.position.y = 1.2 + Math.sin(elapsed * 0.7 + i) * 0.7;
      fly.position.x = 7 + (i * 7 % 10) + Math.sin(elapsed * 0.3 + i) * 0.5;
    });
    host.dataset.time = select.value === "cycle" ? (glow > 0.8 ? "night" : glow > 0.1 ? "dusk" : "noon") : select.value;
  }
  animate(previous, false);
  return { animate, dispose() { toolbar.remove(); } };
}
