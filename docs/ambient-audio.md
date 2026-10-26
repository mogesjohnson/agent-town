# Optional town sounds

Choose **Enable sound** in the town toolbar, then adjust **Town sound volume**.
Sound is off until clicked. **Mute sound**, volume zero, game pause and a hidden tab
silence the scene. Wind and weather noise accompany sparse daytime bird calls or
nighttime crickets, with quiet footsteps while the visitor walks.

Sounds are synthesized locally with Web Audio. No audio files, network audio services,
model calls or new dependencies are used. This is subtle game ambience, not recorded wildlife.
No preference is stored; reopening the renderer requires a fresh opt-in.

Renderer contract: `createTownAudio(host)` returns `animate(now, options)` and `dispose()`.
Pass animation milliseconds and `{ paused, weather, night, walking }`; weather recognizes
`clear`, `rain`, `storm`, `snow` and `wind`. Other values use calm ambience. Call `dispose()`
with the view lifecycle to stop and disconnect all sources and close the audio context.

Run `node scripts/check-audio.mjs` with an existing Playwright install, setting
`PLAYWRIGHT_MODULE` if needed. It runs a local fixture with real Web Audio, without speakers
being required. Subjective sound quality and combined renderer behavior need a listening check.
