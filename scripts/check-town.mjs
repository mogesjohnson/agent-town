import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Supply an existing Playwright install; no test dependency is added to the app.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TOWN_URL || "http://127.0.0.1:4317";
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const state = {
  w: 40, h: 25, paused: false, usage: { calls: 0, errors: 0, conversations: 0, chars: 0 },
  maxTurnsPerAgent: 20, turnsPerMinute: 30, landmarks: [],
  agents: ["Claude", "Codex", "Grok", "Gemini", "Ollama"].map((name, i) => ({
    name, x: 9 + i * 5, y: 13 + i % 2 * 3, status: "idle", turns: 0,
    provider: "mock", model: "canned", account: "built-in", color: "#89ac81",
  })),
};
try {
  // Deterministic SSE fixture; no model invocation or production debug hooks.
  await page.addInitScript((initial) => {
    const streams = [];
    window.emitTown = (type, data) => streams.forEach((s) =>
      s.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) })));
    window.EventSource = class extends EventTarget {
      constructor() {
        super(); streams.push(this);
        setTimeout(() => window.emitTown("state", initial), 80);
      }
      close() {}
    };
  }, state);
  const requests = [];
  await page.route("**/api/chat", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ contentType: "application/json", body: '{"ok":true}' });
  });
  await page.route("**/api/pause", async (route) => {
    state.paused = !state.paused;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ paused: state.paused }) });
    await page.evaluate((s) => window.emitTown("state", s), state);
  });
  await page.goto(`${base}/?time=noon`);
  await page.locator('.town-stage[data-time="noon"]').waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".agent-name").length === 5);
  assert.equal(await page.locator("#town").isVisible(), false);
  assert.equal(await page.locator("#lobby li").count(), 5);
  const canvasSize = await page.locator(".town-stage canvas").evaluate((c) => [c.width, c.clientWidth]);
  assert.ok(canvasSize[0] < canvasSize[1], "render below CSS resolution");
  await page.locator('#lobby li[data-name="Codex"]').click();
  await page.locator("#input").fill("Hello neighbor!");
  await page.locator("#form button").click();
  await page.waitForTimeout(100);
  assert.deepEqual(requests[0], { to: "Codex", text: "Hello neighbor!" });
  await page.locator('[data-tab="All"]').click();
  await page.locator("#input").fill("Hello all!");
  await page.locator("#form button").click();
  await page.waitForTimeout(100);
  assert.equal(requests[1].to, "*");
  state.agents.forEach((a) => { a.bubble = '<img src=x onerror="alert(1)"> Welcome, neighbor!'; });
  state.agents[0].status = "thinking";
  await page.evaluate((s) => window.emitTown("state", s), state);
  await page.waitForTimeout(180);
  const startText = await page.locator(".agent-bubble:not([hidden]):not(.thinking)").first().textContent();
  await page.waitForTimeout(550);
  const visible = await page.locator(".agent-bubble:not([hidden])").count();
  assert.ok(visible > 0 && visible <= 2, "bounded visible bubbles");
  assert.equal(await page.locator(".thinking:not([hidden])").textContent(), "...");
  const laterText = await page.locator(".agent-bubble:not([hidden]):not(.thinking)").first().textContent();
  assert.ok(laterText.length > startText.length, "typewriter advances");
  assert.equal(await page.locator(".town-overlays img").count(), 0, "speech is plain text");
  await page.locator("#pause").click();
  await page.waitForFunction(() => document.querySelector("#pause").textContent === "Resume");
  const frozen = await page.locator(".agent-bubble:not([hidden]):not(.thinking)").first().textContent();
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".agent-bubble:not([hidden]):not(.thinking)").first().textContent(), frozen);
  await page.locator('[aria-label="Town lighting"]').selectOption("night");
  await page.locator('.town-stage[data-time="night"]').waitFor();
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  assert.equal(await page.locator(".town-stage").count(), 1, "cached page retains view");
  await page.setViewportSize({ width: 720, height: 900 });
  await page.waitForTimeout(100);
  assert.ok(await page.locator(".town-stage canvas").evaluate((c) => c.width > 0 && c.width < 720));
  await page.locator(".town-stage canvas").evaluate((c) =>
    c.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
  assert.equal(await page.locator("#town").isVisible(), true, "context loss falls back");
  assert.equal(await page.locator(".town-stage").count(), 0);
  await page.goto(`${base}/?renderer=2d`);
  await page.waitForTimeout(200);
  assert.equal(await page.locator("#town").isVisible(), true);
  assert.equal(await page.locator(".town-stage").count(), 0);
  await page.route("**/vendor/three.module.js", (route) => route.abort());
  await page.goto(base);
  await page.waitForTimeout(500);
  assert.equal(await page.locator("#town").isVisible(), true, "missing module falls back");
  assert.equal(await page.locator(".town-stage").count(), 0);
  assert.deepEqual(errors, []);
  console.log("pass: 3D/SSE, tabs, chat, typewriter, thinking, bubble cap, text safety, pause, lighting, cached page, resize, 2D/context/module fallback");
} finally {
  await browser.close();
}
