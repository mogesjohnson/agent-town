# Town Radio

A DJ agent hosts a tiny radio show for agent-town. Every few in-game hours it reads a short
segment: town news from the recent chat, shout-outs to agents by name, a made-up song
dedication, and the weather when the seasons feature is present. A scrolling ticker shows the
DJ lines and recent speech-bubble highlights over any renderer (2D canvas or 3D).

Everything lives here and in `public/extensions/radio.js`. No existing file is edited.

## How it plugs in

- Server: `src/radio/extension.ts` exports `register(ctx)`. The shared loader in
  `src/extensions.ts` (`loadExtensions`) imports `dist/radio/extension.js` and calls it.
- Client: `public/extensions/radio.js` is plain JS. The extensions client loader picks it
  up from `public/extensions/`; it also works as `<script src="/extensions/radio.js">`.
- Data out: an SSE `radio` event through `ctx.emit` (when the loader passes it), and
  `GET /api/radio` through `ctx.routes` (recent segments as JSON; the ticker polls it).
- Data in: `say` events through `ctx.on("say")`, plus `ctx.town.log` when a town is passed.

`register` reads only what it finds on `ctx`: `town`, `emit`, `config`, `adapters`, `clock`,
`routes` and `on`. Anything missing is skipped or replaced by a built-in default.

## Config

The extension system has no config mechanism yet, so defaults live in `src/radio/types.ts`.
If the loaded town config has a `radio` object (`ctx.config.radio`), its fields override them:

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Turn the whole radio off. |
| `provider` | `"claude-code"` | Adapter id from `src/plugins/` for the DJ. `"mock"` means templates only. |
| `model` | `"haiku"` | Model passed to the adapter. Haiku keeps it cheap. |
| `segmentEveryHours` | `3` | In-game hours between segments. |
| `maxCallsPerDay` | `4` | DJ (LLM) calls per in-game day. |
| `afterCap` | `"template"` | Once the cap is hit: `"template"` or `"skip"`. |
| `realSecondsPerGameHour` | `60` | Clock speed when the town has no clock of its own. |
| `tts` | `false` | Initial TTS state in the ticker. The user can still toggle it. |

## In-game clock

The town has no clock today. If `ctx.clock.now()` returns `{ day, hour }`, the radio uses it.
Otherwise it runs its own: one in-game hour per `realSecondsPerGameHour`, starting at day 1,
08:00 when the server starts.

## Call cap and fallback

- Each segment makes at most one adapter call, and at most `maxCallsPerDay` per in-game day.
- The provider is detected once at start. If it is unavailable, disabled, errors, times out
  or returns nothing usable, the segment comes from the template generator (`mock.ts`).
- The template generator is deterministic per day and hour, works offline, and builds its
  lines from real events: who talked most, who met whom, and a quote from the log.
- The DJ prompt asks for invented song titles only and never real lyrics. Lines are capped
  at four and 160 characters each.

## Ticker and TTS

- A fixed strip at the bottom of the page. It ignores pointer events except its own two
  buttons, so it never blocks the canvas or the 3D view.
- The scrolling text is `aria-hidden`; a visually hidden `aria-live="polite"` region gets
  each new DJ line once, so screen readers are not flooded.
- With `prefers-reduced-motion: reduce` the strip does not scroll; it shows the latest line.
  The pause button stops scrolling at any time.
- Text-to-speech uses the browser's built-in `speechSynthesis`, only when it exists. It is
  muted by default; the speaker button unmutes it. No audio files are used.
