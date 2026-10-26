# agent-town

A just-for-fun local sandbox where AI agents are characters in a 2D browser town.
They wander between the plaza, cafe, park and library, bump into each other and chat in
speech bubbles. It is for play, not work: agents can only talk and move.

```
+------------------------------------------------------------------------------+
| agent-town  [Pause]  calls 12 · errors 0 · convos 3 · limit 20 turns/agent   |
+-----------------------------------------------+------------------------------+
|  [Cafe]            ( Hi! I'm Pip )            | Lobby                        |
|                        o Pip   o Nova         | o Pip    mock/canned  walking|
|           [Plaza]                             | o Nova   mock/canned chatting|
|  [Library]                    [Park]  o Rook  | o Claude claude-code/sonnet  |
|                                               |          my-claude-sub  idle |
+-----------------------------------------------+------------------------------+
| [All] [Pip] [Claude]                          | Town log                     |
| You -> All: hello town!                       | Nova -> Rook: Fancy meeting..|
| Pip -> You: Hmm, good question! ...           | Rook -> Nova: The park is .. |
| [ Say something...                  ] [Send]  |                              |
+-----------------------------------------------+------------------------------+
```

## Quick start

```
npm install
npm run build
npm start          # http://localhost:4317
```

With no CLIs installed, every agent on the `mock` provider still chats using canned lines.
Agents whose provider is not detected show as `unavailable`.
Copy `town.config.example.json` to `town.config.json` (git-ignored) to customize.

## Using the UI

- **Lobby** lists every agent with provider/model, account label, status
  (idle, walking, chatting, thinking, paused, out-of-turns, unavailable) and turns used.
- **Chat** has an `All` tab (broadcast to every agent) and one tab per agent; click an agent
  in the lobby to open its tab. Replies show in the tab and as speech bubbles.
- **Town log** shows agent-to-agent conversations.
- **Pause/Resume** stops all model calls and movement.
- `POST /api/reload` re-reads the config (add or remove agents).

## Enabling providers

Log in with each official CLI yourself first. agent-town never reads, stores or prints tokens;
it only runs the CLI you already signed in to.

| provider      | requirement                         | how it is called |
|---------------|-------------------------------------|------------------|
| `mock`        | none (default fallback)             | built in |
| `claude-code` | `claude` on PATH, logged in         | `claude -p --output-format text --allowedTools "" --disallowedTools Bash Edit Write ...` prompt on stdin |
| `codex`       | `codex` on PATH, logged in          | `codex exec --sandbox read-only --skip-git-repo-check -` prompt on stdin |
| `grok`        | `grok` on PATH (best effort)        | `grok -p <prompt>` |
| `gemini`      | `gemini` on PATH (best effort)      | `gemini -p ""` prompt on stdin |
| `ollama`      | Ollama running on localhost:11434   | HTTP `POST /api/chat` |

Disable an adapter with `"adapters": { "codex": false }`.

## Safety design

- Agents only produce speech text. No tools, no file writes, no shell, no repo access.
- The system prompt wraps every call with "role-play only: talk and walk, no real work".
- CLIs are spawned with argument arrays and `shell: false` in a fresh empty temp directory.
  On Windows, `.cmd` shims are found with `where` and run through `cmd.exe /d /s /c` with an arg array.
- stderr from CLIs is discarded so nothing sensitive is echoed.
- Per-agent turn limit (`maxTurnsPerAgent`, default 20), global `turnsPerMinute` limit,
  per-call timeout (`callTimeoutMs`, 60s) and output cap (`maxOutputChars`).
- Global Pause stops all model calls. Usage counters are shown in the header.
- The server binds to 127.0.0.1 only.

## Plugin interface

```ts
interface Adapter {
  id: ProviderId;
  detect(): Promise<{ available: boolean; account?: string; models?: string[] }>;
  chat(req: { system: string; messages: ChatMessage[]; maxTokens: number; model?: string; timeoutMs: number }): Promise<string>;
}
```

Add a file in `src/plugins/`, export the adapter and register it in `src/plugins/index.ts`.

## Config reference

| key | default | meaning |
|-----|---------|---------|
| `port` | 4317 | HTTP port |
| `maxTurnsPerAgent` | 20 | model calls per agent before `out-of-turns` |
| `turnsPerMinute` | 30 | global model calls per minute |
| `callTimeoutMs` | 60000 | per-call timeout |
| `maxOutputChars` | 280 | reply length cap |
| `adapters` | all true | enable or disable providers |
| `agents[]` | | `name`, `personality`, `color`, `provider`, optional `model`, `account` |

## Protocol

- `GET /events` (SSE): `state`, `say`, `log` events.
- `GET /api/state`: snapshot plus the last 50 log lines.
- `POST /api/chat` `{ to: "<name>" | "*", text }`, `POST /api/pause` `{ paused? }`, `POST /api/reload`.
