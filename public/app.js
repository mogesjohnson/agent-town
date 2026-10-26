// agent-town client: SSE and controls shared by the 3D and 2D renderers.
const TILE = 20;
const cv = document.getElementById("town"), ctx = cv.getContext("2d");
let state = null, active = "All", townView = null;
import("./town-renderer.js").then(({ mountTown }) => {
  townView = mountTown(cv, () => { townView = null; render(); });
  if (state) townView.update(state);
}).catch((error) => console.warn("3D town unavailable; using canvas fallback", error));
const tabs = Object.assign(Object.create(null), { All: [] });
const HISTORY_LIMIT = 200, RECENT_LIMIT = 2048, recentEvents = new Set();

const es = new EventSource("/events");
let terrain = null;
es.addEventListener("state", (e) => { state = JSON.parse(e.data); render(); });
es.addEventListener("map:changed", () => loadTerrain());
async function loadTerrain() {
  try {
  const response = await fetch("/api/map");
  if (!response.ok) return;
  const next = await response.json();
  if (terrain && next.version < terrain.version) return;
  terrain = next;
  if (!townView) render();
  } catch { /* SSE reconnects; the next map event retries without breaking chat. */ }
}
loadTerrain();
es.addEventListener("log", (e) => JSON.parse(e.data).forEach(onSay));
es.addEventListener("say", (e) => onSay(JSON.parse(e.data)));

function onSay(m) {
  const key = JSON.stringify([m.t, m.from, m.to, m.text]);
  if (recentEvents.has(key)) return;
  recentEvents.add(key);
  if (recentEvents.size > RECENT_LIMIT) recentEvents.delete(recentEvents.values().next().value);
  const line = `${m.from} → ${m.to}: ${m.text}`;
  const log = document.getElementById("log");
  log.insertAdjacentHTML("beforeend", `<div>${esc(line)}</div>`);
  while (log.childElementCount > HISTORY_LIMIT) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
  if (m.from === "You" || m.to === "You") {
    const tab = m.from === "You" ? m.to : m.from;
    if (m.to === "All" || m.from === "You" && m.to === "All") appendChat("All", line);
    else { appendChat(tab, line); if (tab !== "All" && m.to === "You") appendChat("All", line); }
    renderChat();
  }
}

function appendChat(tab, line) {
  const history = tabs[tab] ??= [];
  history.push(line);
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
}

function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

function render() {
  if (!state) return;
  if (townView) townView.update(state);
  else {
    ctx.clearRect(0, 0, cv.width, cv.height);
    const tileColor = { road: "#d6c6a1", water: "#6bafb2", hill: "#8f8a5c", tree: "#4f7a45" };
    terrain?.tiles?.forEach((row, y) => row.forEach((type, x) => {
      if (!tileColor[type]) return;
      ctx.fillStyle = tileColor[type]; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }));
    for (const l of state.landmarks) {
      ctx.fillStyle = l.color; ctx.fillRect(l.x * TILE, l.y * TILE, l.w * TILE, l.h * TILE);
      ctx.fillStyle = "#333"; ctx.font = "12px sans-serif"; ctx.fillText(l.name, l.x * TILE + 4, l.y * TILE + 14);
    }
    for (const a of state.agents) {
      const x = a.x * TILE + TILE / 2, y = a.y * TILE + TILE / 2;
      ctx.globalAlpha = a.status === "unavailable" ? 0.35 : 1;
      ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#111"; ctx.font = "11px sans-serif"; ctx.fillText(a.name, x - 12, y + 20);
      ctx.globalAlpha = 1;
      if (a.bubble) bubble(x, y - 14, a.bubble);
      else if (a.status === "thinking") bubble(x, y - 14, "…");
    }
  }
  document.getElementById("pause").textContent = state.paused ? "Resume" : "Pause";
  const u = state.usage;
  document.getElementById("usage").textContent =
    `calls ${u.calls} · errors ${u.errors} · convos ${u.conversations} · chars ${u.chars} · limit ${state.maxTurnsPerAgent} turns/agent, ${state.turnsPerMinute}/min`;
  document.getElementById("lobby").innerHTML = state.agents.map((a) =>
    `<li data-name="${esc(a.name)}"><span class="dot" style="background:${a.color}"></span><b>${esc(a.name)}</b>
     <span class="st">${a.status} · ${a.turns}/${state.maxTurnsPerAgent}</span>
     <div class="sub">${esc(a.provider)} / ${esc(a.model)} · ${esc(a.account)}</div></li>`).join("");
  renderTokens();
}

