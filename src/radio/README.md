# Town Radio

The offline DJ broadcasts town news, a resident chat highlight, shout-outs, an imaginary
song dedication and seasonal weather. It uses deterministic templates and **zero model calls
or tokens**. No music files, real song lyrics, audio downloads or external services are used.

`src/radio/extension.ts` and `public/extensions/radio.js` are discovered by the existing
extension loaders. `GET /api/radio` returns enabled/mode/calls and the latest 12 segments;
SSE `radio` events push each new segment. Each has at most four lines of 160 characters.
Visitor messages are excluded from news highlights.

## Configuration and clock

Add a `radio` object to `town.config.json` to override these defaults:

| Key | Default | Behavior |
| --- | --- | --- |
| `enabled` | `true` | Disable broadcasts and hide the ticker when false. |
| `segmentEveryHours` | `3` | In-game hours between broadcasts. |
| `realSecondsPerGameHour` | `60` | Clock speed, starting at day 1, 08:00. |

The first running tick broadcasts immediately. The radio clock advances only while the game
is unpaused. It schedules on the existing simulation tick and creates no additional timers.
History and clock reset when the server restarts. Config changes require a restart.

`provider`, `model`, `maxCallsPerDay`, `afterCap` and `tts` are retained as reserved config fields
from the original design. They do not start inference or enable speech automatically. An
optional model-backed DJ remains future work; this station always uses offline templates.

## Ticker and voice

The fixed strip works with every renderer. It scrolls DJ lines and recent resident speech;
the Pause ticker button stops only scrolling. Game pause also stops scrolling and voice.
Reduced-motion preferences show a static latest line. A separate polite live region announces
new DJ segments once, and all dynamic text is rendered as literal text.

Voice is muted until **Enable voice** is clicked. It uses the browser's built-in
`speechSynthesis` when available; Mute voice cancels playback. It reads new DJ segments only.

Check with `npm run build` and `node --test dist/radio/extension.test.js`.
