// Registers the season system through src/extensions.ts; loaded from dist/seasons/extension.js.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PromptHook, Routes } from "../extensions.js";
import { getActiveEvent, getEvents, getTopicHint } from "./index.js";
import { handleSeasonRequest } from "./route.js";

/** The parts of the extension context seasons uses; anything else in it is ignored. */
export interface SeasonsContext {
  routes: Routes;
  promptHooks: PromptHook[];
  town?: { broadcastState?: () => void };
}

export function register(ctx: SeasonsContext): void {
  const onChange = () => ctx.town?.broadcastState?.();
  const handle = (req: IncomingMessage, res: ServerResponse) => handleSeasonRequest(req, res, onChange);
  ctx.routes.add("GET", "/api/season", handle);
  ctx.routes.add("POST", "/api/season", handle);
  ctx.routes.add("POST", "/api/season/clear", handle);
  ctx.promptHooks.push((prompt) => {
    const hint = getTopicHint();
    return hint ? `${prompt}\n${hint}` : prompt;
  });
  const ev = getActiveEvent();
  console.log(`[seasons] ${getEvents().length} events loaded; active: ${ev ? ev.id : "none"}`);
}
