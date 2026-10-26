import { copyFile, mkdir } from "node:fs/promises";

// Serve only these browser modules, never expose all of node_modules.
await mkdir("public/vendor", { recursive: true });
for (const name of ["three.module.js", "three.core.js"]) {
  await copyFile(`node_modules/three/build/${name}`, `public/vendor/${name}`);
}
await copyFile("node_modules/three/examples/jsm/controls/OrbitControls.js",
  "public/vendor/OrbitControls.js");
await copyFile("node_modules/three/LICENSE", "public/vendor/THREE-LICENSE.txt");
