import { createTownView } from "./town-view.js";
import { createCrowd } from "./town-characters.js";
import { createOverlays } from "./town-overlays.js";
import { createLighting } from "./town-lighting.js";

export function mountTown(canvas, fallback) {
  const host = document.createElement("div");
  host.className = "town-stage";
  canvas.before(host);
  let view;
  try { view = createTownView(host); }
  catch (error) { host.remove(); throw error; }
  const crowd = createCrowd(view.scene), overlays = createOverlays(view, crowd);
  const lighting = createLighting(view, host);
  let paused = false, disposed = false;
  canvas.hidden = true;
  view.onFrame((now) => {
    lighting.animate(now, paused); crowd.animate(now); overlays.animate(now, paused);
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true; lighting.dispose(); view.dispose(); host.remove(); canvas.hidden = false;
  };
  host.querySelector("canvas").addEventListener("webglcontextlost", (event) => {
    event.preventDefault(); dispose(); fallback();
  }, { once: true });
  addEventListener("pagehide", dispose, { once: true });
  return {
    update(state) { paused = state.paused; crowd.update(state); },
    dispose,
  };
}
