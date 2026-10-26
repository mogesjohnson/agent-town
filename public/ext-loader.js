// Loads public/extensions/*.js and calls mount({ slot, api }) on each. See README "Extensions".
document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href: "extensions/extensions.css" }));
let es; // one shared SSE connection for every extension and api.on call
const api = {
  get: (p) => fetch(p).then((r) => r.json()),
  post: (p, body) => fetch(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => r.json()),
  on: (event, fn) => (es ??= new EventSource("/events")).addEventListener(event, (e) => fn(JSON.parse(e.data))),
};
const files = await api.get("/api/extensions");
for (const file of files) {
  const id = file.replace(/^.*\/|\.js$/g, "");
  const slot = { panel: document.createElement("div"), overlay: document.createElement("div") };
  slot.panel.dataset.ext = slot.overlay.dataset.ext = id;
  document.getElementById("ext-panels").append(slot.panel);
  document.getElementById("ext-overlay").append(slot.overlay);
  try { (await import(file)).mount?.({ slot, api }); } catch (e) { console.error(`[ext] ${id}`, e); }
}
