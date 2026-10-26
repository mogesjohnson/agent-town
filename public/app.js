// agent-town client: vanilla JS, Canvas, SSE for updates, POST for actions.
const TILE = 20;
const cv = document.getElementById("town"), ctx = cv.getContext("2d");
let state = null, active = "All";
const tabs = { All: [] };

const es = new EventSource("/events");
es.addEventListener("state", (e) => { state = JSON.parse(e.data); render(); });
es.addEventListener("log", (e) => JSON.parse(e.data).forEach(onSay));
es.addEventListener("say", (e) => onSay(JSON.parse(e.data)));

function onSay(m) {
  const line = `${m.from} → ${m.to}: ${m.text}`;
  const log = document.getElementById("log");
  log.insertAdjacentHTML("beforeend", `<div>${esc(line)}</div>`);
  log.scrollTop = log.scrollHeight;
  if (m.from === "You" || m.to === "You") {
    const tab = m.from === "You" ? m.to : m.from;
    if (m.to === "All" || m.from === "You" && m.to === "All") tabs.All.push(line);
    else { (tabs[tab] ??= []).push(line); if (tab !== "All" && m.to === "You") tabs.All.push(line); }
    renderChat();
  }
}

function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

function render() {
  if (!state) return;
  ctx.clearRect(0, 0, cv.width, cv.height);
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
  document.getElementById("pause").textContent = state.paused ? "Resume" : "Pause";
  const u = state.usage;
  document.getElementById("usage").textContent =
    `calls ${u.calls} · errors ${u.errors} · convos ${u.conversations} · chars ${u.chars} · limit ${state.maxTurnsPerAgent} turns/agent, ${state.turnsPerMinute}/min`;
  document.getElementById("lobby").innerHTML = state.agents.map((a) =>
    `<li data-name="${esc(a.name)}"><span class="dot" style="background:${a.color}"></span><b>${esc(a.name)}</b>
     <span class="st">${a.status} · ${a.turns}/${state.maxTurnsPerAgent}</span>
     <div class="sub">${esc(a.provider)} / ${esc(a.model)} · ${esc(a.account)}</div></li>`).join("");
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
