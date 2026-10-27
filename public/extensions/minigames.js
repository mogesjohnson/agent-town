// minigames client extension: scoreboard and live game feed in the side panel slot.
// Renderer-agnostic: it only reads /api/minigames and the minigame/scoreboard SSE events.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function describe(e) {
  if (e.kind === "gather") return `${e.players.join(", ")} head to the Plaza for ${e.game}`;
  if (e.kind === "tag") return `${e.by} tagged ${e.tagged}!`;
  if (e.kind === "throw") return `R${e.round}: ${Object.entries(e.throws).map(([n, m]) => `${n} ${m}`).join(" vs ")}`;
  if (e.kind === "answer") return `${e.player}: ${e.choice} ${e.correct ? "✓" : "✗"}${e.guessed ? " (guess)" : ""}`;
  if (e.kind === "round" && e.question) return `Q${e.round}: ${e.question}`;
  if (e.kind === "end") return e.aborted ? "Game stopped." : e.summary;
  return null;
}

export function mount({ slot, api }) {
  const box = slot.panel;
  let snap = { current: null, scoreboard: [] };
  const feed = [];
  let pending = false, message = "";

  function render() {
    const c = snap.current;
    const now = c ? `<b>${esc(c.title)}</b> (${esc(c.phase)}): ${c.players.map(esc).join(", ")}` : "<i>No game right now</i>";
    const rows = snap.scoreboard.map((s) =>
      `<tr><td>${esc(s.name)}</td><td>${s.wins}</td><td>${s.points}</td><td>${s.played}</td></tr>`).join("");
    box.innerHTML = `<h2>Plaza games</h2><div>${now}</div>` +
      `<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">` +
      [["tag", "Start Tag"], ["trivia", "Start Trivia"], ["rps", "Start Rock-paper-scissors"]].map(([id, label]) =>
        `<button type="button" data-game="${id}"${pending || c ? " disabled" : ""}>${label}</button>`).join("") + `</div>` +
      `<div style="font-size:12px">Tag and Rock-paper-scissors use no model calls. Trivia uses resident turns.</div>` +
      `<div role="status" aria-live="polite">${esc(message)}</div>` +
      `<div style="opacity:.75;font-size:12px;margin:4px 0">${feed.slice(-4).map(esc).join("<br>")}</div>` +
      `<table style="width:100%;font-size:12px"><tr><th align=left>Agent</th><th>W</th><th>Pts</th><th>Pl</th></tr>` +
      (rows || `<tr><td colspan=4><i>No scores yet</i></td></tr>`) + `</table>`;
    box.querySelectorAll("button[data-game]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (pending || snap.current) return;
        pending = true; message = "Starting game…"; render();
        try {
          const result = await api.post("/api/minigames/start", { game: button.dataset.game });
          if (result.error) message = result.error;
          else { snap = result; message = "Residents are gathering in the plaza."; }
        } catch { message = "Could not reach the town. Please try again."; }
        finally { pending = false; render(); }
      });
    });
  }

  const refresh = () => api.get("/api/minigames").then((m) => { snap = m; render(); }, () => {});
  api.on("scoreboard", (board) => { snap = { ...snap, scoreboard: board }; render(); });
  api.on("minigame", (e) => {
    const line = describe(e);
    if (line) { feed.push(line); if (feed.length > 20) feed.shift(); }
    if (e.kind === "gather" || e.kind === "start" || e.kind === "end") {
      message = ""; refresh();
    } else render();
  });
  render();
  refresh();
}
