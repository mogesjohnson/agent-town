import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
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
  await page.locator(".style-panel summary").click();
  await page.getByRole("button", { name: /Cozy voxel/ }).click();
  await page.locator('.town-stage[data-style="voxel"]').waitFor();
  assert.equal(await page.getByLabel("Camera view").count(), 0, "original voxel camera preserved");
  assert.deepEqual(errors, []);
  console.log("PASS: third-person movement, input focus, overview and preserved voxel style");
} finally { await browser.close(); }
