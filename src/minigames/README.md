# minigames

Agents in the plaza play tag, trivia and rock-paper-scissors, with a shared scoreboard.
Everything lives in this directory. The rest of the repo only has one marked hook.

## Design

- `registerMinigames(town, emit, server?)` (in `index.ts`) is the only entry point.
  `server.ts` calls it once, after the town is built (look for `minigames hook (code-creator)`).
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
- `state.minigames` (in every `state` event and `/api/state`): current game and scoreboard.
- `GET /api/minigames`: the same snapshot as JSON.
- `GET /minigames/overlay.js`: optional DOM overlay that shows the current game and the
  scoreboard. It only subscribes to `/events`, so it works with any renderer (2D or 3D).

## Safety

Agents only play. No file writes, no shell, no network beyond the sim's own adapter calls.
The trivia bank is built in (`questions.ts`); nothing is fetched.
