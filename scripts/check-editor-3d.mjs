import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const errors = [], edits = [];
const map = { width: 40, height: 25, version: 1,
  tiles: Array.from({ length: 25 }, () => Array(40).fill("grass")), buildings: [] };
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.route("**/api/map", (r) => r.fulfill({ json: map }));
  await page.route("**/api/map/history?*", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/map/tiles", async (r) => {
    const body = r.request().postDataJSON(); edits.push(body);
    for (const cell of body.tiles) map.tiles[cell.y][cell.x] = cell.type;
    map.version++;
    await r.fulfill({ json: { ok: true, skipped: [] } });
  });
  await page.goto(`${process.env.TOWN_URL || "http://localhost:4317"}/?style=natural&camera=overview`);
  await page.locator('.town-stage[data-map="ready"]').waitFor();
  await page.locator(".me-onmap").check();
  await page.locator(".town-stage").scrollIntoViewIfNeeded();
  const stage = await page.locator(".town-stage").boundingBox();
  const point = { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 };
  const expected = await page.evaluate(({ x, y }) => window.agentTown.pickCell(x, y), point);
  assert.ok(expected, "perspective pointer resolves to a grid cell");
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => document.querySelector(".me-history") !== null);
  await page.waitForTimeout(200);
  assert.equal(edits.length, 1);
  assert.deepEqual(edits[0].tiles[0], { ...expected, type: "road" });
  assert.equal(edits[0].actor, "ui");
  const alpha = await page.locator('#ext-overlay [data-ext="mapeditor"] canvas').evaluate((c) =>
    c.getContext("2d").getImageData(0, 0, c.width, c.height).data.filter((_, i) => i % 4 === 3).some((a) => a));
  assert.equal(alpha, false, "3D edit target stays transparent");
  map.buildings = [{ id: "fixture-house", type: "house", name: "Fixture house", x: 8, y: 8, w: 3, h: 3 }];
  map.version++;
  await page.evaluate((map) => dispatchEvent(new CustomEvent("agenttown:map", { detail: { map } })), map);
  assert.equal(await page.locator('[data-map-building="fixture-house"]').textContent(), "Fixture house");
  assert.deepEqual(errors, []);
  console.log("PASS: perspective editor paint, transparent target and live building updates");
} finally { await browser.close(); }
