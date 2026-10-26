#!/usr/bin/env node
// Record a headless mock-agent day: node scripts/replay/record-day.mjs --out replays/day.ndjson
// [--seed 7] [--minutes 6] [--speed 20] [--visitor "hello town!" | --no-visitor]. Needs `npm run build`.
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
if (args.includes("--help")) { console.log("usage: record-day.mjs --out <file.ndjson> [--seed n] [--minutes n] [--speed n] [--visitor text|--no-visitor]"); process.exit(0); }
const lib = new URL("../../dist/replay/headless.js", import.meta.url);
if (!existsSync(lib)) { console.error("replay: dist/ is missing, run `npm run build` first"); process.exit(1); }
const { recordHeadlessDay } = await import(lib);
const out = opt("out", "replays/day.ndjson");
const r = await recordHeadlessDay({
  out, seed: Number(opt("seed", 7)), minutes: Number(opt("minutes", 6)), speed: Number(opt("speed", 20)),
  visitor: args.includes("--no-visitor") ? undefined : opt("visitor", "Hello town! What's everyone up to?"),
});
console.log(`replay: wrote ${r.lines} lines to ${out} (seed ${r.seed}, ${r.minutes} sim minutes at ${r.speed}x, ${r.usage.conversations} conversations, ${r.usage.calls} mock calls)`);
