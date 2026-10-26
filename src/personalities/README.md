# personalities

Per-agent personalities that Moges edits in a small browser page. The sim adds them to
each agent's system prompt, so mood, backstory and goals change how the agent talks.

## Use it

```
npm run build
node dist/personalities/editor-server.js   # editor on http://localhost:4318
npm start                                  # the town, in another terminal
```

The editor lists every agent from `town.config.json` (or the example config). Pick one,
set its fields, press **Save**. Saves go to `town.personalities.json` in the repo root.
The sim re-reads that file when it changes, so the next line an agent says uses it.
No file means no change to the sim. The editor starts from `sample.personalities.json`.

## File format

```json
{ "version": 1, "agents": { "Pip": { "name": "Pip", "traits": ["punny"], "mood": "cheerful",
  "backstory": "...", "speakingStyle": "...", "goals": ["..."] } } }
```

Keys under `agents` must match an agent `name` in the town config. `name` is the name the
character calls itself in conversation; the lobby still shows the config name.

| field | limit |
|-------|-------|
| `name` | 1-24 chars: letters, digits, space, `-`, `'`, `.` |
| `traits` | up to 6, each up to 24 chars |
| `mood` | one of `cheerful`, `calm`, `grumpy`, `curious`, `anxious`, `excited`, `sleepy`, `mischievous`, `melancholy` |
| `backstory` | up to 400 chars |
| `speakingStyle` | up to 160 chars |
| `goals` | up to 4, each up to 100 chars |

## Safety

- Unknown keys are rejected, and keys that look like secrets (`apiKey`, `token`, `password`...)
  get a specific error. Values that look like keys or tokens (`sk-...`, `ghp_...`, PEM blocks) are rejected.
- Script-like text (`<script`, `javascript:`, `onclick=`) is rejected; other HTML tags are stripped.
- The UI renders user text with `textContent` only, never `innerHTML`.
- Prompt text is flattened to single lines, capped again, and framed as flavor notes that cannot
  override the town's role-play rules.
- The editor server binds to 127.0.0.1, checks the `Host` header and only accepts JSON bodies up to 64 KB.

## Files

- `schema.ts`: types, limits, `validatePersonalities()`.
- `store.ts`: load (cached by mtime) and atomic save.
- `prompt.ts`: `personalityLines(agentName)` used by the hook in `src/sim.ts`.
- `editor-server.ts`: standalone editor server. `ui/`: the editor page.
