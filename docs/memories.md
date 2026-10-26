# Resident memories

Residents keep a small persisted memory of observed meetings, place visits and town events, plus speech they heard. Speech is stored as claimed, untrusted data. It is never parsed as an instruction, and recording it does not call a model. Token and turn limits are unchanged. Residents still have no tools, files or shell.

The book is `.runtime/memories.json`, which is gitignored. A missing, oversized or invalid file loads as an empty book. The first meeting and every fifth meeting are kept as notes. At most four heard lines, eight favorite places and twelve notes are kept per resident.

`GET /api/memories` returns the compact view: relationship counts, favorite places, recent notes and town events, each with `source` of `observed` or `claimed`. `POST /api/memories/forget` with `{ "agent": "Ada" }` erases that resident. An empty JSON object resets every resident and town event. Conversation prompts receive at most five labeled lines, and only when there is something to remember.

Needs-driven intentions may visit a place the resident has been to, or a resident they have met at least twice. Hunger, low energy and meeting someone new still come first. Remembered speech is not used to choose a destination.

The Resident memories panel lists the same compact view. Forget erases one resident. Reset all memories clears the book. Both actions are deliberate.

`get_memories` returns that compact view over MCP. `forget_memories` performs the same erase. A dry run previews it and does not save. The erase cannot be undone.

`node scripts/check-memories.mjs` starts an isolated mock town, watches the SSE `state` event, restarts the process, and reads the same book back through MCP stdio. A missing memory file loads empty. There is no import of older chat logs.
