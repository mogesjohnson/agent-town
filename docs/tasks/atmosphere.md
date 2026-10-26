# Town atmosphere

Codex owns atmosphere; Grok owns coherent world editing and resident memories.
Add season-aware rain/snow/fog/wind, water ripples, vegetation sway and opt-in
ambient sound with visitor footsteps. Keep existing lighting, styles and APIs.
Pause and reduced motion stop decorative animation; hidden pages stay silent.
Use bounded Three.js particle geometry and Web Audio; no paid provider calls.

World integration contract: scene objects may set `userData.atmosphere` to
`water` or `vegetation`. Vegetation tags belong on the rooted tree group, not
individual branches. New objects are discovered automatically, removed objects
are released. Existing scanned pines and physical water have legacy detection.
Season visuals come from `town:season` events and `globalThis.townSeason`.
Manual weather is a browser preview and never rewrites the town's season.

Acceptance: browser evidence for weather, pause, reduced motion, water shader,
new/removed scene objects, opt-in audio, silence/disposal and existing regression.
