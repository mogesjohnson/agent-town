// Friendships: ranks resident pairs by meetings recorded in resident memories. 0 model calls.
const el = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });

export async function mount({ slot, api }) {
  const panel = slot.panel;
  panel.style.cssText = "font-size:12px;line-height:1.5";
  const list = document.createElement("ol");
  panel.append(el("h2", "Friendships"), list);

  function draw(data) {
    const pairs = new Map();
    for (const r of data?.residents ?? [])
      for (const rel of r.relationships ?? []) {
        const key = [r.name, rel.other].sort().join(" & ");
        // Each side records the same meeting; keep the larger count.
        pairs.set(key, Math.max(pairs.get(key) ?? 0, rel.meetings ?? 0));
      }
    const top = [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 10);
    list.replaceChildren(...(top.length ? top.map(([k, n]) => el("li", `${k}: ${n} chats`)) : [el("p", "No chats yet.")]));
  }
  draw(await api.get("/api/memories"));
  api.on("state", (state) => { if (state.memories) draw(state.memories); });
}
