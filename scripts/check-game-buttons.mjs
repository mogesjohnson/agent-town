import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  const base = process.env.TOWN_URL || "http://localhost:4317";
  await page.route("**/games-fixture", (r) => r.fulfill({ contentType: "text/html", body: '<div id="games"></div>' }));
  await page.goto(`${base}/games-fixture`);
  await page.evaluate(async () => {
    const { mount } = await import("/extensions/minigames.js");
    window.fixture = { snap: { current: null, scoreboard: [] }, calls: [], events: {} };
    const f = window.fixture;
    mount({ slot: { panel: document.getElementById("games") }, api: {
      get: async () => f.snap,
      post: async (path, body) => {
        f.calls.push({ path, body });
        return new Promise((resolve, reject) => { f.finish = resolve; f.fail = reject; });
      },
      on: (event, handler) => { f.events[event] = handler; },
    } });
  });
  for (const [id, label] of [["tag", "Start Tag"], ["trivia", "Start Trivia"], ["rps", "Start Rock-paper-scissors"]]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    assert.equal(await page.locator("button:disabled").count(), 3, "pending requests disable all starts");
    const call = await page.evaluate(() => window.fixture.calls.at(-1));
    assert.deepEqual(call, { path: "/api/minigames/start", body: { game: id } });
    await page.evaluate(({ id, label }) => {
      const f = window.fixture;
      f.snap = { current: { game: id, title: label.slice(6), phase: "gather", players: ["Ada", "Ben"] }, scoreboard: [] };
      f.finish({ ok: true, ...f.snap });
    }, { id, label });
    await page.getByRole("status").filter({ hasText: "gathering" }).waitFor();
    assert.equal(await page.locator("button:disabled").count(), 3, "active games disable starts");
    await page.evaluate(() => {
      const f = window.fixture;
      f.snap = { current: null, scoreboard: [{ name: "Ada", wins: 1, points: 2, played: 1 }] };
      f.events.minigame({ kind: "end", summary: "Game over" });
    });
    await page.waitForFunction(() => document.querySelectorAll("button:enabled").length === 3);
  }
  assert.equal(await page.evaluate(() => window.fixture.calls.length), 3);
  await page.getByRole("button", { name: "Start Tag", exact: true }).click();
  await page.evaluate(() => window.fixture.finish({ error: "Resume the town before starting a game." }));
  await page.getByRole("status").filter({ hasText: "Resume the town" }).waitFor();
  assert.equal(await page.locator("button:enabled").count(), 3);
  await page.getByRole("button", { name: "Start Tag", exact: true }).click();
  await page.evaluate(() => window.fixture.fail(new Error("offline")));
  await page.getByRole("status").filter({ hasText: "Could not reach the town" }).waitFor();
  assert.equal(await page.locator("button:enabled").count(), 3);
  assert.deepEqual(errors, []);
  console.log("pass: all game buttons, pending/active states, SSE completion, server and network errors");
} finally { await browser.close(); }
