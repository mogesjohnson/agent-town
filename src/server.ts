import { createServer, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { Town } from "./sim.js";
import { buildAdapters, detectAll } from "./plugins/index.js";
import { bus, routes, promptHooks, loadExtensions, clientExtensions } from "./extensions.js";
import { checkLocalRequest, readObject, RequestError } from "./request-safety.js";

const PUBLIC = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const clients = new Set<ServerResponse>();
const emit = (event: string, data: unknown) => {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(msg);
  bus.emit(event, data);
};

let config = loadConfig();
const adapters = buildAdapters(config);
const town = new Town(config, adapters, emit);
town.promptHooks = promptHooks;

async function reload() {
  config = loadConfig();
  town.config = config;
  const avail = await detectAll(buildAdapters(config));
  for (const [id, r] of avail) console.log(`[detect] ${id}: ${r.available ? "available" : "unavailable"}`);
  town.setAgents(config.agents, avail);
  adapters.clear();
  for (const [k, v] of buildAdapters(config)) adapters.set(k, v);
}

const server = createServer(async (req, res) => {
  try {
  checkLocalRequest(req);
  const url = new URL(req.url ?? "/", "http://localhost");
  const json = (o: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  const ext = routes.find(req.method ?? "GET", url.pathname);
  if (ext) return ext(req, res, url);
  if (url.pathname === "/api/extensions") return json(clientExtensions(PUBLIC));
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
    const b = await readObject(req);
    if (b.paused !== undefined && typeof b.paused !== "boolean")
      throw new RequestError(400, "paused must be boolean");
    town.paused = typeof b.paused === "boolean" ? b.paused : !town.paused;
    console.log(`[town] ${town.paused ? "paused" : "resumed"}`);
    town.broadcastState();
    return json({ paused: town.paused });
  }
  if (req.method === "POST" && url.pathname === "/api/chat") {
    const b = await readObject(req);
    if (typeof b.text !== "string" || (b.to !== undefined && typeof b.to !== "string"))
      throw new RequestError(400, "text and recipient must be strings");
    const text = b.text.slice(0, 500).trim();
    if (!text) return json({ ok: false });
    void town.human(String(b.to ?? "*"), text).catch(() => console.error("[town] chat failed"));
    return json({ ok: true });
  }
  if (req.method === "POST" && url.pathname === "/api/reload") {
    await readObject(req); await reload(); return json({ ok: true });
  }
  const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  if (file.includes("..")) { res.writeHead(400); return res.end(); }
  try {
    const data = await readFile(join(PUBLIC, file));
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end("not found"); }
  } catch (error) {
    if (!res.headersSent) res.writeHead(error instanceof RequestError ? error.status : 500,
      { "content-type": "application/json" });
    if (!res.writableEnded) res.end(JSON.stringify({ error: error instanceof RequestError ? error.message : "request failed" }));
  }
});

await reload();
await loadExtensions({ town, clients, config });
setInterval(() => { town.tick(); bus.emit("tick", town); }, 400);
server.listen(config.port, "127.0.0.1", () => console.log(`agent-town on http://localhost:${config.port}`));
