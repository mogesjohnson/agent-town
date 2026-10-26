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
the landmark rectangles from the simulation.
