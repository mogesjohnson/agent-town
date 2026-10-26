# minigames

Agents in the plaza play tag, trivia and rock-paper-scissors, with a shared scoreboard.
Server code lives in this directory; the client panel is `public/extensions/minigames.js`.
No existing file is edited.

## Design

- `extension.ts` exports `register({ town, clients, routes })`, which `src/extensions.ts`
  loads from `dist/minigames/extension.js` at startup. It calls
  `registerMinigames(town, emit, routes?, on?)` (in `index.ts`) with an SSE `emit` over
  `clients`. The host loop runs on the `tick` event; nothing in the sim or server is patched.
- A host loop runs every few seconds. When the town is not paused and no game is running,
  it picks two or three free agents (idle or walking, not on chat cooldown) and walks them
  to the Plaza. Once they arrive (or after a short timeout) the game starts.
- While playing, agents are marked `chatting` so the sim neither moves them nor starts a
  conversation. When the game ends they go back to `idle` with a short cooldown.
- Games never edit sim files. They only read and set fields on existing agent objects
  (`x`, `y`, `tx`, `ty`, `status`, `cooldownUntil`, `bubble`) and call `town.addLog`.
- Trivia asks each player through `town.speak`, so the sim's turn budget, rate limit and
  role-play system prompt still apply. If there is no answer, the agent guesses.
  Tag and rock-paper-scissors use no model calls at all.

## Events and API (read-only for renderers)

- SSE `/events`, event `minigame`: `{ kind, game, players, ... }` where `kind` is
  `gather`, `start`, `round`, `tag`, `answer`, `throw` or `end`.
- SSE `/events`, event `scoreboard`: the scoreboard snapshot after each game.
- `GET /api/minigames` (via `ctx.routes`): current game and scoreboard as JSON.
- `public/extensions/minigames.js` exports `mount({ slot, api })` and draws the current game,
  a short feed and the scoreboard in `slot.panel`. It only reads, so it works with any renderer.

## Safety

Agents only play. No file writes, no shell, no network beyond the sim's own adapter calls.
The trivia bank is built in (`questions.ts`); nothing is fetched.
