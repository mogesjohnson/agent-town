import type { ServerResponse } from "node:http";
import type { Routes } from "../extensions.js";
import type { Town } from "../sim.js";
import { registerMinigames } from "./index.js";

/** The ctx that src/extensions.ts passes to register() (see README "Extensions"). */
interface ExtensionCtx { town: Town; clients: Set<ServerResponse>; routes: Routes }

/** Loaded by loadExtensions() from dist/minigames/extension.js. */
export function register({ town, clients, routes }: ExtensionCtx) {
  // Same SSE framing as server.ts, written to the shared client set.
  const emit = (event: string, data: unknown) => {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(msg);
  };
  return registerMinigames(town, emit, routes);
}
