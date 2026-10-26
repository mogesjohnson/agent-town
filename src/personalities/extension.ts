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

export function register(ctx: { routes: Routes; promptHooks: PromptHook[] }) {
  ctx.promptHooks.push(personalitiesPromptHook);
  const h: Handler = (req, res) => editorHandler(req, res);
  // Editor page at /personalities/ on the town server, same API as the standalone editor.
  for (const f of UI_FILES) ctx.routes.add("GET", `/personalities/${f}`, h);
  ctx.routes.add("GET", "/api/personalities", h);
  ctx.routes.add("PUT", "/api/personalities", h);
}
