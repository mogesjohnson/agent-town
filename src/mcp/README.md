# agent-town MCP server

Lets a Claude Code or Codex CLI session see the town (and, with the write tools, change it).
It is a stdio [MCP](https://modelcontextprotocol.io) server built with `@modelcontextprotocol/sdk`.
It talks only to the running town server over HTTP on loopback. It never reads or writes files itself.

## Setup

```sh
npm install
npm run build        # builds dist/mcp/server.js and dist/mcp/extension.js
npm start            # the town, on http://127.0.0.1:4317
```

Claude Code, from the repo root:

```sh
claude mcp add agent-town -- node dist/mcp/server.js
```

Codex, in `~/.codex/config.toml` (use the absolute path to your clone):

```toml
[mcp_servers.agent-town]
command = "node"
args = ["@@REPO@@/dist/mcp/server.js"]
# env = { AGENT_TOWN_PORT = "4317" }
```

| Env var | Default | Meaning |
| --- | --- | --- |
| `AGENT_TOWN_URL` | `http://127.0.0.1:4317` | Town server base URL. Must be `http://` on `127.0.0.1`, `localhost` or `[::1]`; anything else exits. |
| `AGENT_TOWN_PORT` | `4317` | Port, used when `AGENT_TOWN_URL` is not set. Match `port` in `town.config.json`. |

The MCP server starts even when the town is not running. Tools then answer
`{ "available": false, "reason": "town server not reachable ..." }`.

## Read resources and tools

Every view is a resource and a matching read-only tool.

Start world additions with `get_world` (`town://world`): one compact overview contains
agent positions, places, buildings, terrain counts, available place types and the map
palette. Its HTTP reads run in parallel; it omits chat history and the full tile grid.
Use `get_map` only when individual cells are needed. `add_place` can find free space
near a place, building or pond automatically. Map add/move/paint previews run the same
pure validation as the editor, including footprints, overlap and reserved-place skips;
another writer may still change the world between preview and apply.

Run `npm run build` then `node scripts/check-mcp.mjs` for an actual SDK stdio handshake
and isolated mock-town checks of resources, tools, preview, add/move/remove and undo.
The test uses a disposable data directory and port 4329 (`MCP_CHECK_PORT` overrides it),
never the user's running town or real provider adapters.

| Resource | Tool | Source |
| --- | --- | --- |
| `town://town` | `get_town` | `GET /api/state`: size, landmarks, paused, usage, agents, last 50 lines |
| `town://agents` | `get_agents` | agents from `/api/state`: x, y, status, provider, turns, bubble, met |
| `town://chats` | `get_chats` | the last 50 chat lines `{ t, from, to, text }` |
| `town://places` | `get_places` | landmarks, plus `GET /api/places` when the places feature serves it |
| `town://place_types` | `get_place_types` | `GET /api/places/types`: types `add_place` accepts, with default `w`, `h`, template and roles |
| `town://seasons` | `get_seasons` | `GET /api/season` (seasons extension) |
| `town://personalities` | `get_personalities` | config personality text, plus `GET /api/personalities` (personalities editor) |
| `town://moods` | `get_moods` | `GET /api/moods` (moods feature) |
| `town://scoreboard` | `get_scoreboard` | `GET /api/minigames` (minigames extension) |
| `town://config` | `get_config` | `GET /api/mcp/info`: config without `account` labels |
| `town://extensions` | `get_extensions` | server extensions in `dist/` plus `GET /api/extensions` |
| `town://map` | `get_map` | `GET /api/map` + `/api/map/palette` (map editor): `tiles[y][x]`, buildings, places, version |
| `town://map_history` | `get_map_history` | `GET /api/map/history?limit=50`: map edits, newest first |
| `town://changes` | `get_changes` | `GET /api/mcp/changes`: the last 50 changes made through this plugin |

A feature that is not installed yet answers `{ "available": false, "reason": "... HTTP 404" }`
for its part. Nothing crashes.

## Write tools

Every write tool takes an optional `dryRun: true`. A dry run validates the input and returns
`before` and `after` without changing anything or writing to the log.

| Tool | Does | Undo |
| --- | --- | --- |
| `upsert_agent` | `{ name, personality?, color?, provider?, model? }`: adds an agent (default provider `mock`) or updates one | restores it, or removes an added agent |
| `set_personality` | `{ agent, personality }`: replaces the prompt personality | restores the old text |
| `toggle_place` | `{ id, enabled? }`: opens or closes a place, such as `bakery`, via `POST /api/places/toggle` | toggles it back |
| `add_place` | `{ type, name, x, y }` or `{ type, name, near }`, plus optional `id, w, h, hours, vibe, items, topics`, via `POST /api/places` | deletes the created place |
| `remove_place` | `{ id }`: deletes a custom place via `DELETE /api/places/:id` (built-ins answer 403) | re-creates it with the same id and fields (409 if the id or spot was taken since) |
| `upsert_season_event` | a full season event (`id, name, windows, priority, topicHint, visuals`), saved to town data | restores or removes it |
| `trigger_event` | `{ season?, announcement? }`: forces a season (`null` clears it) and/or announces a happening | restores the previous season |
| `pause_town` / `resume_town` | pauses or resumes the sim | restores the previous state |
| `narrator_say` | `{ text }`: a Narrator line every agent hears | none (it is a chat line) |
| `paint_tiles` | `{ tiles: [{ x, y, type }] }`, at most 500, types from the palette | the editor undoes that edit |
| `place_building` | `{ type, x, y, id?, name? }`, type from the palette (house, shop, cafe, park, library, plaza) | the editor undoes that edit |
| `move_building` / `remove_building` | `{ id, x, y, name? }` / `{ id }` | the editor undoes that edit |
| `undo_map_edit` | the map editor's own undo of the latest map edit, by anyone | none |
| `set_mood` | `{ agent, mood?, needs?, durationMinutes? }`: mood override (`null` clears it), needs 0-100, duration 1-1440 game minutes | restores the needs and override from just before |
| `undo_last_change` | reverts the newest undoable change from any client; call it again to go further back | |

Map edits are tagged `codex` when the MCP client name contains "codex", otherwise `claude`.
`undo_last_change` refuses (409) to undo a map edit when someone has edited the map since then.
That keeps it from undoing the later edit. Use `undo_map_edit` to step back through the map yourself.

`add_place` and `remove_place` need the custom places routes (PR #24); without them they answer
"not available" (404). Without `x` and `y`, `near` picks the spot: a place id, a building id or name,
`"pond"`/`"water"` (the centroid of the largest water cluster on `GET /api/map`), or `{ x, y }`.
Free top-left spots inside the 40x25 map that miss every place, building and water tile are tried
nearest first. A 409 overlap (someone else built there meanwhile) searches again, up to 12 attempts.
The result lists the `attempts`. A dry run shows the target and the candidate spots.

Example asks: "build a bakery near the pond", "put a house at 0,22", "paint a road along y = 12", "make Rook hungry", "add a mock agent called Pip who is a cheerful baker", "close the bakery",
"pause the town", "undo that".

## Town-side extension

`src/mcp/extension.ts` is loaded by the shared extension loader (`src/extensions.ts`) and adds:

- `GET /api/mcp/info`: config (no account labels) and the server extension list.
- `POST /api/mcp/change` `{ op, args, actor, dryRun? }`: validates and applies one op, then logs it.
- `POST /api/mcp/undo` `{ actor, dryRun? }` and `GET /api/mcp/changes?limit=N`.

Agents and custom season events added this way live in `.runtime/town-data/`
(`agents.json`, `seasons.json`), which is git-ignored, and are re-applied after `/api/reload`.
Every change is appended to `.runtime/town-data/changes.jsonl` with the MCP client name as `actor`.
Custom season events steer talk through a prompt hook while they are active. They do not
appear in `/api/season`, because the seasons extension has no add-event route.

Its routes answer only requests whose `Host` is loopback, to block DNS rebinding.

## Safety

- Loopback only, on both ends: the MCP server refuses non-loopback hosts. Fetches use a 5 s timeout and no redirects.
- No shell, no `child_process` and no file access in the MCP process.
- Writes touch only in-memory town state and fixed JSON files in `.runtime/town-data/`. They never touch source files or paths taken from input.
- Input is validated by zod twice (tool and route), with length caps, hex colors and bounded numbers. Bodies are capped at 16 KB.
- POST routes need `content-type: application/json`, so a web page cannot call them without a CORS preflight, and the town never approves one.
