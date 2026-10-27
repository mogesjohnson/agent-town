// Town stats client extension: live counts from /api/state and SSE events. No model calls.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function mount({ slot, api }) {
  let state = null, messages = 0;
  slot.panel.style.cssText = "font-size:12px;margin-top:6px";

  function busiest(s) {
    const counts = new Map();
    for (const a of s.agents ?? []) {
      const l = (s.landmarks ?? []).find((l) => a.x >= l.x && a.x < l.x + l.w && a.y >= l.y && a.y < l.y + l.h);
      if (l) counts.set(l.name, (counts.get(l.name) ?? 0) + 1);
    }
    let best = null;
    for (const [name, n] of counts) if (!best || n > best[1]) best = [name, n];
    return best ? `${best[0]} (${best[1]})` : "none";
  }

  function render() {
    if (!state) return;
    const agents = state.agents ?? [];
    const rows = [
      ["Residents", agents.length],
      ["Chatting now", agents.filter((a) => a.status === "chatting").length],
      ["Messages this session", messages],
      ["Busiest place", busiest(state)],
    ];
    slot.panel.innerHTML = `<h2 style="margin:8px 0 4px">Town stats</h2>` +
      rows.map(([k, v]) => `<div><span style="opacity:.7">${esc(k)}:</span> <b>${esc(v)}</b></div>`).join("");
  }

  state = await api.get("/api/state");
  render();
  api.on("state", (s) => { state = s; render(); });
  api.on("say", () => { messages++; render(); });
}
