// Write-op schemas shared by the MCP tools (input validation) and the town extension (re-validation).
import { z } from "zod";

const name = z.string().trim().min(1).max(24).regex(/^[\p{L}\p{N} .'-]+$/u, "letters, digits, space . ' - only");
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'use "#rrggbb"');
const line = (max: number) => z.string().trim().min(1).max(max);
const monthDay = z.string().regex(/^\d{2}-\d{2}$/, 'use "MM-DD"');

export const shapes = {
  "agent.upsert": {
    name, personality: line(200).optional(), color: color.optional(),
    provider: z.enum(["mock", "claude-code", "codex", "grok", "gemini", "ollama"]).optional()
      .describe("New agents only; defaults to mock. Existing agents keep their provider."),
    model: line(40).optional(),
  },
  "place.toggle": {
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/).describe('Place id from get_places, e.g. "bakery".'),
    enabled: z.boolean().optional().describe("true opens it, false closes it; omit to flip."),
  },
  "season.upsert": {
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/), name: line(40),
    windows: z.array(z.object({ from: monthDay, to: monthDay })).min(1).max(4),
    priority: z.number().int().min(0).max(100), topicHint: line(200),
    visuals: z.object({
      decor: z.array(line(40)).max(8), weather: z.enum(["clear", "rain", "snow", "fog", "wind", "storm"]), tint: color,
      ambient: z.object({ timeOfDay: z.enum(["day", "dusk", "night"]).optional(), brightness: z.number().min(0).max(1).optional() }).optional(),
    }),
  },
  "personality.set": { agent: name, personality: line(200) },
  "event.trigger": {
    season: z.string().max(48).nullable().optional().describe("Season event id to force (custom or seasons extension); null clears the override."),
    announcement: line(280).optional().describe("A town-wide happening, posted to the chat log and heard by every agent."),
  },
  "pause.set": { paused: z.boolean() },
  "narrator.say": { text: line(280) },
};

export type OpName = keyof typeof shapes;
export const schemas = Object.fromEntries(
  Object.entries(shapes).map(([k, v]) => [k, z.object(v).strict()]),
) as { [K in OpName]: z.ZodObject<(typeof shapes)[K]> };
export type Args<K extends OpName> = z.infer<(typeof schemas)[K]>;

/** Body of POST /api/mcp/change. */
export const changeBody = z.object({
  op: z.string().max(40), args: z.unknown(), actor: line(60), dryRun: z.boolean().optional(),
}).strict();
