# Map editor in 3D

Bridge the existing map events and API to both 3D styles without changing the
server or simulation. Paint non-grass tiles, show added and moved buildings,
remove deleted buildings, and expose camera-aware cell picking to the editor.
The four scenic agent cottages remain decorative and are not duplicated.

Acceptance: fixture checks map updates, tile clearing, building movement/removal,
40 by 25 to 40 by 30 coordinates, perspective/orthographic picking and cleanup.

Integration contract: `createMapView(view)` returns `ready`, `update(map)`,
`animate()`, `pickCell(clientX, clientY)` and `dispose()`. Call `animate` each frame
for sign projection, handle `ready` errors, and dispose before the scene. It
listens for `agenttown:map` and registers/restores `window.agentTown.pickCell`.
The editor should keep its town hit canvas transparent in 3D mode.

Recorded checks: `npm run build` and `node --test scripts/town-map-view.test.mjs`
pass (3 tests). An isolated Edge/Playwright render loaded painted road/water/tree,
a shop and park, projected labels, and picked the center cell without JavaScript
errors. The fixture server exited. Full combined editor integration is checked by
the renderer PR, not established by this isolated check.
