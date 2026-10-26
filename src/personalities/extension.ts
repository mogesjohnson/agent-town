/** Registers personalities with the shared loader in src/extensions.ts (grok/extensions). */
import type { Handler, PromptHook, Routes } from "../extensions.js";
import { editorHandler, UI_FILES } from "./editor-server.js";
import { personalityLines } from "./prompt.js";

/** Insert the character notes before the "You are talking with" line, else append them. */
export const personalitiesPromptHook: PromptHook = (prompt, { agent }) => {
  const lines = personalityLines(agent);
  if (!lines.length) return prompt;
  const notes = lines.join("\n");
  const at = prompt.indexOf("\nYou are talking with ");
  return at === -1 ? `${prompt}\n${notes}` : `${prompt.slice(0, at)}\n${notes}${prompt.slice(at)}`;
};

/** Called by loadExtensions() with { town, clients, routes, config, on, promptHooks }; uses routes and promptHooks. */
export function register(ctx: { routes: Routes; promptHooks: PromptHook[]; [k: string]: unknown }) {
  ctx.promptHooks.push(personalitiesPromptHook);
  const h: Handler = (req, res) => editorHandler(req, res);
  // Full-page editor at /personalities/ plus the API the side-panel (public/extensions/personalities.js) uses.
  for (const f of UI_FILES) ctx.routes.add("GET", `/personalities/${f}`, h);
  ctx.routes.add("GET", "/api/personalities", h);
  ctx.routes.add("PUT", "/api/personalities", h);
  ctx.routes.add("POST", "/api/personalities", h);
}
