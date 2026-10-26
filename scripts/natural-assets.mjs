import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assets from "./natural-assets-manifest.mjs";

// Data only: fixed HTTPS URLs, exact SHA-256, bounded sizes, no extraction.
const root = new URL("../public/assets/natural/", import.meta.url);
const hash = (data) => createHash("sha256").update(data).digest("hex");
for (const [path, url, digest] of assets) {
  if (path.includes("..") || !/\.(jpg|bin|gltf)$/.test(path)) throw Error("Invalid asset path");
  const destination = new URL(path, root);
  const cached = await readFile(destination).catch(() => null);
  if (cached && hash(cached) === digest) continue;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw Error(`Asset download failed: ${path} (${response.status})`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 25_000_000) throw Error(`Asset exceeds size limit: ${path}`);
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  if (hash(data) !== digest) throw Error(`Asset checksum mismatch: ${path}`);
  await mkdir(dirname(fileURLToPath(destination)), { recursive: true });
  await writeFile(destination, data);
  console.log(`Downloaded ${path}`);
}
console.log(`Natural town: ${assets.length} pinned CC0 asset files ready.`);
