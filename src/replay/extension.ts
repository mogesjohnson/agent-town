// Replay extension, loaded by src/extensions.ts. Opt-in: it records only when AGENT_TOWN_RECORD
// is set (the file path to write). It always serves the player under /replay/, which is
// read-only and touches nothing else. It reads sim events from the extension bus, never the renderer.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";
import type { Town } from "../sim.js";
import type { Handler, Routes } from "../extensions.js";
import { Recorder } from "./recorder.js";

type Ctx = { town: Town; routes: Routes; on(event: string, fn: (data: unknown) => void): void };

const SRC = fileURLToPath(new URL("../../src/replay/", import.meta.url));
const FILES: Record<string, string> = {
  "player.html": "text/html", "player.js": "text/javascript", "view.js": "text/javascript", "highlights.js": "text/javascript",
};
const EVENTS = ["state", "say", "minigame", "scoreboard"];

const send = (res: ServerResponse, type: string, body: string | Buffer) => { res.writeHead(200, { "content-type": type }); res.end(body); };
const file = (path: string, type: string): Handler => async (_req, res) => {
  try { send(res, type, await readFile(path)); } catch { res.writeHead(404); res.end("not found"); }
};

export function register(ctx: Ctx) {
  for (const [name, type] of Object.entries(FILES)) ctx.routes.add("GET", `/replay/${name}`, file(join(SRC, name), type));
  const path = process.env.AGENT_TOWN_RECORD;
  ctx.routes.add("GET", "/api/replay", (_req, res) => send(res, "application/json", JSON.stringify({ recording: !!path })));
  if (!path) return;

  const rec = new Recorder(path, { seed: null, source: "server" });
  rec.record("state", ctx.town.state());
  for (const ev of EVENTS) ctx.on(ev, (data) => rec.record(ev, data));
  ctx.routes.add("GET", "/api/replay/current.ndjson", file(path, "application/x-ndjson"));
  const stop = () => void rec.close().then(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log("[replay] recording the town (AGENT_TOWN_RECORD is set)");
}
