import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

export type Params = Record<string, string>;
export type Handler = (req: IncomingMessage, res: ServerResponse, url: URL, params: Params) => unknown;
export type PromptHook = (prompt: string, info: { agent: string; partner: string }) => string;

/** Route table that server.ts consults before its own routes.
 *  Paths may use `:name` segments (params.name) and a trailing `/*` prefix (params["*"]).
 *  Exact paths win, then patterns in the order they were added. */
export class Routes {
  private table = new Map<string, Handler>();
  private patterns: { method: string; parts: string[]; handler: Handler }[] = [];
  add(method: string, path: string, handler: Handler) {
    const m = method.toUpperCase();
    if (/(^|\/)(:|\*$)/.test(path)) this.patterns.push({ method: m, parts: path.split("/"), handler });
    else this.table.set(`${m} ${path}`, handler);
  }
  find(method: string, path: string): ((req: IncomingMessage, res: ServerResponse, url: URL) => unknown) | undefined {
    const m = method.toUpperCase();
    const exact = this.table.get(`${m} ${path}`);
    if (exact) return (req, res, url) => exact(req, res, url, {});
    const segs = path.split("/");
    for (const r of this.patterns) {
      if (r.method !== m) continue;
      const params: Params = {};
      const ok = r.parts.every((p, i) => {
        if (p === "*" && i === r.parts.length - 1) return (params["*"] = segs.slice(i).join("/")), segs.length >= i;
        if (p.startsWith(":")) return segs[i] ? ((params[p.slice(1)] = decodeURIComponent(segs[i])), true) : false;
        return p === segs[i];
      }) && (r.parts.at(-1) === "*" || segs.length === r.parts.length);
      if (ok) return (req, res, url) => r.handler(req, res, url, params);
    }
    return undefined;
  }
}

export const bus = new EventEmitter();
export const routes = new Routes();
export const promptHooks: PromptHook[] = [];

const DIST = fileURLToPath(new URL(".", import.meta.url));

/** Load dist/<feature>/extension.js in alphabetical order and call register(ctx). */
export async function loadExtensions(base: Record<string, unknown>) {
  const ctx = { ...base, routes, promptHooks, on: (e: string, fn: (d: unknown) => void) => bus.on(e, fn) };
  const dirs = readdirSync(DIST, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const dir of dirs) {
    const file = join(DIST, dir, "extension.js");
    if (!existsSync(file)) continue;
    try {
      const mod = await import(pathToFileURL(file).href);
      await mod.register?.(ctx);
      console.log(`[ext] loaded ${dir}`);
    } catch (e) { console.error(`[ext] ${dir} failed: ${(e as Error).message}`); }
  }
}

/** Client extension files in public/extensions/*.js. */
export function clientExtensions(publicDir: string): string[] {
  const dir = join(publicDir, "extensions");
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".js")).sort().map((f) => `/extensions/${f}`) : [];
}
