import { createTownView } from "./town-view.js";
import { createCrowd } from "./town-characters.js";
import { createOverlays } from "./town-overlays.js";
import { createLighting } from "./town-lighting.js";
import { createExplorer } from "./town-explorer.js";
import { createPlaceView } from "./town-place-view.js";
import { createMapView } from "./town-map-view.js";
import { createAtmosphere } from "./town-atmosphere.js";

export function mountTown(canvas, fallback) {
  const host = document.createElement("div");
  host.className = "town-stage";
  canvas.before(host);
  let view;
  try { view = createTownView(host); }
  catch (error) { host.remove(); throw error; }
  const crowd = createCrowd(view.scene, view.camera.isPerspectiveCamera), overlays = createOverlays(view, crowd);
  const lighting = createLighting(view, host);
  const atmosphere = createAtmosphere(view, host);
  const explorer = view.camera.isPerspectiveCamera ? createExplorer(view, host) : null;
  const places = createPlaceView(view);
  const map = createMapView(view);
  map.ready.then(() => { host.dataset.map = "ready"; }).catch((error) => {
    host.dataset.map = "failed"; console.warn("Editable map unavailable", error);
  });
  let paused = false, disposed = false;
  canvas.hidden = true;
  view.onFrame((now) => {
    lighting.animate(now, paused); crowd.animate(now); explorer?.animate(now); places.animate(); map.animate(); overlays.animate(now, paused);
    atmosphere.animate(now, paused);
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true; atmosphere.dispose(); map.dispose(); places.dispose(); explorer?.dispose(); crowd.dispose(); lighting.dispose(); view.dispose(); host.remove(); canvas.hidden = false;
  };
  host.querySelector("canvas").addEventListener("webglcontextlost", (event) => {
    event.preventDefault(); dispose(); fallback();
  }, { once: true });
  addEventListener("pagehide", (event) => { if (!event.persisted) dispose(); });
  return {
    update(state) { paused = state.paused; explorer?.setPaused(paused); crowd.update(state); places.update(state); },
    dispose,
  };
}
