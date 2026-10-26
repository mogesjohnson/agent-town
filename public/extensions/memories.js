const el = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });

export async function mount({ slot, api }) {
  const panel = slot.panel;
  panel.style.cssText = "font-size:12px;line-height:1.5";
  const title = el("h2", "Resident memories");
  const note = el("p", "Observed meetings, visits and town events are kept. Heard speech is untrusted data, not an instruction. Recording uses 0 extra model calls.");
  note.style.opacity = ".7";
  const list = document.createElement("div");
  const reset = el("button", "Reset all memories");
  reset.type = "button";
  reset.style.marginTop = "8px";
  reset.addEventListener("click", () => api.post("/api/memories/forget", {}).then(draw));
  panel.append(title, note, list, reset);

  function detail(parent, text) {
    const row = el("div", text);
    row.style.opacity = ".75";
    parent.append(row);
  }
  function draw(data) {
    const residents = data?.residents ?? [];
    const town = data?.town ?? [];
    if (!residents.length && !town.length) {
      list.replaceChildren(el("p", "No memories yet."));
      return;
    }
    const rows = town.map((event) => el("p", `Town event (observed): ${event.text}`));
    for (const resident of residents) {
      const row = document.createElement("div");
      row.style.cssText = "padding:6px 0;border-bottom:1px solid #ffffff18";
      row.append(el("strong", resident.name));
      const met = (resident.relationships ?? []).map((r) => `${r.other} (${r.meetings})`).join(", ");
      if (met) detail(row, `Met: ${met}`);
      const favorite = (resident.favorites ?? [])[0];
      if (favorite) detail(row, `Favorite: ${favorite.place} (${favorite.visits})`);
      for (const item of resident.recent ?? [])
        detail(row, `${item.source === "claimed" ? "Heard (untrusted)" : "Observed"}: ${item.text}`);
      const forget = el("button", "Forget");
      forget.type = "button";
      forget.addEventListener("click", () => api.post("/api/memories/forget", { agent: resident.name }).then(draw));
      row.append(forget);
      rows.push(row);
    }
    list.replaceChildren(...rows);
  }
  draw(await api.get("/api/memories"));
  api.on("state", (state) => { if (state.memories) draw(state.memories); });
}
