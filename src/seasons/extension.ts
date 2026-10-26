// Registers the season system through src/extensions.ts; loaded from dist/seasons/extension.js.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PromptHook, Routes } from "../extensions.js";
import { getActiveEvent, getEvents, getTopicHint } from "./index.js";
import { handleSeasonRequest, seasonState } from "./route.js";

/** The parts of the extension context seasons uses: register({ town, clients, routes, config, on, promptHooks }). */
export interface SeasonsContext {
  routes: Routes;
  promptHooks: PromptHook[];
  clients?: Set<ServerResponse>;
  on?: (event: string, fn: (d: unknown) => void) => void;
}

/** Sends a `season` SSE event (the same shape as GET /api/season) to every open /events client. */
function broadcast(clients?: Set<ServerResponse>) {
  if (!clients) return;
  const msg = `event: season\ndata: ${JSON.stringify(seasonState())}\n\n`;
  for (const c of clients) c.write(msg);
}

export function register(ctx: SeasonsContext): void {
  const handle = (req: IncomingMessage, res: ServerResponse) => handleSeasonRequest(req, res, () => broadcast(ctx.clients));
  ctx.routes.add("GET", "/api/season", handle);
  ctx.routes.add("POST", "/api/season", handle);
  ctx.routes.add("POST", "/api/season/clear", handle);
  ctx.promptHooks.push((prompt) => {
    const hint = getTopicHint();
    return hint ? `${prompt}\n${hint}` : prompt;
  });
  // The date pick can change while the server runs (midnight); tell clients when it does.
  let last = getActiveEvent()?.id ?? null;
  ctx.on?.("tick", () => {
    const now = getActiveEvent()?.id ?? null;
    if (now !== last) { last = now; broadcast(ctx.clients); }
  });
  console.log(`[seasons] ${getEvents().length} events loaded; active: ${last ?? "none"}`);
}
