# moods

Every agent has four needs, `hunger`, `energy`, `social` and `happiness`, each 0-100 where
**100 means fully satisfied** (so "hunger 20" means very hungry). Needs change with in-game time
and events, and the agent's effective mood is added to its prompt.

## Model

- **Time** (`MOOD_CONFIG` in `model.ts`): one sim tick (400 ms) is 0.25 in-game minutes.
  Hunger, energy and social drain each minute. Standing in the `Cafe` refills hunger; idling in the
  `Park` refills energy. A conversation gives both agents +20 social and +4 happiness; each line said gives +2 social.
- **Happiness** drifts toward a resting value set by the personality baseline (cheerful 75 ... melancholy 40,
  default 60) and drops while any other need is below 25.
- **Effective mood**, in priority order: (1) a manual override from `POST /api/moods/:agent` until it
  expires; (2) a needs state when any need is below 25, lowest need wins: energy `tired` 😴,
  hunger `hungry` 🍔, social `lonely` 🥺, happiness `sad` 😢; (3) the baseline.
- **Baseline** is the `mood` from `src/personalities/` (PR #9), read live via its `getPersonality(cfg.name)`.
  The module is loaded with a dynamic import, so without it (or with no entry for the agent) the baseline is `calm`.
- **Behavior**: an idle agent that is hungry walks to the Cafe, tired walks to the Park (the town has no homes yet),
  lonely walks to the nearest other agent. The prompt hook adds, before "You are talking with":
  `Right now you feel: tired (baseline: cheerful). Needs: hunger 40, energy 18, social 70, happiness 55. You feel exhausted and want to head home to rest.`
  It never writes a `Mood:` line, because the personalities hook already does.

## API

- `GET /api/moods` -> `{ "agents": [ { "agent", "baseline", "mood", "emoji", "needs": { "hunger", "energy", "social", "happiness" }, "override": null | { "mood", "until" } } ] }`
- `POST /api/moods/:agent` with `{ "mood"?: string | null, "needs"?: { partial, numbers 0-100 }, "durationMinutes"?: number }`
  -> 200 with that agent's object. Name matches case-insensitively. 404 `{ "error": "unknown agent" }`,
  400 `{ "error": "..." }` for bad JSON or values. `mood` is a lowercase word (`a-z`, `-`, up to 24 chars);
  `null` clears the override. `durationMinutes` is in-game minutes (default 30, max 1440).
  `until` is an ISO string in real time: `now + durationMinutes x 1.6 s` (0.25 game minutes per 400 ms tick).
- SSE: `event: moods` with the `GET` body, every 5 ticks and after each POST.

Note: `Routes` in `src/extensions.ts` only matches exact paths, so `register()` wraps `routes.find` on
its instance to add a fallback for `POST /api/moods/<name>`. A built-in prefix or `:param` route would replace that.
