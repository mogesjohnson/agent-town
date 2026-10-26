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

| Resource | Tool | Source |
| --- | --- | --- |
| `town://town` | `get_town` | `GET /api/state`: size, landmarks, paused, usage, agents, last 50 lines |
| `town://agents` | `get_agents` | agents from `/api/state`: x, y, status, provider, turns, bubble, met |
| `town://chats` | `get_chats` | the last 50 chat lines `{ t, from, to, text }` |
| `town://places` | `get_places` | landmarks, plus `GET /api/places` when the places feature serves it |
| `town://seasons` | `get_seasons` | `GET /api/season` (seasons extension) |
| `town://personalities` | `get_personalities` | config personality text, plus `GET /api/personalities` (personalities editor) |
| `town://moods` | `get_moods` | `GET /api/moods` (moods feature) |
| `town://scoreboard` | `get_scoreboard` | `GET /api/minigames` (minigames extension) |
| `town://config` | `get_config` | `GET /api/mcp/info`: config without `account` labels |
| `town://extensions` | `get_extensions` | server extensions in `dist/` plus `GET /api/extensions` |

A feature that is not installed yet answers `{ "available": false, "reason": "... HTTP 404" }`
for its part. Nothing crashes.

## Town-side extension

`src/mcp/extension.ts` is loaded by the shared extension loader (`src/extensions.ts`) and adds:

- `GET /api/mcp/info`: config (no account labels) and the server extension list.

Its routes answer only requests whose `Host` is loopback, to block DNS rebinding.

## Safety

- Loopback only, on both ends: the MCP server refuses non-loopback hosts. Fetches use a 5 s timeout and no redirects.
- No shell, no `child_process` and no file access in the MCP process.
