# Start plaza games

Add Tag, Trivia and Rock-paper-scissors buttons to the Plaza games panel.

Acceptance:
- Each button starts its selected game through the existing host and SSE feed.
- Reject malformed requests, paused towns, active games and insufficient free residents.
- Repeated clicks cannot start overlapping games; show errors and pending state.
- Keep automatic games, scorekeeping, pause behavior and provider limits intact.
- Label Trivia as using resident turns; Tag and RPS use no model calls.
- Verify server selection/rejections and the browser controls with mock residents.

No dependencies, renderer changes or resident tools are required.
