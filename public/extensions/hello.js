// Example client extension: shows a tiny label in its side-panel slot.
export async function mount({ slot, api }) {
  const { agents } = await api.get("/api/hello");
  slot.panel.textContent = `hello extension: ${agents} agents in town`;
  slot.panel.style.cssText = "font-size:11px;opacity:.7;margin-top:6px";
}
