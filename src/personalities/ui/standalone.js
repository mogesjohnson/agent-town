// Full-page editor: mounts the same panel as public/extensions/personalities.js.
import { mount } from "./personalities.js";
const json = (r) => r.json();
const api = {
  get: (p) => fetch(p).then(json),
  post: (p, body) => fetch(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(json),
};
mount({ slot: { panel: document.getElementById("root") }, api })
  .catch((e) => { document.getElementById("root").textContent = `load failed: ${e.message}`; });
