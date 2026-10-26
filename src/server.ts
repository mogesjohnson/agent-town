import { createServer, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { Town } from "./sim.js";
import { buildAdapters, detectAll } from "./plugins/index.js";

const PUBLIC = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const clients = new Set<ServerResponse>();
const emit = (event: string, data: unknown) => {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(msg);
};

let config = loadConfig();
const adapters = buildAdapters(config);
const town = new Town(config, adapters, emit);

async function reload() {
  config = loadConfig();
  town.config = config;
  const avail = await detectAll(buildAdapters(config));
  for (const [id, r] of avail) console.log(`[detect] ${id}: ${r.available ? "available" : "unavailable"}`);
  town.setAgents(config.agents, avail);
  adapters.clear();
  for (const [k, v] of buildAdapters(config)) adapters.set(k, v);
}

function body(req: import("node:http").IncomingMessage): Promise<any> {
  return new Promise((res) => {
    let d = "";
    req.on("data", (c) => { d += c; if (d.length > 10_000) req.destroy(); });
    req.on("end", () => { try { res(JSON.parse(d || "{}")); } catch { res({}); } });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const json = (o: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (url.pathname === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    clients.add(res);
    res.write(`event: state\ndata: ${JSON.stringify(town.state())}\n\n`);
    res.write(`event: log\ndata: ${JSON.stringify(town.log.slice(-50))}\n\n`);
    req.on("close", () => clients.delete(res));
    return;
  }
  if (url.pathname === "/api/state") return json({ ...town.state(), log: town.log.slice(-50) });
  if (req.method === "POST" && url.pathname === "/api/pause") {
    const b = await body(req);
    town.paused = typeof b.paused === "boolean" ? b.paused : !town.paused;
    console.log(`[town] ${town.paused ? "paused" : "resumed"}`);
    town.broadcastState();
    return json({ paused: town.paused });
  }
  if (req.method === "POST" && url.pathname === "/api/chat") {
    const b = await body(req);
    const text = String(b.text ?? "").slice(0, 500).trim();
    if (!text) return json({ ok: false });
    void town.human(String(b.to ?? "*"), text);
    return json({ ok: true });
  }
  if (req.method === "POST" && url.pathname === "/api/reload") { await reload(); return json({ ok: true }); }
  const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  if (file.includes("..")) { res.writeHead(400); return res.end(); }
  try {
    const data = await readFile(join(PUBLIC, file));
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end("not found"); }
});

await reload();
setInterval(() => town.tick(), 400);
server.listen(config.port, "127.0.0.1", () => console.log(`agent-town on http://localhost:${config.port}`));
