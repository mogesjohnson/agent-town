import type { ServerResponse } from "node:http";
import type { Town } from "../sim.js";

/** Example extension: GET /api/hello returns a greeting and the agent count. */
export function register(ctx: { town: Town; routes: { add: Function } }) {
  ctx.routes.add("GET", "/api/hello", (_req: unknown, res: ServerResponse) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ hello: "town", agents: ctx.town.agents.length }));
  });
}
