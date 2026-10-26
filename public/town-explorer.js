import * as THREE from "three";
import { attachAnimatedResident } from "./town-models.js";

// The visitor is local to this browser; moving it never spends model tokens.
export function createExplorer(view, host) {
  const { camera, controls, scene, world } = view;
  const avatar = new THREE.Group();
  avatar.position.set(0, 0.2, 6);
  const material = new THREE.MeshStandardMaterial({ color: "#cc6944", roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 6, 12), material);
  body.position.y = 0.9; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12),
    new THREE.MeshStandardMaterial({ color: "#c99d7a", roughness: 0.9 }));
  head.position.y = 1.65; head.castShadow = true;
  avatar.add(body, head); scene.add(avatar);
  const animation = attachAnimatedResident(avatar, "#cc6944");
  animation.ready.then(() => { host.dataset.visitorModel = "ready"; }).catch(() => {
    host.dataset.visitorModel = "fallback";
  });
  const bar = document.createElement("div");
  bar.className = "explore-controls";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Camera view");
  for (const [value, text] of [["overview", "Town overview"], ["visitor", "Third person · You"]]) {
    const option = document.createElement("option"); option.value = value; option.textContent = text;
    select.append(option);
  }
  const help = document.createElement("span");
  help.textContent = "WASD / arrows · Shift to run · drag to look · scroll to zoom";
  bar.append(select, help); host.append(bar);
  const position = document.createElement("output");
  position.setAttribute("aria-label", "Visitor position"); bar.append(position);
  const keys = new Set(), ray = new THREE.Raycaster();
  let paused = false, last = 0, active = false;
  const typing = () => /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(document.activeElement?.tagName) ||
    document.activeElement?.isContentEditable;
  function keydown(event) {
    if (!active || typing() || !["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"].includes(event.code)) return;
    event.preventDefault(); keys.add(event.code);
  }
  const keyup = (event) => keys.delete(event.code);
  const clear = () => keys.clear();
  addEventListener("keydown", keydown); addEventListener("keyup", keyup); addEventListener("blur", clear);
  function mode() {
    active = select.value === "visitor"; clear(); avatar.visible = active;
    controls.enablePan = !active;
    controls.minDistance = active ? 2.5 : 8;
    controls.maxDistance = active ? 12 : 75;
    controls.minPolarAngle = 0.15; controls.maxPolarAngle = Math.PI * 0.48;
    const target = active ? avatar.position.clone().add(new THREE.Vector3(0, 1.25, 0)) : new THREE.Vector3();
    controls.target.copy(target);
    camera.position.copy(target).add(new THREE.Vector3(active ? 0 : 32, active ? 3 : 30, active ? 6 : 38));
    controls.update();
    host.dataset.camera = select.value;
  }
  select.addEventListener("change", mode);
  select.value = new URLSearchParams(location.search).get("camera") === "overview" ? "overview" : "visitor";
  mode();
  function animate(now) {
    const dt = Math.max(0, Math.min((now - (last || now)) / 1000, 0.05)); last = now;
    if (!active) return;
    if (typing()) clear();
    const forward = camera.getWorldDirection(new THREE.Vector3()); forward.y = 0; forward.normalize();
    const right = forward.clone().cross(camera.up);
    const movement = new THREE.Vector3();
    if (keys.has("KeyW") || keys.has("ArrowUp")) movement.add(forward);
    if (keys.has("KeyS") || keys.has("ArrowDown")) movement.sub(forward);
    if (keys.has("KeyD") || keys.has("ArrowRight")) movement.add(right);
    if (keys.has("KeyA") || keys.has("ArrowLeft")) movement.sub(right);
    if (!paused && movement.lengthSq()) {
      movement.normalize();
      const distance = dt * (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 6 : 3);
      ray.set(avatar.position.clone().add(new THREE.Vector3(0, 0.8, 0)), movement);
      ray.far = distance + 0.4;
      if (!ray.intersectObject(world.root, true).length) {
        avatar.position.addScaledVector(movement, distance);
        avatar.position.x = THREE.MathUtils.clamp(avatar.position.x, -19, 19);
        avatar.position.z = THREE.MathUtils.clamp(avatar.position.z, -14, 14);
        avatar.rotation.y = Math.atan2(movement.x, movement.z);
      }
      body.position.y = 0.9 + Math.sin(now * 0.013) * 0.04;
    }
    animation.animate(dt, movement.lengthSq() > 0 && !paused, paused);
    const target = avatar.position.clone().add(new THREE.Vector3(0, 1.25, 0));
    camera.position.add(target.clone().sub(controls.target)); controls.target.copy(target);
    position.textContent = `${avatar.position.x.toFixed(2)}, ${avatar.position.z.toFixed(2)}`;
  }
  return { animate, setPaused(value) { paused = value; }, dispose() {
    removeEventListener("keydown", keydown); removeEventListener("keyup", keyup); removeEventListener("blur", clear);
    animation.dispose(); bar.remove();
    // Leave the avatar attached for the view's shared geometry/material cleanup.
    for (const mesh of [body, head]) { mesh.geometry.dispose(); mesh.material.dispose(); }
  } };
}
