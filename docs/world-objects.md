# World object registration

The saved map is the authority for houses, paths, trees, the pond, the plaza and venues.
`public/world-default.json` is the seed. A legacy all-grass town with the original
landmarks migrates once. Weather, lighting and sound are not stored in the world file.

Scene objects that atmosphere may animate set `userData.atmosphere` to `water` or
`vegetation`, and `userData.worldId` to a stable id (`pond-31-22`, `tree-5-22`,
`building:cafe`). The tag sits on the rooted group for a tree, and on the water
mesh for a pond cell. Moving an object keeps its id. Removing it removes the
object from `view.world.root`, which is what `town-atmosphere.js` scans.

Path, tree, pond and house meshes are created by `town-scenery.js` in the natural
style. The map overlay does not draw a second copy of those cells or houses.
Plaza and other venues stay on the map overlay and use `userData.worldId` of
`building:<id>`. Hill tiles and any tile the scenery layer does not own stay on
the overlay. Lamps are lighting fixtures, not world records.

The 2D fallback reads `/api/map` and `map:changed`, then draws those tiles under
the landmark rectangles from the simulation. Cozy voxel keeps its ground and
lamps, and draws houses, paths, trees and the pond from the same map overlay.

Map seeding reserves valid saved custom venues before creating cottages, trees or pond
cells. Importing older map exports still advances the live renderer revision. Undo
revalidates current venue footprints and refuses overlaps without changing the map.
Residents route around water and tree tiles before stepping; blocked destinations are
abandoned. Removing every building leaves random wandering available.

Custom venue creation, relocation and previews reject footprints over water or trees
using the live map's traversal predicate. Automatic `near` searches skip those cells.

Anchored venues remain registered when their building is moved, renamed or absent in a
saved world; missing buildings detach the venue until its stable building id returns.
Run `npm run build` then `node scripts/check-world-restart.mjs` for isolated mock-town
migration/restart/undo checks (port 4331, override with `WORLD_CHECK_PORT`).
