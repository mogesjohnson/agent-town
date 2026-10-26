const el = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });

export async function mount({ slot, api }) {
  const panel = slot.panel;
  panel.style.cssText = "font-size:12px;line-height:1.5";
  const title = el("h2", "Resident intentions");
  const note = el("p", "Needs and personality guide visits, friendships, rest and exploration. Choices use 0 extra model calls; conversations keep their normal limits.");
  note.style.opacity = ".7";
  const list = document.createElement("div");
  panel.append(title, note, list);
  function draw(data) {
    const rows = (data?.agents ?? []).map((a) => {
      const row = el("div", "");
      row.style.cssText = "padding:5px 0;border-bottom:1px solid #ffffff18";
      const busy = !["idle", "walking"].includes(a.status);
      const goal = a.intent;
      row.append(el("strong", a.name), el("span", ` · ${busy ? a.status : goal?.action ?? "choosing"}`));
      if (goal) {
        const detail = el("div", `${busy ? "Next: " : "Heading to "}${goal.name} — ${goal.reason}.`);
        detail.style.opacity = ".7";
        row.append(detail);
      }
      return row;
    });
    list.replaceChildren(...rows);
  }
  draw(await api.get("/api/autonomy"));
  api.on("state", (state) => draw(state.autonomy));
}
