import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

export type Handler = (req: IncomingMessage, res: ServerResponse, url: URL) => unknown;
export type PromptHook = (prompt: string, info: { agent: string; partner: string }) => string;

/** Route table that server.ts consults before its own routes. */
export class Routes {
  private table = new Map<string, Handler>();
  add(method: string, path: string, handler: Handler) { this.table.set(`${method.toUpperCase()} ${path}`, handler); }
  find(method: string, path: string) { return this.table.get(`${method.toUpperCase()} ${path}`); }
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
