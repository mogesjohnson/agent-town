// Town-server side of the MCP plugin: local JSON routes the stdio MCP server calls.
// Loaded from dist/mcp/extension.js by src/extensions.ts; server.ts is never edited.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Routes } from "../extensions.js";
import type { Town } from "../sim.js";

export interface McpContext { town: Town; routes: Routes }

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

export function register(ctx: McpContext) {
  ctx.routes.add("GET", "/api/mcp/info", (req, res) => { if (local(req, res)) send(res, 200, info(ctx)); });
}
