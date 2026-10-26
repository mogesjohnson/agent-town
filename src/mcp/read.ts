// Read views: each one is exposed as an MCP resource (town://<name>) and a get_<name> tool.
import { call, Reply } from "./http.js";

export interface View { name: string; title: string; description: string; load: (base: URL) => Promise<unknown> }

type State = { agents?: unknown[]; landmarks?: unknown[]; log?: unknown[]; [k: string]: unknown };

/** Unwraps a reply: data on success, an { available: false, reason } note otherwise. */
const value = (r: Reply, pick: (d: any) => unknown = (d) => d) =>
  r.ok ? pick(r.data) : { available: false, reason: r.reason };

const state = (base: URL) => call(base, "/api/state");

export const VIEWS: View[] = [
  { name: "town", title: "Town state", description: "Full snapshot: size, landmarks, paused flag, usage, agents and last 50 chat lines.",
    load: async (b) => value(await state(b)) },
  { name: "agents", title: "Agents", description: "Every agent with position (x, y), status, provider, turns used and speech bubble.",
    load: async (b) => value(await state(b), (d: State) => d.agents ?? []) },
  { name: "chats", title: "Recent chats", description: "Last 50 chat lines, oldest first: { t, from, to, text }.",
    load: async (b) => value(await state(b), (d: State) => d.log ?? []) },
  { name: "places", title: "Places", description: "Landmarks on the town map, plus the places feature's data when its route exists.",
    load: async (b) => ({ landmarks: value(await state(b), (d: State) => d.landmarks ?? []), places: value(await call(b, "/api/places")) }) },
  { name: "seasons", title: "Seasons", description: "Active seasonal event, topic hint, visuals and the event list (seasons extension).",
    load: async (b) => value(await call(b, "/api/season")) },
  { name: "personalities", title: "Personalities", description: "Personality text per agent from config, plus the personalities editor data when installed.",
    load: async (b) => ({
      config: value(await call(b, "/api/mcp/info"), (d) => d.config.agents.map((a: any) => ({ name: a.name, personality: a.personality }))),
      editor: value(await call(b, "/api/personalities")),
    }) },
  { name: "scoreboard", title: "Minigame scoreboard", description: "Minigame wins and points per agent (minigames extension).",
    load: async (b) => value(await call(b, "/api/minigames")) },
  { name: "moods", title: "Moods", description: "Per-agent mood, emoji, needs (hunger, energy, social, happiness 0-100) and any override (moods feature).",
    load: async (b) => value(await call(b, "/api/moods")) },
  { name: "config", title: "Config", description: "Town config: port, limits, adapters and agents (account labels removed).",
    load: async (b) => value(await call(b, "/api/mcp/info"), (d) => d.config) },
  { name: "extensions", title: "Extensions", description: "Loaded server extensions (dist/<name>/extension.js) and client extension scripts.",
    load: async (b) => ({ server: value(await call(b, "/api/mcp/info"), (d) => d.extensions.server), client: value(await call(b, "/api/extensions")) }) },
  { name: "changes", title: "Change log", description: "Last 50 changes made through this plugin: who (MCP client), op, args, before/after, undo links.",
    load: async (b) => value(await call(b, "/api/mcp/changes"), (d) => d.changes) },
  { name: "map", title: "Map", description: "Editable map: width, height, tiles[y][x], buildings, places, version, plus the palette (map editor).",
    load: async (b) => {
      const map = await call(b, "/api/map");
      return map.ok ? { ...(map.data as object), palette: value(await call(b, "/api/map/palette")) } : value(map);
    } },
  { name: "map_history", title: "Map history", description: "Last 50 map edits, newest first: editId, actor, kind, summary, undone.",
    load: async (b) => value(await call(b, "/api/map/history?limit=50")) },
];
