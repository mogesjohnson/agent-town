import * as THREE from "three";
import { OrbitControls } from "/vendor/OrbitControls.js";
import { buildNaturalWorld } from "./town-natural-world.js";

export function createTownView(host) {
  host.dataset.style = "natural";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", "3D agent town; drag to orbit, right-drag to pan, scroll to zoom");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#bfd5ce");
  scene.fog = new THREE.Fog("#bfd5ce", 65, 125);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 220);
  camera.position.set(36, 38, 44);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0, -0.5);
  controls.enableDamping = true;
  controls.minPolarAngle = Math.PI / 6;
  controls.maxPolarAngle = Math.PI / 2.8;
  controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity;
  controls.minDistance = 3; controls.maxDistance = 75;
  controls.screenSpacePanning = false;
  const world = buildNaturalWorld();
  scene.add(world.root);
  if (world.ready) {
    const status = document.createElement("span");
    status.className = "asset-status"; status.setAttribute("role", "status");
    status.textContent = "Loading local scenery…"; host.append(status);
    host.dataset.assets = "loading";
    world.ready.then(() => { host.dataset.assets = "ready"; status.remove(); }).catch(() => {
      host.dataset.assets = "failed";
      status.textContent = "Scenery unavailable. Run npm run build, then refresh the town.";
    });
  }
  const ambient = new THREE.HemisphereLight("#fff0d2", "#667659", 2.3);
  const sun = new THREE.DirectionalLight("#fff0cf", 3);
  sun.position.set(-18, 32, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 30, bottom: -30, near: 1, far: 95 });
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.06;
  scene.add(ambient, sun);
  const overlay = document.createElement("div");
  overlay.className = "town-overlays";
  const signs = world.labels.map(({ text, position }) => {
    const element = document.createElement("span");
    element.className = "town-sign";
    element.textContent = text;
    overlay.append(element);
    return { element, position };
  });
  host.append(canvas, overlay);
  function resize() {
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)), false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  function project(position, element) {
    const p = position.clone().project(camera);
    element.hidden = p.z < -1 || p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1;
    element.style.left = `${(p.x + 1) * host.clientWidth / 2}px`;
    element.style.top = `${(1 - p.y) * host.clientHeight / 2}px`;
  }
  let frame, disposed = false, update = () => {};
  function animate(now) {
    if (disposed) return;
    controls.update();
    const bounded = controls.target.clone().clamp(new THREE.Vector3(-19, 0, -14), new THREE.Vector3(19, 3, 14));
    camera.position.add(bounded.clone().sub(controls.target));
    controls.target.copy(bounded);
    update(now);
    renderer.render(scene, camera);
    for (const sign of signs) project(sign.position, sign.element);
    frame = requestAnimationFrame(animate);
  }
  resize();
  frame = requestAnimationFrame(animate);
  return {
    scene, world, camera, controls, overlay, project, ambient, sun,
    onFrame(fn) { update = fn; },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect(); controls.dispose();
      world.dispose?.();
      const geometries = new Set(), materials = new Set();
      scene.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) for (const m of [o.material].flat()) materials.add(m);
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose(); canvas.remove(); overlay.remove();
    },
  };
}
