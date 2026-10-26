// Personalities editor. All user text is rendered with textContent, never innerHTML.
"use strict";
const $ = (id) => document.getElementById(id);
let meta = null, data = { version: 1, agents: {} }, current = null;

function setStatus(text) { $("status").textContent = text; }
function showErrors(list) {
  const ul = $("errors");
  ul.replaceChildren(...list.map((e) => { const li = document.createElement("li"); li.textContent = String(e); return li; }));
}

function renderAgents() {
  const names = [...new Set([...meta.agents, ...Object.keys(data.agents)])];
  $("agents").replaceChildren(...names.map((n) => {
    const li = document.createElement("li");
    li.textContent = n;
    if (n === current) li.classList.add("active");
    if (Object.prototype.hasOwnProperty.call(data.agents, n)) li.classList.add("set");
    li.addEventListener("click", () => select(n));
    return li;
  }));
}

function select(name) {
  current = name;
  const p = data.agents[name] || { name, traits: [], mood: "calm", backstory: "", speakingStyle: "", goals: [] };
  $("title").textContent = name;
  $("name").value = p.name;
  $("traits").value = p.traits.join(", ");
  $("mood").value = p.mood;
  $("backstory").value = p.backstory;
  $("speakingStyle").value = p.speakingStyle;
  $("goals").value = p.goals.join("\n");
  showErrors([]);
  renderAgents();
}

function readForm() {
  const split = (s, re) => s.split(re).map((x) => x.trim()).filter(Boolean);
  return {
    name: $("name").value.trim(),
    traits: split($("traits").value, /,/),
    mood: $("mood").value,
    backstory: $("backstory").value.trim(),
    speakingStyle: $("speakingStyle").value.trim(),
    goals: split($("goals").value, /\n/),
  };
}

async function save(next) {
  setStatus("saving...");
  const res = await fetch("/api/personalities", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next),
  });
  const body = await res.json().catch(() => ({ ok: false, errors: ["bad response"] }));
  if (!body.ok) { showErrors(body.errors || ["save failed"]); setStatus("not saved"); return; }
  data = body.data;
  setStatus(`saved ${new Date().toLocaleTimeString()}`);
  select(current);
}

$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!current) return;
  save({ version: 1, agents: { ...data.agents, [current]: readForm() } });
});
$("clear").addEventListener("click", () => {
  if (!current) return;
  const agents = { ...data.agents };
  delete agents[current];
  save({ version: 1, agents });
});

async function init() {
  meta = await (await fetch("/api/personalities")).json();
  data = meta.data;
  const L = meta.limits;
  $("name").maxLength = L.name;
  $("speakingStyle").maxLength = L.speakingStyle;
  $("backstory").maxLength = L.backstory;
  $("traits").placeholder = `up to ${L.traits}, ${L.trait} chars each`;
  $("goals").placeholder = `up to ${L.goals}, ${L.goal} chars each`;
  $("mood").replaceChildren(...meta.moods.map((m) => { const o = document.createElement("option"); o.value = m; o.textContent = m; return o; }));
  renderAgents();
  if (meta.agents.length) select(meta.agents[0]);
  setStatus(`${Object.keys(data.agents).length} saved`);
}
init().catch((e) => setStatus(`load failed: ${e.message}`));
