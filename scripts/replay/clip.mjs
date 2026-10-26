#!/usr/bin/env node
// Turn a replay's top highlights into a short captioned clip (demo-reel approach: headless
// Chrome + Playwright screenshots, then ffmpeg). Never downloads anything.
// node scripts/replay/clip.mjs <replay.ndjson> [--out clip.mp4] [--gif] [--top 4] [--speed 2] [--playwright <dir>]
import { readFileSync, existsSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && args[i - 1] !== "--gif"));
if (!file) { console.error("usage: clip.mjs <replay.ndjson> [--out clip.mp4] [--gif] [--top n] [--speed n] [--playwright dir]"); process.exit(1); }
const out = resolve(opt("out", "replays/clip.mp4")), top = Number(opt("top", 4)), speed = Number(opt("speed", 2));
const fail = (msg) => { console.error(`replay: ${msg}`); process.exit(2); };

async function playwright() {
  for (const name of ["playwright-core", "playwright"]) { try { return await import(name); } catch {} }
  const dir = opt("playwright", process.env.REPLAY_PLAYWRIGHT_DIR);
  const entry = dir && ["playwright-core", "playwright"].map((n) => join(dir, "node_modules", n, "index.mjs")).find(existsSync);
  return entry ? import(pathToFileURL(entry).href) : null;
}
const chrome = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => p && existsSync(p));
const has = (bin) => spawnSync(bin, ["-version"], { stdio: "ignore" }).status === 0;

const pw = await playwright();
if (!pw) fail("Playwright is not installed. Install playwright-core, or pass --playwright <dir containing node_modules/playwright-core>.");
const text = readFileSync(file, "utf8");
await import(new URL("../../src/replay/highlights.js", import.meta.url));
const lines = globalThis.AgentTownHighlights.parse(text);
const hs = globalThis.AgentTownHighlights.pick(lines, { top });
if (!hs.length) fail("no highlights in this replay");

if (!has("ffmpeg")) fail("ffmpeg is not on PATH; install it to render clips.");
// Frames are rendered deterministically: seek the player to each frame's time and screenshot it,
// so the clip never depends on Playwright's own video encoder or the machine's speed.
const FPS = 15, step = (1000 / FPS) * speed;
const size = { width: 1280, height: 720 };
const browser = await (pw.chromium || pw.default.chromium).launch({ executablePath: chrome, headless: true })
  .catch((e) => fail(`could not start Chrome (${e.message.split("\n")[0]}). Set CHROME_PATH.`));
const page = await browser.newPage({ viewport: size });
await page.goto(`${new URL("../../src/replay/player.html", import.meta.url).href}?clip`);
await page.evaluate((t) => window.replay.load(t), text);
mkdirSync(dirname(out), { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "replay-clip-"));
let n = 0;
const shot = async () => page.screenshot({ path: join(tmp, `f${String(n++).padStart(5, "0")}.jpg`), type: "jpeg", quality: 85 });
const hold = async (sec) => { for (let i = 0; i < sec * FPS; i++) await shot(); };
await page.evaluate((s) => window.replay.card("A day in agent-town", s), `${hs.length} highlights · seed ${lines[0].seed ?? "live"}`);
await hold(2);
await page.evaluate(() => window.replay.card(""));
for (const h of hs) {
  await page.evaluate((c) => window.replay.setCaption(c), h.caption);
  for (let t = h.start; t <= Math.min(h.end, h.start + 6000 * speed); t += step) { await page.evaluate((t) => window.replay.seek(t), t); await shot(); }
  console.log(`  ${(h.t / 1000).toFixed(0).padStart(4)}s  ${h.kind.padEnd(13)} ${h.caption}`);
}
await page.evaluate(() => { window.replay.setCaption(null); window.replay.card("agent-town", "recorded with src/replay"); });
await hold(1.5);
await browser.close();
const ff = (a) => spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(tmp, "f%05d.jpg"), ...a], { stdio: "inherit" }).status === 0;
const ok = ff(["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "28", "-movflags", "+faststart", out]);
if (ok) console.log(`replay: wrote ${out} (${(n / FPS).toFixed(1)} s)`);
if (ok && args.includes("--gif")) {
  const gif = out.replace(/\.\w+$/, ".gif");
  const vf = "fps=10,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse";
  if (ff(["-vf", vf, gif])) console.log(`replay: wrote ${gif}`);
}
rmSync(tmp, { recursive: true, force: true });
if (!ok) fail("ffmpeg could not write the mp4");
