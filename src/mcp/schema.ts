// Write-op schemas shared by the MCP tools (input validation) and the town extension (re-validation).
import { z } from "zod";

const name = z.string().trim().min(1).max(24).regex(/^[\p{L}\p{N} .'-]+$/u, "letters, digits, space . ' - only");
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'use "#rrggbb"');
const line = (max: number) => z.string().trim().min(1).max(max);
const cell = { x: z.number().int().min(0).max(199), y: z.number().int().min(0).max(199) };
const kind = z.string().regex(/^[a-z][a-z-]{0,19}$/);
const buildingId = z.string().regex(/^[\w-]{1,32}$/);
const need = z.number().min(0).max(100);
const text = (max: number) => z.string().trim().min(1).max(max).regex(/^[\p{L}\p{N} &'.,!?()-]+$/u, "letters, digits, space and & ' . , ! ? ( ) - only");
const placeId = z.string().regex(/^[a-z][a-z-]{1,30}$/, "lowercase letters and dashes");
const side = z.number().int().min(1).max(10);
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
  "place.add": {
    type: kind.describe("Place type from get_place_types: civic, fitness, food, fun, outdoor or shop."),
    name: text(40),
    x: z.number().int().min(0).max(39).optional().describe("Top-left column on the 40x25 map. Omit x and y to use near."),
    y: z.number().int().min(0).max(24).optional(),
    id: placeId.optional().describe("Defaults to a slug of the name."),
    w: side.optional(), h: side.optional().describe("Footprint; defaults to the type's size."),
    hours: z.object({ open: z.number().int().min(0).max(23), close: z.number().int().min(1).max(24) }).strict()
      .refine((t) => t.open < t.close, "need 0 <= open < close <= 24").optional(),
    vibe: text(80).optional(),
    items: z.array(text(60)).min(1).max(8).optional(), topics: z.array(text(60)).min(1).max(8).optional(),
  },
  "place.remove": { id: placeId.describe("Id of a custom place (built-ins cannot be removed; close them with toggle_place).") },
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
  "map.paint": {
    tiles: z.array(z.object({ ...cell, type: kind.describe("Tile type from the palette, e.g. grass, road, water, hill, tree.") }).strict())
      .min(1).max(500).describe("Cells to paint; tiles[y][x] in get_map."),
  },
  "map.add": { type: kind.describe("Building type from the palette, e.g. house, shop, cafe, park."), ...cell, id: buildingId.optional(), name: line(40).optional() },
  "map.move": { id: buildingId, ...cell, name: line(40).optional() },
  "map.remove": { id: buildingId },
  "map.undo": { editId: z.string().max(20).optional().describe("Map edit id; must be the latest edit. Omit for the latest.") },
  "mood.set": {
    agent: name,
    mood: z.string().regex(/^[a-z][a-z-]{0,23}$/).nullable().optional().describe("Mood override, e.g. happy, grumpy; null clears it."),
    needs: z.object({ hunger: need, energy: need, social: need, happiness: need }).partial().strict().optional(),
    durationMinutes: z.number().min(1).max(1440).optional().describe("Override length in game minutes (default 30)."),
  },
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
