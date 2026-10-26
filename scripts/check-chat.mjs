import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const state = { w: 40, h: 25, paused: false, landmarks: [], maxTurnsPerAgent: 20, turnsPerMinute: 30,
  usage: { calls: 0, errors: 0, conversations: 0, chars: 0 }, agents: ["Ada", "Ben"].map((name) => ({
    name, x: 1, y: 1, color: "#fff", status: "idle", turns: 0, provider: "mock", model: "canned", account: "built-in",
  })) };
const fixture = [
  { t: 1, from: "You", to: "All", text: "Hello town" },
  { t: 2, from: "Ada", to: "You", text: "Welcome visitor" },
  { t: 3, from: "You", to: "Ada", text: "Direct hello" },
];
const streams = new Set(), requests = [];
let connections = 0;
const send = (res, type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
const broadcast = (type, data) => { for (const res of streams) send(res, type, data); };
const server = createServer((req, res) => {
  if (req.url === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    res.write("retry: 100\n\n"); connections++; streams.add(res);
    send(res, "state", state); send(res, "log", fixture);
    req.on("close", () => streams.delete(res)); return;
  }
  if (req.url === "/api/chat") {
    let body = ""; req.on("data", (s) => { body += s; });
    req.on("end", () => { requests.push(JSON.parse(body)); res.end('{"ok":true}'); }); return;
  }
  if (req.url === "/app.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(source); return; }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<canvas id="town" width="800" height="500"></canvas><button id="pause"></button>
    <ul id="lobby"></ul><div id="usage"></div><div id="token-agents"></div><div id="token-summary"></div>
    <div id="log"></div><div id="tabs"></div><div id="msgs"></div>
    <form id="form"><input id="input"><button>Send</button></form><script type="module" src="/app.js"></script>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
try {
  const page = await browser.newPage(), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?renderer=2d`);
  await page.waitForFunction(() => document.querySelectorAll("#log > div").length === 3);
  for (const message of fixture) broadcast("say", message);
  broadcast("log", fixture);
  for (const res of streams) res.end();
  await page.waitForFunction(() => document.querySelectorAll("#log > div").length === 3);
  await page.waitForTimeout(400);
  assert.ok(connections >= 2, "real EventSource reconnected");
  assert.equal(await page.locator("#log > div").count(), 3, "snapshot and live duplicates ignored");
  assert.equal(await page.locator("#msgs > div").count(), 2, "All keeps broadcast and resident reply routing");
  await page.locator('#tabs [data-tab="Ada"]').click();
  assert.equal(await page.locator("#msgs > div").count(), 2, "direct tab keeps visitor and reply");
  await page.locator("#input").fill("Direct fixture"); await page.locator("#form button").click();
  await page.locator('#tabs [data-tab="All"]').click();
  await page.locator("#input").fill("All fixture"); await page.locator("#form button").click();
  await page.waitForTimeout(50);
  assert.deepEqual(requests, [{ to: "Ada", text: "Direct fixture" }, { to: "*", text: "All fixture" }]);
  broadcast("say", { ...fixture[1], t: 4 });
  await page.waitForFunction(() => document.querySelectorAll("#log > div").length === 4);
  assert.equal(await page.locator("#log > div").count(), 4, "same spoken text at a new time is a separate message");
  const many = Array.from({ length: 250 }, (_, i) => ({ t: 100 + i, from: "Ada", to: "You", text: `Fixture ${i}` }));
  broadcast("log", many);
  await page.waitForFunction(() => document.querySelector("#log").lastElementChild.textContent.includes("Fixture 249"));
  assert.equal(await page.locator("#log > div").count(), 200);
  assert.equal(await page.locator("#msgs > div").count(), 200, "All bounded");
  await page.locator('#tabs [data-tab="Ada"]').click();
  assert.equal(await page.locator("#msgs > div").count(), 200, "direct tab bounded");
  assert.match(await page.locator("#msgs > div").first().textContent(), /Fixture 50$/);
  broadcast("say", many.at(-1));
  await page.waitForTimeout(50);
  assert.equal(await page.locator("#log > div").count(), 200);
  assert.deepEqual(errors, []);
  console.log("pass: real SSE reconnect/live deduplication, All/direct routing and 200-line log/tab caps");
} finally {
  await browser.close(); for (const res of streams) res.end();
  await new Promise((resolve) => server.close(resolve));
}
