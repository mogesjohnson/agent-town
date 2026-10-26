# Map editor in 3D

Bridge the existing map events and API to both 3D styles without changing the
server or simulation. Paint non-grass tiles, show added and moved buildings,
remove deleted buildings, and expose camera-aware cell picking to the editor.
The four scenic agent cottages remain decorative and are not duplicated.

Acceptance: fixture checks map updates, tile clearing, building movement/removal,
40 by 25 to 40 by 30 coordinates, perspective/orthographic picking and cleanup.
