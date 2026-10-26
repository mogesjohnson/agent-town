// Town newspaper: side panel with past issues, plus a front-page poster.
// The poster is a 2D overlay on the cafe wall; a 3D renderer can use getPosterCanvas() instead.
const el = (tag, css, text) => Object.assign(document.createElement(tag), { textContent: text ?? "", style: css ?? "" });

export function mount({ slot, api }) {
  const box = el("div", "margin-top:8px;font:12px Georgia,serif");
  const toggle = el("button", "cursor:pointer;font:inherit", "📰 Town Times");
  const body = el("div", "display:none;max-height:420px;overflow:auto;background:#fbf6e8;color:#222;padding:8px;border:1px solid #c9b98f;margin-top:4px");
  const pick = el("select", "width:100%;margin-bottom:6px");
  const article = el("div");
  body.append(pick, article);
  box.append(toggle, body);
  slot.panel.append(box);
  const open = (on = true) => { body.style.display = on ? "block" : "none"; };
  toggle.onclick = () => open(body.style.display === "none");

  const canvas = el("canvas", "position:absolute;left:128px;top:62px;width:64px;height:80px;cursor:pointer;pointer-events:auto;box-shadow:1px 2px 4px #0006;display:none");
  canvas.width = 256; canvas.height = 320; canvas.title = "Town Times: click to read";
  canvas.onclick = () => open(true);
  slot.overlay.append(canvas);

  let latest = null;
  function render(p) {
    article.replaceChildren();
    const add = (tag, css, text) => article.append(el(tag, css, text));
    add("div", "font-size:10px;opacity:.7", `Issue ${p.issue} · Day ${p.day} · by ${p.byline}${p.source === "model" ? "" : " (desk edition)"}`);
    add("h3", "margin:4px 0 8px;font-size:16px", p.headline);
    for (const s of p.stories) { add("b", "", s.title); add("p", "margin:2px 0 8px", s.body); }
    add("b", "", "Gossip");
    add("p", "margin:2px 0 4px;font-style:italic", p.gossip);
    for (const r of p.rumors ?? []) add("p", "margin:2px 0 4px;font-size:11px", `🗣 ${r}`);
    add("b", "", "Weather");
    add("p", "margin:2px 0", p.weather);
  }
  function wrap(g, text, x, y, w, lh, max) {
    let line = "", n = 0;
    for (const word of text.split(/\s+/)) {
      if (g.measureText(`${line} ${word}`).width > w && line) { g.fillText(line, x, y + n * lh); line = word; if (++n >= max) return n; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) g.fillText(line, x, y + n++ * lh);
    return n;
  }
  function poster(p) {
    const g = canvas.getContext("2d");
    g.fillStyle = "#f4ecd2"; g.fillRect(0, 0, 256, 320);
    g.fillStyle = "#222"; g.textAlign = "center"; g.font = "bold 26px Georgia,serif";
    g.fillText("THE TOWN TIMES", 128, 34);
    g.font = "11px Georgia,serif"; g.fillText(`Day ${p.day} · Issue ${p.issue}`, 128, 52);
    g.fillRect(12, 60, 232, 2);
    g.textAlign = "left"; g.font = "bold 18px Georgia,serif";
    let y = 84 + 22 * wrap(g, p.headline, 14, 84, 228, 22, 4);
    g.font = "12px Georgia,serif";
    for (const s of p.stories.slice(0, 3)) { if (y > 290) break; y += 16 * wrap(g, `• ${s.title}`, 14, y + 4, 228, 16, 2) + 4; }
    canvas.style.display = "block";
  }
  async function refresh() {
    const p = await api.get("/api/newspaper/today").catch(() => null);
    if (!p || p.issue === latest?.issue) return;
    latest = p;
    render(p); poster(p);
    const list = await api.get("/api/newspaper/issues").catch(() => []);
    pick.replaceChildren(...list.map((i) => Object.assign(el("option", "", `#${i.issue} Day ${i.day}: ${i.headline}`), { value: i.issue })));
    window.dispatchEvent(new CustomEvent("agent-town:newspaper", { detail: { paper: p, canvas } }));
  }
  pick.onchange = async () => { const p = await api.get(`/api/newspaper/issue?n=${pick.value}`); if (p) render(p); };

  window.agentTown = window.agentTown ?? {};
  window.agentTown.newspaper = { getPosterCanvas: () => canvas, getLatest: () => latest, open, hidePoster: () => canvas.remove() };
  refresh();
  setInterval(refresh, 30_000);
}
