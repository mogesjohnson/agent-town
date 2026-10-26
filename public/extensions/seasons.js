// Seasons client extension: a side-panel showing the active town event with a trigger dropdown.
// It draws nothing in the town view. Renderers (2D canvas or Three.js) read the plain visuals
// data from `globalThis.townSeason` or listen for the `town:season` window event.
export async function mount({ slot, api }) {
  const box = document.createElement("div");
  box.style.cssText = "margin-top:8px;font-size:12px";
  const title = document.createElement("h2");
  title.textContent = "Season";
  const status = document.createElement("div");
  const swatch = document.createElement("span");
  swatch.style.cssText = "display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:middle";
  const detail = document.createElement("div");
  detail.style.cssText = "opacity:.7;margin:2px 0 4px";
  const pick = document.createElement("select");
  pick.title = "Force an event, or go back to the date pick";
  box.append(title, status, detail, pick);
  slot.panel.append(box);

  const show = (s) => {
    if (!s || !s.visuals) return;
    const v = s.visuals;
    swatch.style.background = v.tint;
    status.replaceChildren(swatch, document.createTextNode(
      s.active ? `${s.active.name} (${s.source === "manual" ? "manual" : "by date"})` : "No event today"));
    detail.textContent = `${v.weather}${v.decor.length ? ` · ${v.decor.join(", ")}` : ""}`;
    if (!pick.options.length) {
      pick.append(new Option("Auto (by date)", ""));
      for (const e of s.events) pick.append(new Option(e.name, e.id));
    }
    pick.value = s.source === "manual" && s.active ? s.active.id : "";
    globalThis.townSeason = v;
    window.dispatchEvent(new CustomEvent("town:season", { detail: v }));
  };

  pick.addEventListener("change", async () => {
    const s = pick.value ? await api.post("/api/season", { id: pick.value }) : await api.post("/api/season/clear");
    if (s && s.ok) show(s);
  });
  api.on("season", show);
  show(await api.get("/api/season"));
}
