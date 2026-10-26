# replay

Record a town day, play it back in the browser, pick the fun moments and turn them into a
short captioned clip. Everything lives in `src/replay/`, `scripts/replay/` and
`public/extensions/replay.js`; it plugs in through the extension loader (`src/extensions.ts`),
so no existing file is edited. Replay reads only sim events (`state`, `say`, `minigame`,
`scoreboard`), never renderer internals, so it works the same with the 2D and 3D renderers.

## Record

- Live server: `AGENT_TOWN_RECORD=replays/day.ndjson npm start`. `extension.ts` subscribes to
  the extension bus and writes the file; Ctrl-C flushes it. Without the variable nothing is
  recorded and the side-panel link stays hidden (add `?replay` to the town URL to show it).
- Headless, mock agents only: `npm run build && node scripts/replay/record-day.mjs --out
  replays/day.ndjson --seed 7 --minutes 6`. It runs on a virtual clock (20x) with a seeded
  `Math.random`, so a day takes about 20 s. Timing is async, so seeds are close, not exact.

## File format (NDJSON, version 1)

Line 1 is a header; each other line is one event with `t` in ms since the start.

```
{"type":"header","format":"agent-town-replay","version":1,"seed":7,"startedAt":"...","source":"headless","world":{...}}
{"t":0,"type":"frame","paused":false,"agents":[{"name":"Pip","color":"#e76f51","provider":"mock","x":3,"y":4,"status":"walking","turns":0}]}
{"t":5200,"type":"say","from":"Pip","to":"Nova","text":"Oh hey there!"}
{"t":9100,"type":"minigame","kind":"end","game":"tag","players":["Pip","Rook"],"winner":"Rook"}
```

Fields are whitelisted: account labels, models, config and env values are never written, and
text is scrubbed of token-looking strings (API keys, bearer tokens, long hex or base64).

## Play

Open `src/replay/player.html` (works from `file://`, or `/replay/player.html` on the server)
and pick or drop a file, or pass `?src=<url>`. Space plays or pauses, the slider seeks, speed
goes from 0.5x to 32x, and highlight markers jump to their moment. `window.replay` exposes
`load, seek, play, pause, card, setCaption` for automation.

`view.js` is the default 2D canvas view. Another view (for example Three.js) implements
`(host) => ({ setWorld(world), draw(frame), destroy() })` and is assigned to
`window.AgentTownReplayView` before `player.js` loads.

## Highlights and clips

| moment | score |
|---|---|
| first meeting of two agents | 6, +1 if it opens with a question |
| chat burst (4+ lines in 10 s) | 2 + lines / 2, max 9 |
| mini-game win | 8 |
| visitor talking to the town | 4 + replies, max 10 |

Repeats of one kind are damped so the picks vary. `node scripts/replay/highlights.mjs
<file> --top 5` prints them. `node scripts/replay/clip.mjs <file> --out day.mp4 [--gif]
[--top 4] [--speed 2]` renders them in headless Chrome with captions and title cards, frame
by frame, then encodes with ffmpeg. It needs `playwright-core` (or `--playwright <dir>`), a
Chrome (`CHROME_PATH`) and ffmpeg, downloads nothing, and exits 2 if one is missing.