function renderTokens() {
  const opened = new Set([...document.querySelectorAll(".token-agent[open]")].map((el) => el.dataset.name));
  const sum = { reportedInput: 0, reportedOutput: 0, estimatedInput: 0, estimatedOutput: 0,
    completedTurns: 0, failedTurns: 0, mockTurns: 0 };
  const fmt = (n) => Number(n || 0).toLocaleString();
  const details = (u) => {
    const reported = u.reportedInput + u.reportedOutput;
    const estimated = u.estimatedInput + u.estimatedOutput;
    return `<div>Reported: <b>${fmt(reported)}</b> (${fmt(u.reportedInput)} in / ${fmt(u.reportedOutput)} out)</div>
      <div>Estimated: <b>~${fmt(estimated)}</b> (~${fmt(u.estimatedInput)} in / ~${fmt(u.estimatedOutput)} out)</div>
      <div>Average / completed turn: ${u.completedTurns ? `~${fmt(Math.round((reported + estimated) / u.completedTurns))}` : "—"}
      · ${fmt(u.completedTurns)} completed · ${fmt(u.mockTurns)} mock · ${fmt(u.failedTurns)} unknown failed</div>`;
  };
  document.getElementById("token-agents").innerHTML = state.agents.map((a) => {
    const u = a.tokenUsage;
    if (!u) return `<div class="token-agent">${esc(a.name)}: accounting unavailable</div>`;
    for (const key of Object.keys(sum)) sum[key] += u[key] || 0;
    const last = u.lastTurn;
    return `<details class="token-agent" data-name="${esc(a.name)}" ${opened.has(a.name) ? "open" : ""}><summary>${esc(a.name)} · ${fmt(u.reportedInput + u.reportedOutput)} reported
      + ~${fmt(u.estimatedInput + u.estimatedOutput)} estimated</summary>${details(u)}
      <div>Last turn: ${last ? `${last.source === "estimated" ? "~" : ""}${fmt(last.inputTokens + last.outputTokens)} tokens
      (${fmt(last.inputTokens)} in / ${fmt(last.outputTokens)} out; ${esc(last.source)})` : "—"}</div></details>`;
  }).join("");
  document.getElementById("token-summary").innerHTML = details(sum);
}

function bubble(x, y, text) {
  ctx.font = "12px sans-serif";
  const t = text.length > 60 ? text.slice(0, 57) + "…" : text;
  const w = ctx.measureText(t).width + 10;
  const bx = Math.max(2, Math.min(cv.width - w - 2, x - w / 2));
  ctx.fillStyle = "white"; ctx.fillRect(bx, y - 18, w, 18);
  ctx.strokeStyle = "#555"; ctx.strokeRect(bx, y - 18, w, 18);
  ctx.fillStyle = "#111"; ctx.fillText(t, bx + 5, y - 5);
}

function renderChat() {
  document.getElementById("tabs").innerHTML = Object.keys(tabs).map((k) =>
    `<button class="${k === active ? "on" : ""}" data-tab="${esc(k)}">${esc(k)}</button>`).join("");
  const m = document.getElementById("msgs");
  m.innerHTML = tabs[active].map((l) => `<div>${esc(l)}</div>`).join("");
  m.scrollTop = m.scrollHeight;
}

document.getElementById("lobby").addEventListener("click", (e) => {
  const li = e.target.closest("li"); if (!li) return;
  active = li.dataset.name; tabs[active] ??= []; renderChat();
});
document.getElementById("tabs").addEventListener("click", (e) => {
  if (e.target.dataset.tab) { active = e.target.dataset.tab; renderChat(); }
});
document.getElementById("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("input"), text = input.value.trim();
  if (!text) return; input.value = "";
  await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ to: active === "All" ? "*" : active, text }) });
});
document.getElementById("pause").addEventListener("click", () =>
  fetch("/api/pause", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
renderChat();
