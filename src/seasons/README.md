# Seasons

Seasonal town events: Halloween, a winter snow day, a spring festival, a summer night market
and New Year's Eve. An event changes what agents chat about (a topic hint in their prompt) and
how the town looks (plain `visuals` data). This folder has no drawing code; each renderer, the
2D canvas or the Three.js view, decides how to draw the data.

## Event files

One JSON file per event in `seasons/` at the repo root. Bad files are skipped with a
`[seasons]` warning in the server log; they never stop the town.

```json
{
  "id": "winter-snow-day",
  "name": "Winter Snow Day",
  "windows": [{ "from": "12-15", "to": "02-15" }],
  "priority": 10,
  "topicHint": "It is a snowy winter day. Talk about snowball fights ...",
  "visuals": {
    "decor": ["snowman", "icicles", "scarf"],
    "weather": "snow",
    "tint": "#dceeff",
    "ambient": { "timeOfDay": "day", "brightness": 0.85 }
  }
}
```

| Field | Rule |
|---|---|
| `id` | lowercase letters, digits and dashes; unique |
| `name` | 1 to 60 characters |
| `windows` | one or more inclusive `"MM-DD"` ranges in local time; `from` after `to` wraps the year end |
| `priority` | number; higher wins when windows overlap |
| `topicHint` | 1 to 300 characters, appended to agent prompts as `Town event: <name>. <topicHint>` |
| `visuals` | see below |

## Which event is active

1. A manual override, if one is set, wins.
2. Otherwise the events whose window contains today. Ties are broken by higher `priority`,
   then the shorter matching window (the more specific event), then `id` from A to Z.
3. Otherwise no event, and renderers get the neutral scene.

So on 31 December, New Year's Eve (priority 30) beats the snow day (priority 10).

## Data contract for renderers

`GET /api/season` returns:

```json
{
  "source": "date",
  "active": { "id": "halloween", "name": "Halloween Night", "priority": 20 },
  "topicHint": "Town event: Halloween Night. ...",
  "visuals": {
    "eventId": "halloween", "eventName": "Halloween Night",
    "decor": ["pumpkin", "bat", "cobweb", "lantern"],
    "weather": "fog", "tint": "#ff7518",
    "ambient": { "timeOfDay": "dusk", "brightness": 0.55 }
  },
  "events": [{ "id": "halloween", "name": "Halloween Night", "priority": 20, "windows": [...] }]
}
```

- `visuals.decor`: decoration ids. Draw the ones you know and skip the rest; an unknown id is
  never an error. Ids in use: `pumpkin`, `bat`, `cobweb`, `lantern`, `snowman`, `icicles`,
  `scarf`, `flower-garland`, `kite`, `bunting`, `market-stall`, `string-lights`,
  `paper-lantern`, `fireworks`, `confetti`.
- `visuals.weather`: one of `clear`, `rain`, `snow`, `fog`, `wind`, `storm`.
- `visuals.tint`: `#rrggbb` colour wash for the scene (a canvas overlay, or a light or fog
  colour in 3D). Apply it lightly.
- `visuals.ambient` (optional): `timeOfDay` is `day`, `dusk` or `night`; `brightness` is 0 to 1.
- With no active event, `eventId` is `null` and the scene is neutral: no decor, `clear`,
  `#ffffff`, day, brightness 1.

Renderers should fetch `/api/season` on load. After a manual trigger the server also sends the
usual `state` event over `/events`, which is a good moment to fetch again.

## Manual trigger

```sh
curl -X POST localhost:4317/api/season -H 'content-type: application/json' -d '{"id":"halloween"}'
curl -X POST localhost:4317/api/season/clear                  # back to the date pick
curl 'localhost:4317/api/season?date=2026-12-31'               # preview a day's pick
```

An unknown id returns 404 and changes nothing. The override lasts until it is cleared or the
server restarts.

## In code

```ts
import { pickEvent, triggerEvent, clearEvent, getActiveEvent, getTopicHint, getVisuals } from "./seasons/index.js";
```

`extension.ts` exports `register(ctx)` for the shared extension loader in `src/extensions.ts`
(branch `grok/extensions`). It adds the three routes to `ctx.routes` and pushes a prompt hook
onto `ctx.promptHooks` that appends `getTopicHint()`. No other file has a seasons hook; the
routes and hint go live once `server.ts` calls `loadExtensions()` and applies `routes` and
`promptHooks`, which is `grok/extensions`' job.
