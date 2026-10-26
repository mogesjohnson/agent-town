// Replay client extension (code-executor): a small side-panel link to the replay player.
// Shown only while the server records (AGENT_TOWN_RECORD) or with ?replay in the URL.
export async function mount({ slot, api }) {
  const { recording } = await api.get("/api/replay").catch(() => ({ recording: false }));
  if (!recording && !new URLSearchParams(location.search).has("replay")) return;
  const src = recording ? "?src=/api/replay/current.ndjson" : "";
  slot.panel.innerHTML = `<a href="/replay/player.html${src}" target="_blank" rel="noopener">${recording ? "● Recording · open replay" : "Open replay player"}</a>`;
  slot.panel.style.cssText = "font-size:12px;margin-top:6px";
}
