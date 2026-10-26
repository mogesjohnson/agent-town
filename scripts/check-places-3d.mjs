import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.addInitScript(() => {
    const streams = [];
    window.placeState = { w: 40, h: 25, agents: [], landmarks: [], usage: {}, paused: false,
      places: { list: [{ id: "test-bakery", name: "Test bakery <plain>", color: "#bd9e7c",
        x: 8, y: 12, w: 3, h: 3, enabled: true, open: true, detached: false, workers: [], hours: { open: 0, close: 24 } }] } };
    window.sendPlaces = () => streams.forEach((s) => s.dispatchEvent(new MessageEvent("state", { data: JSON.stringify(window.placeState) })));
    window.EventSource = class extends EventTarget {
      constructor() { super(); streams.push(this); setTimeout(window.sendPlaces, 100); }
      close() {}
    };
  });
  await page.goto(`${process.env.TOWN_URL || "http://localhost:4317"}/?style=natural&camera=overview`);
  const sign = page.locator(".place-sign");
  await sign.waitFor();
  assert.equal(await sign.textContent(), "Test bakery <plain>");
  const before = await sign.evaluate((e) => e.style.left);
  await page.evaluate(() => { window.placeState.places.list[0].x += 5; window.sendPlaces(); });
  await page.waitForFunction((left) => document.querySelector(".place-sign")?.style.left !== left, before);
  await page.evaluate(() => { window.placeState.places.list = []; window.sendPlaces(); });
  assert.equal(await sign.count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS: custom places project, move, remove and render names as plain text");
} finally { await browser.close(); }
