// Write tools. Each validates with the shared schema, then posts to the town's /api/mcp/change
// route, which validates again, applies the change and logs it. No file access happens here.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { call } from "./http.js";
import { shapes, type OpName } from "./schema.js";

const dryRun = z.boolean().optional().describe("Preview only: validate and return before/after without changing anything.");

type Def = { tool: string; op: OpName; title: string; description: string; fixed?: Record<string, unknown> };
const DEFS: Def[] = [
  { tool: "upsert_agent", op: "agent.upsert", title: "Add or update agent", description: "Add a new agent (provider defaults to mock) or change an existing agent's personality, color or model." },
  { tool: "set_personality", op: "personality.set", title: "Set personality", description: "Replace one agent's personality text (used in its prompts)." },
  { tool: "toggle_place", op: "place.toggle", title: "Open or close a place", description: 'Open (enabled: true) or close (false) a town place such as "bakery"; omit enabled to flip. Ids come from get_places.' },
  { tool: "upsert_season_event", op: "season.upsert", title: "Add or update season event", description: "Save a custom season event (dates, topic hint, visuals) in the town data folder. Activate it with trigger_event." },
  { tool: "trigger_event", op: "event.trigger", title: "Trigger event", description: "Force a season event by id (null clears the override) and/or post a town-wide announcement every agent hears." },
  { tool: "narrator_say", op: "narrator.say", title: "Narrator says", description: "Post a Narrator line to the chat log; every agent hears it. Cannot be undone." },
  { tool: "pause_town", op: "pause.set", title: "Pause town", description: "Pause the simulation (no new conversations).", fixed: { paused: true } },
  { tool: "resume_town", op: "pause.set", title: "Resume town", description: "Resume the simulation.", fixed: { paused: false } },
];

export function registerWrites(mcp: McpServer, base: URL) {
  const actor = () => (mcp.server.getClientVersion()?.name ?? "mcp-client").slice(0, 60);
  const reply = (r: Awaited<ReturnType<typeof call>>) => ({
    content: [{ type: "text" as const, text: r.ok ? JSON.stringify(r.data, null, 2) : r.reason }],
    ...(r.ok ? {} : { isError: true }),
  });

  for (const d of DEFS) {
    const shape = d.fixed ? {} : shapes[d.op];
    mcp.registerTool(d.tool, { title: d.title, description: d.description, inputSchema: { ...shape, dryRun } },
      async (input: Record<string, unknown>) => {
        const { dryRun: dry, ...args } = input;
        return reply(await call(base, "/api/mcp/change", { op: d.op, args: d.fixed ?? args, actor: actor(), dryRun: dry === true }));
      });
  }

  mcp.registerTool("undo_last_change", {
    title: "Undo last change",
    description: "Revert the most recent undoable change made through this plugin (any client). Repeat to step further back.",
    inputSchema: { dryRun },
  }, async ({ dryRun: dry }) => reply(await call(base, "/api/mcp/undo", { actor: actor(), dryRun: dry === true })));
}
