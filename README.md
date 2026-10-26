# agent-town

The **Weather** control follows the current season by default; select clear,
rain, snow, fog, wind or storm for a local preview. Water ripples and foliage
sway animate with the weather. Pause freezes decorative movement, and reduced
motion disables particles, sway and ripple animation. No model calls are used.
World editors can tag rooted objects with `userData.atmosphere = "vegetation"`
or `"water"`; atmosphere discovers added/removed objects automatically.

**Enable sound** opts into quiet synthesized wind, rain, daytime birds and
nighttime crickets. Third-person walking adds footsteps; standing still or
walking into a wall does not. Sound mutes while paused, hidden, or at zero
volume. It starts muted on every page load and uses no recordings or model calls.

The town uses **Natural 3D** with perspective exploration. Choose
**Third person · You**, use WASD or arrows,
Shift to run, drag to look and scroll to zoom. Keyboard movement stops while
typing or paused. **Town overview** returns to a distant orbit camera.

The previous voxel renderer and Styles tab are retired. Old `style` and
`renderer` URL values do not select another style. A technical rendering failure
automatically uses the canvas fallback so chat and controls remain available.

The first `npm start` downloads about 35 MB of
checksum-pinned CC0 model/texture data during its build; subsequent starts use
the local cache. No executable assets or runtime CDN requests are used. This
is a more detailed natural style, not a claim of photorealistic graphics.

The map editor now updates 3D tiles and buildings. Enable **paint on town** to
paint through the perspective camera, or edit in the minimap. Added, moved and
removed buildings and custom places appear in the world. Houses, the cross
paths, trees and the pond are part of the saved world, not a separate scenic
layer. Radio now runs as an offline station with a scrolling ticker and
optional browser voice.

A just-for-fun local sandbox where AI agents are characters in a natural 3D browser town (with an automatic technical fallback).
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

## Natural 3D town

The Three.js view has a 40 by 30 visual ground grid. The 40 by 25 world stores
the plaza, cafe, park, library, four cottages, paths, trees and a pond.
Buildings cannot overlap each other, trees or water. Edits and the undo
log are saved in `.runtime/world.json` and restored on the next start.
The natural view builds those records with stable ids. See
[docs/world-objects.md](docs/world-objects.md). Weather and sound stay separate.
All original geometry is CC0; see [CREDITS.md](CREDITS.md).

For a fresh checkout, copy `town.config.preview.json` to `town.config.json`
before starting for five named residents using only canned mock speech.
This avoids invoking the existing CLI adapters, whose safety restrictions have
open findings on PRs #2, #3 and #5. Real providers were not exercised in renderer checks.

- Drag to orbit, right-drag to pan, scroll/pinch to zoom within camera bounds.
- The Light selector pins noon, dusk or night; Day cycle lasts four minutes.
- Pause freezes visual motion and the light cycle; upstream in-flight calls can finish.
- `/?time=noon` and `/?time=night` pin lighting for screenshots.
- Failed WebGL/imports automatically use the canvas fallback.
- `/preview.html` shows just the village for visual inspection.
- Resize is automatic; the perspective view renders smoothly at the viewport resolution.
- At most two visible speech bubbles type text safely; names and thinking dots follow heads.

Build copies pinned Three.js modules locally. No runtime CDN or model downloads.

Browser regression check (with the server running and an existing Playwright
installation): `node scripts/check-town.mjs`. Set `PLAYWRIGHT_MODULE` to its module
path if it is outside this checkout; `TOWN_URL` overrides the localhost URL and
`BROWSER_CHANNEL` selects an installed browser (default: msedge). The script
injects deterministic SSE and intercepts chat/pause requests, so it invokes no providers.

## Using the UI

- **Lobby** lists every agent with provider/model, account label, status
  (idle, walking, chatting, thinking, paused, out-of-turns, unavailable) and turns used.
- **Chat** has an `All` tab (broadcast to every agent) and one tab per agent; click an agent
  in the lobby to open its tab. Replies show in the tab and as speech bubbles.
- **Town log** shows agent-to-agent conversations.
- Chat tabs and the town log retain the latest 200 lines each. Replayed SSE messages
  after reconnect are shown once; matching text spoken at a different time still appears.
- **Pause/Resume** stops all model calls and movement.
- `POST /api/reload` re-reads the config (add or remove agents).

Check reconnects and history limits with `node scripts/check-chat.mjs` using an existing
Playwright installation (`PLAYWRIGHT_MODULE` if needed). The check starts and stops its
own fixture server and uses synthetic messages, with no provider calls.

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

## Extensions

New features never edit `src/server.ts` or `public/index.html`. Add `src/<feature>/extension.ts`
exporting `register({ town, clients, config, routes, on, promptHooks })`, and/or
`public/extensions/<feature>.js` exporting `mount({ slot: { panel, overlay }, api: { get, post, on } })`.
See `src/hello/extension.ts` and `public/extensions/hello.js`.

## Protocol

- `GET /events` (SSE): `state`, `say`, `log` events.
- `GET /api/state`: snapshot plus the last 50 log lines.
- `POST /api/chat` `{ to: "<name>" | "*", text }`, `POST /api/pause` `{ paused? }`, `POST /api/reload`.

### Token usage

The Token usage panel reports this server session's town agent calls, including input,
output, the latest turn and the average tokens per completed turn. Provider-reported
counts and rough text estimates are separate. Ollama supplies reported counts; CLI
text replies use about one token per four Unicode characters, excluding hidden reasoning,
tool context and framing. Mock residents consume zero model tokens. Failed calls have
unknown consumption. Counts reset after a server restart or agent replacement.
Extension-owned calls (for example newspaper writing) are excluded. These counts do not
show subscription allowance, a provider invoice or a dollar price.
