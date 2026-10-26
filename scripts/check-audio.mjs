import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const source = await readFile(new URL("../public/town-audio.js", import.meta.url), "utf8");
const server = createServer((req, res) => {
  if (req.url === "/audio.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(source); return; }
  res.writeHead(200, { "content-type": "text/html" });
  res.end('<div id="host"><div class="town-toolbar"></div></div><script type="module">import {createTownAudio} from "/audio.js"; window.audio=createTownAudio(document.querySelector("#host")); window.ready=true;</script>');
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
try {
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.contexts = []; window.gains = []; window.oscillators = []; window.pulses = []; window.nodeCount = 0;
    const NativeAudio = window.AudioContext;
    window.AudioContext = class extends NativeAudio {
      constructor() { super(); window.contexts.push(this); }
      createGain() {
        const n = super.createGain(), ramp = n.gain.linearRampToValueAtTime.bind(n.gain);
        n.gain.linearRampToValueAtTime = (value, time) => { window.pulses.push(value); return ramp(value, time); };
        window.gains.push(n); window.nodeCount++; return n;
      }
      createOscillator() { const n = super.createOscillator(); window.oscillators.push(n); window.nodeCount++; return n; }
      createBufferSource() { window.nodeCount++; return super.createBufferSource(); }
      createBiquadFilter() { window.nodeCount++; return super.createBiquadFilter(); }
    };
    window.hiddenFixture = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => window.hiddenFixture });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.ready);
  await page.evaluate(() => audio.animate(1000, { weather: "rain", walking: true }));
  assert.equal(await page.evaluate(() => contexts.length), 0, "no autoplay context");
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  await page.waitForFunction(() => contexts[0]?.state === "running");
  const graphSize = await page.evaluate(() => nodeCount);
  assert.equal(graphSize, 13, "fixed reusable audio graph");
  await page.waitForTimeout(100);
  assert.ok(await page.evaluate(() => gains[2].gain.value > 0.03), "rain gain follows weather");
  await page.evaluate(() => { audio.animate(5000, { weather: "clear", night: false, walking: true }); });
  assert.deepEqual(await page.evaluate(() => pulses), [0.13, 0.18], "day bird and footstep envelopes");
  await page.evaluate(() => { audio.animate(6000, { night: true, walking: false }); });
  assert.equal(await page.evaluate(() => pulses.at(-1)), 0.035, "night cricket envelope");
  await page.evaluate(() => { window.pulses = []; audio.animate(7000, { weather: "storm", night: false }); });
  assert.deepEqual(await page.evaluate(() => pulses), [], "storm suppresses wildlife chirps");
  await page.evaluate(() => audio.animate(8000, { paused: true }));
  assert.equal(await page.evaluate(() => gains[0].gain.value), 0, "pause immediately silences master");
  await page.evaluate(() => { audio.animate(9000, { paused: false }); hiddenFixture = true; document.dispatchEvent(new Event("visibilitychange")); });
  assert.equal(await page.evaluate(() => gains[0].gain.value), 0, "hidden page is silent");
  await page.evaluate(() => { hiddenFixture = false; document.dispatchEvent(new Event("visibilitychange")); });
  await page.getByRole("slider", { name: "Town sound volume" }).fill("0");
  assert.equal(await page.evaluate(() => gains[0].gain.value), 0, "zero volume is silent");
  await page.getByRole("slider", { name: "Town sound volume" }).fill("0.18");
  await page.evaluate(() => { for (let i = 0; i < 1000; i++) audio.animate(10_000 + i * 500, { walking: true, weather: "clear" }); });
  assert.equal(await page.evaluate(() => nodeCount), graphSize, "frames allocate no new audio nodes");
  await page.getByRole("button", { name: "Mute sound", exact: true }).click();
  await page.evaluate(() => { audio.dispose(); audio.dispose(); audio.animate(1_000_000, { walking: true }); });
  await page.waitForFunction(() => contexts[0].state === "closed");
  assert.equal(await page.locator(".town-audio").count(), 0);
  const unsupported = await browser.newPage();
  await unsupported.addInitScript(() => { window.AudioContext = undefined; window.webkitAudioContext = undefined; });
  await unsupported.goto(`http://127.0.0.1:${server.address().port}/`);
  await unsupported.getByRole("button", { name: "Enable sound", exact: true }).click();
  assert.equal(await unsupported.getByRole("button", { name: "Sound unavailable", exact: true }).isDisabled(), true);
  await unsupported.close();
  assert.deepEqual(errors, []);
  console.log("pass: explicit opt-in, real Web Audio graph, bird/cricket/footstep routing, pause/visibility/zero volume, bounded nodes, idempotent disposal");
} finally {
  await browser.close(); await new Promise((resolve) => server.close(resolve));
}
