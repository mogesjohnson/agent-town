import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && /THREE|shader|WebGL/.test(m.text())) errors.push(m.text()); });
try {
  await page.addInitScript(() => {
    const streams = [];
    window.emitPause = (paused) => streams.forEach((s) => s.dispatchEvent(new MessageEvent("state", {
      data: JSON.stringify({ w: 40, h: 25, paused, agents: [], landmarks: [], usage: {} }),
    })));
    window.EventSource = class extends EventTarget {
      constructor() { super(); streams.push(this); setTimeout(() => window.emitPause(false), 100); }
      close() {}
    };
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(...args) { super(...args); window.soundContext = this; }
      createGain() { const gain = super.createGain(); window.masterSound ??= gain; return gain; }
    };
  });
  await page.goto(`${process.env.TOWN_URL || "http://localhost:4317"}/?style=natural&weather=rain&time=dusk`);
  await page.locator('.town-stage[data-assets="ready"][data-weather="rain"]').waitFor();
  assert.equal(await page.evaluate(() => !!window.soundContext), false, "no autoplay context");
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  await page.waitForFunction(() => window.soundContext?.state === "running" && window.masterSound.gain.value > 0);
  assert.ok(await page.evaluate(() => window.masterSound.gain.value > 0));
  if (process.env.ATMOSPHERE_SCREENSHOT) await page.screenshot({ path: process.env.ATMOSPHERE_SCREENSHOT });
  await page.evaluate(() => window.emitPause(true));
  await page.waitForFunction(() => window.masterSound.gain.value === 0);
  await page.evaluate(() => window.emitPause(false));
  await page.waitForFunction(() => window.masterSound.gain.value > 0);
  await page.getByLabel("Town sound volume").fill("0");
  await page.waitForFunction(() => window.masterSound.gain.value === 0);
  await page.locator(".town-stage canvas").dispatchEvent("webglcontextlost", { cancelable: true });
  await page.waitForFunction(() => window.soundContext.state === "closed");
  assert.equal(await page.locator("#town").isVisible(), true);
  assert.equal(await page.getByLabel("Town weather").count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS: live weather and opt-in sound, pause/resume, volume mute and fallback audio cleanup");
} finally { await browser.close(); }
