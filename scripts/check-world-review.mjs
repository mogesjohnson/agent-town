import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.WORLD_REVIEW_URL;
if (!base) throw Error("WORLD_REVIEW_URL must point to a disposable mock town");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let edit;
const post = async (path, data) => {
  const r = await page.request.post(`${base}${path}`, { data });
  const body = await r.json(); assert.equal(r.ok(), true, JSON.stringify(body)); return body;
};
try {
  await post("/api/pause", { paused: true });
  await page.route("**/town-view.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace("scene, world, camera, controls,", "debug: (window.reviewWorld = {scene, world}), scene, world, camera, controls,") });
  });
  await page.goto(`${base}/?style=natural&camera=overview&time=night&weather=rain`);
  await page.locator('[data-assets="ready"][data-map="ready"]').waitFor();
  const inspect = () => page.evaluate(() => {
    const ids = [];
    window.reviewWorld.world.root.traverse((o) => { if (o.userData.worldId) ids.push(o.userData.worldId); });
    return { cottages: ids.filter((id) => id.startsWith("building:cottage")),
      ponds: ids.filter((id) => id.startsWith("pond-")), trees: ids.filter((id) => id.startsWith("tree-")),
      glow: window.reviewWorld.world.glow.length };
  });
  const first = await inspect();
  assert.equal(first.cottages.length, 4); assert.equal(new Set(first.cottages).size, 4);
  assert.equal(first.ponds.length, 9); assert.equal(first.trees.length, 10); assert.equal(first.glow, 10);
  const label = page.locator('[data-map-building="cottage-claude"]');
  const before = await label.evaluate((e) => e.style.left);
  edit = await post("/api/map/buildings", { op: "move", id: "cottage-claude", x: 0, y: 0, actor: "codex-review" });
  await page.waitForFunction((left) => document.querySelector('[data-map-building="cottage-claude"]').style.left !== left, before);
  assert.equal((await inspect()).cottages.length, 4);
  await post("/api/map/undo", { editId: edit.editId, actor: "codex-review" }); edit = null;
  await page.waitForFunction((left) => document.querySelector('[data-map-building="cottage-claude"]').style.left === left, before);
  for (const style of ["voxel", "2d"]) {
    await page.goto(`${base}/?style=${style}${style === "2d" ? "&renderer=2d" : ""}`);
    if (style === "voxel") {
      await page.locator('[data-map="ready"]').waitFor();
      assert.equal((await inspect()).cottages.length, 4);
    } else assert.equal(await page.locator("#town").isVisible(), true);
  }
  assert.deepEqual(errors, []);
  console.log("PASS: authoritative scenery, one cottage per id, night glow, live move/undo, voxel and 2D");
} finally {
  if (edit) await post("/api/map/undo", { editId: edit.editId, actor: "codex-review" });
  await browser.close();
}
