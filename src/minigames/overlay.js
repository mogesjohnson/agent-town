// minigames overlay: renderer-agnostic DOM panel. It only reads /events; it never draws on the town canvas.
// Load with <script src="/minigames/overlay.js"></script> from any client page.
(() => {
  if (document.getElementById("mg-overlay")) return;
  const box = document.createElement("div");
  box.id = "mg-overlay";
  box.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:50;width:230px;max-height:45vh;overflow:auto;" +
    "font:12px/1.4 sans-serif;background:rgba(255,255,255,.92);border:1px solid #888;border-radius:8px;padding:8px 10px;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.2)";
  document.body.appendChild(box);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let snap = { current: null, scoreboard: [] };
  const feed = [];

  function render() {
    const c = snap.current;
    const now = c ? `<b>${esc(c.title)}</b> (${esc(c.phase)}): ${c.players.map(esc).join(", ")}` : "<i>No game right now</i>";
    const rows = snap.scoreboard.map((s) =>
      `<tr><td>${esc(s.name)}</td><td>${s.wins}</td><td>${s.points}</td><td>${s.played}</td></tr>`).join("");
    box.innerHTML = `<div style="font-weight:bold;margin-bottom:4px">Plaza games</div><div>${now}</div>` +
      `<div style="color:#555;margin:4px 0">${feed.slice(-4).map(esc).join("<br>")}</div>` +
      `<table style="width:100%;border-collapse:collapse"><tr><th align=left>Agent</th><th>W</th><th>Pts</th><th>Pl</th></tr>` +
      (rows || `<tr><td colspan=4><i>No scores yet</i></td></tr>`) + `</table>`;
  }

  function describe(e) {
    if (e.kind === "tag") return `${e.by} tagged ${e.tagged}!`;
    if (e.kind === "throw") return `R${e.round}: ${Object.entries(e.throws).map(([n, m]) => `${n} ${m}`).join(" vs ")}`;
    if (e.kind === "answer") return `${e.player}: ${e.choice} ${e.correct ? "✓" : "✗"}${e.guessed ? " (guess)" : ""}`;
    if (e.kind === "round" && e.question) return `Q${e.round}: ${e.question}`;
    if (e.kind === "end") return e.aborted ? "Game stopped." : e.summary;
    return null;
  }

  const es = new EventSource("/events");
  es.addEventListener("state", (e) => { const m = JSON.parse(e.data).minigames; if (m) { snap = m; render(); } });
  es.addEventListener("scoreboard", (e) => { snap = { ...snap, scoreboard: JSON.parse(e.data) }; render(); });
  es.addEventListener("minigame", (e) => {
    const line = describe(JSON.parse(e.data));
    if (line) { feed.push(line); if (feed.length > 20) feed.shift(); render(); }
  });
  render();
})();
