// Town-server side of the MCP plugin: local JSON routes the stdio MCP server calls.
// Loaded from dist/mcp/extension.js by src/extensions.ts; server.ts is never edited.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PromptHook, Routes } from "../extensions.js";
import type { Town } from "../sim.js";
import type { AgentConfig } from "../types.js";
import { changeBody } from "./schema.js";
import { makeOps, OpError } from "./ops.js";
import { changes, readOverlay } from "./store.js";

export interface McpContext { town: Town; routes: Routes; promptHooks: PromptHook[] }

const DIST = fileURLToPath(new URL("..", import.meta.url));

export function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

/** Blocks DNS rebinding: answer only requests addressed to this machine. */
export function local(req: IncomingMessage, res: ServerResponse): boolean {
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  if (["127.0.0.1", "localhost", "[::1]"].includes(host)) return true;
  send(res, 403, { ok: false, error: "loopback only" });
  return false;
}

/** Server extensions present in dist/ (any folder with an extension.js). */
function serverExtensions(): string[] {
  return readdirSync(DIST, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(DIST, d.name, "extension.js")))
    .map((d) => d.name).sort();
}

/** Config without account labels, plus the extension list. */
export function info(ctx: McpContext) {
  const { agents, ...rest } = ctx.town.config; // town.config follows /api/reload
  return {
    config: { ...rest, agents: agents.map(({ account: _a, ...a }) => a) },
    extensions: { server: serverExtensions() },
  };
}

/** JSON body up to 16 KB. Requiring application/json means a web page cannot post here without a CORS preflight. */
function readJson(req: IncomingMessage): Promise<unknown> {
  if (!/^application\/json\b/.test(req.headers["content-type"] ?? "")) return Promise.reject(new OpError("content-type must be application/json", 415));
  return new Promise((ok, fail) => {
    let d = "";
    req.on("data", (c) => { d += c; if (d.length > 16_384) { fail(new OpError("body too large", 413)); req.destroy(); } });
    req.on("end", () => { try { ok(JSON.parse(d || "{}")); } catch { fail(new OpError("invalid JSON")); } });
  });
}

const fail = (res: ServerResponse, e: unknown) =>
  send(res, e instanceof OpError ? e.status : 500, { ok: false, error: e instanceof Error ? e.message : String(e) });

export function register(ctx: McpContext) {
  const { town, routes } = ctx;
  const ops = makeOps(town);

  // Agents added or changed through MCP survive /api/reload: re-apply the overlay after every setAgents.
  const reapply = () => { for (const [name, cfg] of Object.entries(readOverlay<AgentConfig>("agents"))) ops.applyAgent(name, cfg); };
  const setAgents = town.setAgents.bind(town);
  town.setAgents = (list, avail) => { setAgents(list, avail); reapply(); };
  reapply();

  ctx.promptHooks.push((p) => { const hint = ops.activeHint(); return hint ? `${p}\n${hint}` : p; });

  routes.add("GET", "/api/mcp/info", (req, res) => { if (local(req, res)) send(res, 200, info(ctx)); });
  routes.add("GET", "/api/mcp/changes", (req, res, url) => {
    if (!local(req, res)) return;
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 500);
    send(res, 200, { changes: changes.slice(-limit) });
  });
  routes.add("POST", "/api/mcp/change", async (req, res) => {
    if (!local(req, res)) return;
    try {
      const b = changeBody.safeParse(await readJson(req));
      if (!b.success) throw new OpError(b.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      send(res, 200, await ops.apply(b.data.op, b.data.args, b.data.actor, b.data.dryRun));
    } catch (e) { fail(res, e); }
  });
  routes.add("POST", "/api/mcp/undo", async (req, res) => {
    if (!local(req, res)) return;
    try {
      const b = changeBody.pick({ actor: true, dryRun: true }).safeParse(await readJson(req));
      if (!b.success) throw new OpError("actor is required");
      send(res, 200, await ops.undo(b.data.actor, b.data.dryRun));
    } catch (e) { fail(res, e); }
  });
}
