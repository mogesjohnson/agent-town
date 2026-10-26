import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && /THREE|shader|WebGL/.test(m.text())) errors.push(m.text()); });
try {
  const base = process.env.TOWN_URL || "http://localhost:4317";
  await page.route("**/atmosphere-fixture?*", (r) => r.fulfill({ contentType: "text/html", body:
    '<link rel="stylesheet" href="/style.css"><script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script><div id="fixture" class="town-stage" style="width:100vw;height:90vh"></div>' }));
  await page.goto(`${base}/atmosphere-fixture?style=natural&time=noon`);
  await page.evaluate(async () => {
    const THREE = await import("/vendor/three.module.js");
    const { createTownView } = await import("/town-view.js");
    const { createAtmosphere } = await import("/town-atmosphere.js");
    const { createLighting } = await import("/town-lighting.js");
    const host = document.getElementById("fixture"), view = createTownView(host);
    const lighting = createLighting(view, host), atmosphere = createAtmosphere(view, host);
    const tree = new THREE.Group(); tree.userData.atmosphere = "vegetation"; view.world.root.add(tree);
    window.fixture = { view, atmosphere, lighting, tree, paused: false };
    view.onFrame((now) => { lighting.animate(now, window.fixture.paused); atmosphere.animate(now, window.fixture.paused); });
    await view.world.ready;
  });
  await page.getByLabel("Town weather").selectOption("rain");
  await page.waitForFunction(() => document.getElementById("fixture").dataset.weather === "rain");
  await page.waitForTimeout(1100);
  const stats = () => page.evaluate(() => ({ time: document.getElementById("fixture").dataset.atmosphereTime,
    sway: window.fixture.tree.rotation.z, count: window.fixture.view.scene.getObjectByName("town-atmosphere").children[0].geometry.attributes.position.count }));
  const moving = await stats(); assert.equal(moving.count, 800); assert.notEqual(moving.sway, 0);
  await page.evaluate(() => { window.fixture.paused = true; });
  await page.waitForTimeout(50); const frozen = await stats();
  await page.waitForTimeout(150); assert.deepEqual(await stats(), frozen, "pause freezes weather and wind");
  await page.evaluate(() => { window.fixture.paused = false; });
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.waitForTimeout(80);
  assert.equal((await stats()).sway, 0);
  assert.equal(await page.evaluate(() => window.fixture.view.scene.getObjectByName("town-atmosphere").children.every((o) => !o.visible)), true);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByLabel("Town weather").selectOption("season");
  await page.evaluate(() => dispatchEvent(new CustomEvent("town:season", { detail: { weather: "snow" } })));
  await page.waitForFunction(() => document.getElementById("fixture").dataset.weather === "snow");
  await page.evaluate(() => dispatchEvent(new CustomEvent("town:season", { detail: { weather: "fog" } })));
  await page.waitForFunction(() => window.fixture.view.scene.fog.far === 40);
  await page.evaluate(() => { window.fixture.tree.removeFromParent(); });
  await page.waitForTimeout(1100); assert.equal((await stats()).sway, 0, "removed objects released");
  const shader = await page.evaluate(() => {
    let result;
    window.fixture.view.world.root.traverse((o) => {
      if (o.material?.isMeshPhysicalMaterial) {
        const s = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <normal_fragment_maps>" };
        o.material.onBeforeCompile(s); result = result || (s.fragmentShader.includes("townRippleTime") && !!s.uniforms.townRippleTime);
      }
    });
    return result;
  });
  assert.equal(shader, true, "water shader receives animated ripple uniform");
  const restored = await page.evaluate(() => {
    window.fixture.atmosphere.dispose();
    const range = [window.fixture.view.scene.fog.near, window.fixture.view.scene.fog.far];
    window.fixture.lighting.dispose(); window.fixture.view.dispose(); return range;
  });
  assert.deepEqual(restored, [65, 125]);
  assert.equal(await page.getByLabel("Town weather").count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS: weather, season events, water shader, pause, reduced motion, object lifecycle and disposal");
} finally { await browser.close(); }
