# Natural world

Add a separately selectable natural style with CC0 scanned PBR materials and a
scanned pine model, preserving the current voxel style. Keep all asset downloads
as data, local after setup, pinned by SHA-256, and excluded from Git. No executable
asset downloads. Export the same scene arrays used by the existing lighting.

Acceptance: asset setup verifies pinned hashes; all files load locally; the world
includes four cottages, plaza, paths, pond, trees and night windows/lamps.

Recorded checks: `node scripts/natural-assets.mjs` verified all 23 cached files;
`node --check public/town-natural-world.js` passed. An isolated Edge/Playwright
preview loaded every texture and glTF with no JavaScript or HTTP errors, rendered
at 1280 x 800, then shut down. Selecting one sapling variant per tree reduced the
rendered triangle count from 7,978,209 to 2,648,663 including shadow passes.
Integration with styles, camera and live simulation is checked in the renderer PR.
