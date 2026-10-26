# replay

Record a town day, play it back in the browser, pick the fun moments and turn them into a
short captioned clip. Everything lives in `src/replay/` and `scripts/replay/`. The rest of the
repo has one marked, opt-in hook in `src/server.ts` (look for `replay hook (code-executor)`).

Replay only reads the sim's event stream (`state`, `say`, `minigame`, `scoreboard`), never
renderer internals, so it works the same with the 2D canvas and the Three.js renderer.

## Record

- Live server: `AGENT_TOWN_RECORD=replays/day.ndjson npm start`. Without the variable the hook
  does nothing. The recorder sits in the SSE client list like a browser tab would.
- Headless, mock agents only, no server or CLIs:
  `npm run build && node scripts/replay/record-day.mjs --out replays/day.ndjson --seed 7 --minutes 6`.
  The sim runs on a virtual clock (default 20x) with a seeded `Math.random`.

## File format (NDJSON, version 1)

Line 1 is a header, every other line is one event; `t` is milliseconds since the start.

```
{"type":"header","format":"agent-town-replay","version":1,"seed":7,"startedAt":"2026-...Z","source":"headless","world":{"w":40,"h":25,"landmarks":[...]}}
{"t":0,"type":"frame","paused":false,"agents":[{"name":"Pip","color":"#e76f51","provider":"mock","x":3,"y":4,"status":"walking","turns":0}]}
{"t":5200,"type":"say","from":"Pip","to":"Nova","text":"Oh hey there!"}
{"t":9100,"type":"minigame","kind":"end","game":"tag","players":["Pip","Rook"],"winner":"Rook"}
```

Fields are whitelisted, never copied wholesale: account labels, model names, config, env
values and anything else not listed above are dropped. Text is scrubbed for token-looking
strings (API keys, bearer tokens, long hex or base64) before it is written. Frames are
stored only when something visible changed.

## Play

Open `src/replay/player.html` in a browser (it works from `file://`) and pick or drop a
replay file. Space plays or pauses, the slider seeks, and the speed menu goes from 0.5x to 32x.
Highlights show as markers on the timeline; click one to jump there.

The player draws through a small view adapter (`view.js`):

```js
createView(host) -> { setWorld(world), draw(frame, bubbles), destroy() }
```

The default is a simple 2D canvas. A 3D view only has to implement the same three methods,
for example by feeding frame positions to the Three.js renderer. Assign it to
`window.AgentTownReplayView` before `player.js` loads.

## Highlights

`highlights.js` scores moments from the events alone:

| moment | score |
|---|---|
| first meeting of two agents | 6 |
| chat burst (4+ lines within 15 s) | 3 + lines |
| mini-game win | 8 |
| human visitor talking to the town | 4 |

`node scripts/replay/highlights.mjs replays/day.ndjson --top 5` prints them with captions.

## Clip

`node scripts/replay/clip.mjs replays/day.ndjson --out replays/day.mp4 [--gif] [--top 4]`
plays the top highlights in headless Chrome with a caption pill and title cards (the
[demo-reel](https://github.com/mogesjohnson/demo-reel) approach), records with Playwright and
converts with ffmpeg. It looks for `playwright-core` (or `playwright`) and a Chrome or Chromium
binary (`CHROME_PATH`); it never downloads one. If either Playwright or ffmpeg is missing it
says so and exits 2, leaving any `.webm` it managed to record.
