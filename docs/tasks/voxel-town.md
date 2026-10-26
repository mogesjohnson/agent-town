# Voxel town renderer

Retired historical specification. The owner discontinued this renderer and the
Styles tab; do not rebuild or reactivate it. Current visual requirements are in
`docs/tasks/natural-only.md`. Licensed external libraries and assets remain
authorized. The acceptance list below records the earlier delivered request.

Replace only the browser renderer above PR #5. Keep the simulation, server API,
SSE, lobby, chat tabs and pause behavior unchanged.

Acceptance:
- Three.js pixelated 40 by 30 town, plaza, four named houses, paths, trees, pond.
- Bounded isometric orbit, pan and zoom; 2D fallback via ?renderer=2d.
- Distinct block characters, movement, shadows, names and two HTML bubbles maximum.
- Typewriter speech, thinking indicator, noon/dusk/night cycle and night glow.
- Free CC0 art only, documented in CREDITS.md; no downloaded executables.
- Build and recorded browser checks, including noon and night screenshots.

Delivery: small stacked codex/* PRs above grok/readme, each under 600 lines.
Push individual Conventional Commits; never merge or rewrite upstream branches.
Three.js is explicitly requested by the owner and is the sole new dependency.
Original procedural voxel art will be dedicated to CC0; no third-party art needed.
Review PRs #1 through #5 independently for bugs and security issues.
