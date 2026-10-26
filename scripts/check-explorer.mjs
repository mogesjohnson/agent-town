import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.addInitScript(() => {
    window.EventSource = class extends EventTarget {
      constructor() {
        super();
        setTimeout(() => this.dispatchEvent(new MessageEvent("state", { data: JSON.stringify({
          w: 40, h: 25, agents: [], landmarks: [], paused: false,
          usage: { calls: 0, errors: 0, conversations: 0, chars: 0 },
        }) })), 80);
      }
      close() {}
    };
  });
  await page.goto(`${process.env.TOWN_URL || "http://localhost:4317"}/?style=natural&time=noon`);
  const stage = page.locator('.town-stage[data-camera="visitor"]');
  await stage.waitFor();
  const position = page.getByRole("status", { name: "Visitor position" });
  await page.waitForTimeout(200);
  const before = await position.textContent();
  await page.keyboard.down("d"); await page.waitForTimeout(300); await page.keyboard.up("d");
  assert.notEqual(await position.textContent(), before, "WASD moves the visitor");
  await page.locator("#input").focus();
  const typed = await position.textContent();
  await page.keyboard.type("wwww"); await page.waitForTimeout(150);
  assert.equal(await position.textContent(), typed, "typing cannot move visitor");
  await page.getByLabel("Camera view").selectOption("overview");
  assert.equal(await stage.count(), 0, "overview changes camera mode");
  assert.equal(await page.locator(".style-panel").count(), 0, "retired Styles selector is absent");
  await page.goto(`${process.env.TOWN_URL || "http://localhost:4317"}/?style=voxel&renderer=2d`);
  await page.locator('.town-stage[data-style="natural"][data-camera="visitor"]').waitFor();
  assert.equal(await page.getByLabel("Camera view").count(), 1, "retired flags retain perspective visitor controls");
  assert.deepEqual(errors, []);
  console.log("PASS: third-person movement, input focus, overview, retired flags ignored and no Styles selector");
} finally { await browser.close(); }
