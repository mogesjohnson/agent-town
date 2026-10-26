# places

Ten small shops and spots around town plus pretend jobs for the agents who work there.
Everything lives in `src/places/` and `public/extensions/places.js`. It plugs in through the
extension loader from #15, so **no existing file is edited and there is no hook**.

## Data format (`src/places/data/<id>.json`)

| field | meaning |
|-------|---------|
| `id`, `name`, `type` | `bakery`, `Sunrise Bakery`, `shop` |
| `plot` `{x,y}`, `footprint` `{w,h}` | map tiles on the 40x25 grid, origin top-left |
| `anchor` | optional: an existing sim landmark (`Cafe`, `Park`, `Library`); plot must match it |
| `sign`, `color` | sign label and `#rrggbb` |
| `hours` `{open,close}` | town-clock hours, `0 <= open < close <= 24` |
| `vibe`, `items[]`, `topics[]` | flavor text fed to the prompt (plain text, max 8 each) |
| `roles[]` | `{ id, title, keywords[] }`; keywords match agent personalities |

`catalog.ts` validates every file and skips bad ones, duplicates, plots off the map, and
plots overlapping a landmark (unless anchored) or another place.

## Server (`extension.ts`, loaded from `dist/places/extension.js`)

`register(ctx)` uses the #15 contract:

- `town.state()` gains `places: { clock, list: PlaceView[] }`. `PlaceView` is renderer-agnostic:
  `id, name, type, sign, color, anchor?, x, y, w, h, enabled, open, hours, workers[]`.
  The 2D client and Codex's 3D renderer can both draw from it; this feature draws in neither.
- `on("tick")`: advances the town clock (one game hour per real minute while unpaused, from 08:00),
  re-hires when agents or toggles change, and runs `workTick`.
- `promptHooks`: appends the job (or "off duty"), plus vibe, items and topics of the agent's place
  or of the open place it is visiting. Lines are framed as flavor that never overrides the rules.
- `routes`: `GET /api/places` (views plus vibe, items, topics) and
  `POST /api/places/toggle` `{ id, enabled? }` (omitting `enabled` flips it; 404 for an unknown id).

## Jobs (`jobs.ts`)

Role-play only: no tools, files, shell or real work. Only agents whose provider is available are
hired, keyword matches first, and at most half the town works so someone is left to visit.
During opening hours an on-duty worker walks into its place, gets status `working` (the sim then
leaves it be) and greets each nearby visitor with a canned line (no model call, 90 s cooldown per
pair). `working` is added to `ctx.chattyStatuses` (#15), so staff also have model chats with
visitors using the job prompt; the sim restores `working` after the chat. Shift end, toggle-off
or losing the job sets `idle` again, only if it is still `working`.
Only `idle`, `walking` or our own `working` agents are hired, walked or greeted; any other status
(e.g. `playing` from another extension) is left alone.

## Moving landmarks (`anchors.ts`)

Anchored places follow their landmark. The map editor (#22) rewrites the sim's `LANDMARKS`
array in place on every edit (`{ name: building.name ?? building.id, x, y, w, h, color }`).
Its `map:changed` event goes only to SSE clients, not to the `on()` bus, so each tick (and each
`state()`) compares `LANDMARKS` with the anchors, matching names case-insensitively. On a change
the place takes the new `plot`/`footprint`, and open on-duty staff outside it walk there (our
`working` status is lifted first). Nothing is polled over HTTP. Without the map editor `LANDMARKS`
never changes, so this does nothing; a removed landmark leaves its place at the last spot.

## State (`store.ts`)

Enabled ids are saved atomically to `.runtime/places.json` (git-ignored). Default on: bakery,
café, diner, flower shop, library, park.

## Client (`public/extensions/places.js`)

`mount({ slot, api })` fills `slot.panel` with one toggle per place (open state, hours, staff)
and puts sign boards for enabled places in `slot.overlay`, scaled to the `#town` canvas.
