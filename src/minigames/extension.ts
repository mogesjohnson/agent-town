import type { Server } from "node:http";
import type { Emit, Town } from "../sim.js";
import { registerMinigames } from "./index.js";

/**
 * Extension entry for the shared loader planned in grok/extensions (src/extensions.ts and
 * public/extensions/). Not wired up yet: that branch has not landed, so this shape is a guess
 * (`export default { name, register(ctx) }`) and will be adapted to the real API once it does.
 */
export interface ExtensionContext { town: Town; emit: Emit; server?: Server }

const minigames = {
  name: "minigames",
  /** Browser script the client-side loader should include; served by registerMinigames. */
  clientScripts: ["/minigames/overlay.js"],
  register(ctx: ExtensionContext) {
    return registerMinigames(ctx.town, ctx.emit, ctx.server);
  },
};

export default minigames;
