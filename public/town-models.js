import * as THREE from "three";
import { GLTFLoader } from "/vendor/loaders/GLTFLoader.js";
import { clone } from "/vendor/utils/SkeletonUtils.js";

let template;
// Share geometry, but clone skeletons and materials for independent identities.
export function attachAnimatedResident(parent, color) {
  template ??= new GLTFLoader().loadAsync("/assets/natural/robot.glb");
  let mixer, actions, current, model, disposed = false;
  const ready = template.then((gltf) => {
    if (disposed || !parent.parent) return;
    model = clone(gltf.scene);
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = object.receiveShadow = true;
      object.material = [object.material].flat().map((source) => {
        const material = source.clone();
        material.color.lerp(new THREE.Color(color), 0.55);
        return material;
      });
    });
    const bounds = new THREE.Box3().setFromObject(model);
    const height = bounds.max.y - bounds.min.y;
    model.scale.setScalar(2 / height);
    model.position.y = -bounds.min.y * 2 / height;
    for (const child of parent.children) child.visible = false;
    parent.add(model);
    mixer = new THREE.AnimationMixer(model);
    actions = Object.fromEntries(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
  });
  return { ready,
    animate(dt, moving, paused = false) {
      if (!mixer) return;
      const next = moving ? actions.Walking : actions.Idle;
      if (next && current !== next) {
        current?.fadeOut(0.2); next.reset().fadeIn(0.2).play(); current = next;
      }
      if (!paused) mixer.update(Math.max(0, dt));
    },
    dispose() {
      disposed = true; mixer?.stopAllAction();
      if (model) mixer?.uncacheRoot(model);
    },
  };
}
