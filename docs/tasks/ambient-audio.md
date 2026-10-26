# Optional ambient audio

Add createTownAudio(host), returning animate(now, { paused, weather, night, walking }) and dispose().
- Sound starts only after an explicit Enable sound click; volume is adjustable down to zero.
- Synthesize quiet wind/rain, daytime birds, nighttime crickets and visitor footsteps.
- Silence paused or hidden views; use a fixed reusable audio graph and close its context on disposal.
- No downloaded audio, new dependencies, provider calls or server changes.
- Validate user gating, environmental routing, pause/visibility/volume, bounded nodes and cleanup.
