# Town newspaper

Every in-game morning one agent "writes" a short, funny paper about the previous in-game day:
a headline, 3 to 5 stories, a gossip column and a weather blurb. It is an extension
(see the root README, "Extensions"), so no shared file is edited.

- Server: `src/newspaper/extension.ts` exports `register(ctx)`.
- Client: `public/extensions/newspaper.js` exports `mount({ slot, api })` and renders into `slot.panel`.

## What it reads

Only the shared event bus (`ctx.on`), by event name. Nothing is imported from other feature branches.

| Event | Used for |
| --- | --- |
| `tick` | advances the in-game clock while the town is not paused |
| `say` | conversation lines `{ from, to, text }` (lines from `You` count as visitor messages) |
| `convo` | meetings `{ a, b }` |
| `minigame` | only `kind: "end"` results (`summary`, `winners`), if the minigames branch is loaded |
| `season`, `place`, `places`, `weather`, `festival`, `event` | one short line each, if any branch emits them |

Unknown or missing event kinds are ignored, so the paper works on the base town alone.

## In-game day

The base town has no in-game clock yet. A day is `dayMinutes` of unpaused real time (default 10).
If a branch later emits a `day` or `clock` event with a numeric `day`, that number is used instead.
At each rollover the finished day is written up once.

## Writer and cost caps

The writer is the agent who talked most that day (or "The Town Crier"). The text comes from the
model in config, by default Claude Haiku through the existing `claude-code` adapter, which runs the
official `claude` CLI with tools disabled, using your own local Claude login.

- At most one model call per in-game day, and none for a day with no events.
- Hard caps: `maxCallsPerSession` (per server run) and `maxCallsPerRealDay` (counted in the data dir).
- The event digest sent to the model is cut to `maxInputChars`.
- The model must reply with JSON; it is parsed and validated. If the CLI is missing, the call fails,
  a cap is hit, or the JSON is invalid, a deterministic template paper is built from the events.
  (The built-in `mock` adapter only returns canned chatter, so the template is the fallback.)

## Config

Optional `newspaper` key in `town.config.json`. Every field has a default; shared config types are
not changed.

```json
"newspaper": {
  "enabled": true, "provider": "claude-code", "model": "haiku", "dayMinutes": 10,
  "maxCallsPerSession": 12, "maxCallsPerRealDay": 24, "maxInputChars": 4000,
  "timeoutMs": 90000, "dataDir": ".runtime/newspaper"
}
```

Set `"provider": "mock"` to never call a model.

## Storage

Issues are saved as `issue-0001.json` and `issue-0001.md` in `dataDir`. The default
`.runtime/newspaper` is already git-ignored, so generated papers are never committed.

## API

- `GET /api/newspaper/today`: the latest issue, or `null`.
- `GET /api/newspaper/issues`: `[{ issue, day, date, headline }]`, newest first.
- `GET /api/newspaper/issue?n=3`: one issue, or `null`.
