// Moods client extension: mood emoji + mini need bars over each agent (overlay) and a Moods panel.
const NEEDS = ["hunger", "energy", "social", "happiness"];
const COLORS = { hunger: "#f4a261", energy: "#e9c46a", social: "#2a9d8f", happiness: "#e76f51" };
const css = `
.mood-tag{position:absolute;transform:translate(-50%,-100%);display:flex;align-items:flex-end;gap:2px;pointer-events:none}
.mood-tag .e{font-size:14px;line-height:1}
.mood-bars{display:flex;flex-direction:column;gap:1px}
.mood-bar{width:22px;height:3px;background:rgba(0,0,0,.35);border-radius:2px;overflow:hidden}
.mood-bar i{display:block;height:100%}
.moods-panel h2{margin:8px 0 4px}
.moods-row{display:grid;grid-template-columns:22px 70px 1fr;gap:4px;align-items:center;font-size:12px;margin:3px 0}
.moods-row .big .mood-bar{width:100%;height:5px;margin:1px 0}
.moods-row .who small{display:block;opacity:.7;font-size:10px}`;
document.head.append(Object.assign(document.createElement("style"), { textContent: css }));

const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text != null ? { textContent: text } : {});

function bars(needs, big) {
  const box = el("div", big ? "mood-bars big" : "mood-bars");
  for (const k of NEEDS) {
    const bar = el("div", "mood-bar"), fill = el("i");
    fill.style.cssText = `width:${needs[k]}%;background:${COLORS[k]}`;
    bar.title = `${k} ${needs[k]}`;
    bar.append(fill); box.append(bar);
  }
  return box;
}

export async function mount({ slot, api }) {
  let moods = [], pos = null;
  slot.panel.className = "moods-panel";
  const cv = document.getElementById("town");

  function renderPanel() {
    const list = el("div");
    for (const m of moods) {
      const row = el("div", "moods-row");
      const who = el("div", "who", m.agent);
      who.append(el("small", null, m.override ? `${m.mood} (set)` : m.mood));
      row.title = `baseline ${m.baseline}; ` + NEEDS.map((k) => `${k} ${m.needs[k]}`).join(", ");
      row.append(el("span", "e", m.emoji), who, bars(m.needs, true));
      list.append(row);
    }
    slot.panel.replaceChildren(el("h2", null, "Moods"), list);
  }

  function renderOverlay() {
    if (!pos || !cv) return;
    const sx = cv.clientWidth / pos.w, sy = cv.clientHeight / pos.h;
    const tags = [];
    for (const m of moods) {
      const a = pos.agents.find((x) => x.name === m.agent);
      if (!a) continue;
      const tag = el("div", "mood-tag");
      tag.style.left = `${cv.offsetLeft + (a.x + 0.5) * sx + 14}px`;
      tag.style.top = `${cv.offsetTop + (a.y + 0.5) * sy - 4}px`;
      tag.append(el("span", "e", m.emoji), bars(m.needs, false));
      tags.push(tag);
    }
    slot.overlay.replaceChildren(...tags);
  }

  const update = (d) => { moods = d.agents ?? []; renderPanel(); renderOverlay(); };
  update(await api.get("/api/moods"));
  api.on("moods", update);
  api.on("state", (s) => { pos = s; renderOverlay(); });
}
