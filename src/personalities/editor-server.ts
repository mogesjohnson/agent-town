/** Standalone personalities editor: `node dist/personalities/editor-server.js` -> http://localhost:4318 */
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { LIMITS, MOODS } from "./schema.js";
import { loadForEditor, PERSONALITIES_PATH, savePersonalities } from "./store.js";

const PORT = Number(process.env.PERSONALITIES_PORT) || 4318;
const UI = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "src", "personalities", "ui");
const FILES: Record<string, [string, string]> = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/editor.js": ["editor.js", "text/javascript; charset=utf-8"],
  "/editor.css": ["editor.css", "text/css; charset=utf-8"],
};
const HEADERS = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'",
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { ...HEADERS, "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => { d += c; if (d.length > LIMITS.fileBytes) { resolve(null); req.destroy(); } });
    req.on("end", () => resolve(d));
  });
}

const server = createServer(async (req, res) => {
  // Block DNS rebinding: only answer requests addressed to this machine.
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  if (host !== "localhost" && host !== "127.0.0.1") { res.writeHead(403); return res.end(); }
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/api/personalities" && req.method === "GET") {
    const agents = loadConfig().agents.map((a) => a.name);
    return send(res, 200, { agents, moods: MOODS, limits: LIMITS, data: loadForEditor() });
  }
  if (url.pathname === "/api/personalities" && req.method === "PUT") {
    // JSON content type forces a CORS preflight, which we never approve, so other sites cannot write.
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return send(res, 415, { ok: false, errors: ["JSON only"] });
    const raw = await readBody(req);
    if (raw === null) return send(res, 413, { ok: false, errors: ["body too large"] });
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return send(res, 400, { ok: false, errors: ["invalid JSON"] }); }
    const r = savePersonalities(parsed);
    if (!r.ok) return send(res, 422, r);
    console.log(`[personalities] saved ${Object.keys(r.value.agents).length} agent(s) to ${PERSONALITIES_PATH}`);
    return send(res, 200, { ok: true, data: r.value });
  }
  const f = req.method === "GET" ? FILES[url.pathname] : undefined;
  if (!f) { res.writeHead(404, HEADERS); return res.end("not found"); }
  try {
    const data = await readFile(join(UI, f[0]));
    res.writeHead(200, { ...HEADERS, "content-type": f[1] });
    res.end(data);
  } catch { res.writeHead(404, HEADERS); res.end("not found"); }
});

server.listen(PORT, "127.0.0.1", () => console.log(`personalities editor on http://localhost:${PORT}`));
