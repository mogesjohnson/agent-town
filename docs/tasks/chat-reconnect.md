# Reliable bounded chat history

- Replayed SSE log snapshots and duplicate live say events must not duplicate visible messages.
- Identify messages by timestamp, sender, recipient and text; bound the recent-event cache.
- Cap the rendered town log and every chat tab to the latest 200 lines.
- Preserve direct-agent and All chat routing and keep the server API unchanged.
- Verify with a real SSE connection, a forced reconnect and synthetic fixture messages.
