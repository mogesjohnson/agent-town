// Places extension: side panel with on/off toggles, plus sign boards in the overlay slot.
// Reads only state.places from SSE and /api/places; draws nothing inside any renderer.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const hrs = (h) => `${h.open}:00–${h.close}:00`;

export async function mount({ slot, api }) {
  const { panel, overlay } = slot;
  panel.className = "places-panel";
  panel.style.cssText = "margin-top:8px;font-size:12px";
  overlay.style.cssText = "position:absolute;inset:0;pointer-events:none";
  panel.innerHTML = `<h2>Places <span class="places-clock" style="float:right;opacity:.7"></span></h2><ul style="list-style:none;padding:0;margin:0"></ul>`;
  const ul = panel.querySelector("ul"), clockEl = panel.querySelector(".places-clock");
  const details = new Map();
  let last = "", w = 40, h = 25;

  function draw(list) {
    ul.innerHTML = list.map((p) => {
      const d = details.get(p.id), staff = p.workers.map((x) => `${esc(x.agent)} (${esc(x.role)})`).join(", ");
      return `<li style="padding:3px 0;border-bottom:1px solid #3a3e48" title="${esc(d ? d.vibe : "")}">
        <label><input type="checkbox" data-id="${esc(p.id)}" ${p.enabled ? "checked" : ""}>
        <span style="display:inline-block;width:8px;height:8px;background:${esc(p.color)}"></span> <b>${esc(p.name)}</b></label>
        <span style="float:right;opacity:.8">${p.enabled ? (p.open ? "open" : "closed") : "off"} · ${hrs(p.hours)}</span>
        <div style="opacity:.7;font-size:11px">${staff ? `staff: ${staff}` : "no staff"}${d ? ` · ${esc(d.items.slice(0, 3).join(", "))}` : ""}</div></li>`;
    }).join("");
    const cv = document.getElementById("town");
    const tw = (cv?.clientWidth || overlay.clientWidth) / w, th = (cv?.clientHeight || overlay.clientHeight) / h;
    const ox = cv?.offsetLeft ?? 0, oy = cv?.offsetTop ?? 0;
    overlay.innerHTML = list.filter((p) => p.enabled).map((p) => {
      const box = `left:${ox + p.x * tw}px;top:${oy + p.y * th}px;width:${p.w * tw}px;height:${p.h * th}px`;
      const fill = p.anchor ? "" : `background:${esc(p.color)};opacity:${p.open ? 0.85 : 0.45};border:2px solid #333;border-radius:3px;`;
      return `<div style="position:absolute;${box};${fill}"></div>
        <div style="position:absolute;left:${ox + p.x * tw}px;top:${oy + (p.y + p.h) * th - 16}px;max-width:${Math.max(p.w * tw, 60)}px;
          font:bold 9px sans-serif;background:#4a3728;color:#ffe8a3;padding:1px 3px;border-radius:2px;white-space:nowrap;overflow:hidden;opacity:${p.open ? 1 : 0.6}">
          ${esc(p.sign)}${p.open ? "" : " · closed"}</div>`;
    }).join("");
  }

  function onState(s) {
    if (!s?.places) return;
    w = s.w ?? w; h = s.h ?? h;
    clockEl.textContent = `town time ${s.places.clock}`;
    const sig = JSON.stringify(s.places.list);
    if (sig !== last) { last = sig; draw(s.places.list); }
  }

  ul.addEventListener("change", async (e) => {
    const id = e.target?.dataset?.id;
    if (id) await api.post("/api/places/toggle", { id, enabled: e.target.checked });
  });
  try {
    const full = await api.get("/api/places");
    for (const p of full.places) details.set(p.id, p);
    last = ""; onState({ places: { clock: full.clock, list: full.places } });
  } catch (e) { console.error("[places] /api/places", e); }
  api.on("state", onState);
}
