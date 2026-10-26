#!/usr/bin/env node
// Print the highlights of a replay: node scripts/replay/highlights.mjs <replay.ndjson> [--top 5] [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!file) { console.error("usage: highlights.mjs <replay.ndjson> [--top n] [--json out.json]"); process.exit(1); }
await import(new URL("../../src/replay/highlights.js", import.meta.url));
const { parse, pick } = globalThis.AgentTownHighlights;
const lines = parse(readFileSync(file, "utf8"));
if (lines[0]?.format !== "agent-town-replay") { console.error(`replay: ${file} is not an agent-town replay`); process.exit(1); }
const hs = pick(lines, { top: Number(opt("top", 5)) });
const mmss = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
for (const h of hs) console.log(`${mmss(h.t)}  ${String(h.score).padStart(2)}  ${h.kind.padEnd(13)} ${h.caption}`);
if (opt("json")) writeFileSync(opt("json"), JSON.stringify(hs, null, 2) + "\n");
