// Replay player: reads a recorded day (events only) and plays it back at any speed.
// Automation and the clip script use window.replay.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const H = window.AgentTownHighlights;
  const view = (window.AgentTownReplayView || window.AgentTownReplayViews.canvas2d)($("view"));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  const COLORS = { "first-meeting": "#e9c46a", "chat-burst": "#2a9d8f", "game-win": "#e76f51", visitor: "#a5a0ff" };
  let frames = [], says = [], highlights = [], t = 0, end = 0, playing = false, speed = 1, last = 0, caption = null;

  function load(text) {
    const lines = H.parse(text);
    const header = lines[0];
    if (!header || header.format !== "agent-town-replay") throw new Error("not an agent-town replay file");
    if (header.version > 1) console.warn(`replay format v${header.version} is newer than this player (v1)`);
    const events = lines.slice(1).sort((a, b) => a.t - b.t);
    frames = events.filter((e) => e.type === "frame");
    says = events.filter((e) => e.type === "say");
    end = events.length ? events[events.length - 1].t : 0;
    highlights = H.pick(lines, { top: 8 });
    view.setWorld(header.world);
    $("seek").max = end;
    $("marks").innerHTML = highlights.map((h, i) =>
      `<b data-i="${i}" title="${esc(h.caption)}" style="left:${(h.t / (end || 1)) * 100}%;background:${COLORS[h.kind] || "#ccc"}"></b>`).join("");
    $("hl").innerHTML = highlights.map((h, i) => `<div><a href="#" data-i="${i}">${mmss(h.t)}</a> ${esc(h.caption)}</div>`).join("");
    seek(0);
    return { frames: frames.length, says: says.length, end, highlights };
  }

  function frameAt(ms) {
    let lo = 0, hi = frames.length - 1, best = frames[0];
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (frames[mid].t <= ms) { best = frames[mid]; lo = mid + 1; } else hi = mid - 1; }
    return best;
  }

  function render() {
    view.draw(frameAt(t));
    $("clock").textContent = `${mmss(t)} / ${mmss(end)} · ${speed}x`;
    $("seek").value = t;
    const active = highlights.find((h) => t >= h.start && t <= h.end);
    $("caption").textContent = caption ?? (active ? active.caption : "");
    const recent = says.filter((s) => s.t <= t).slice(-10);
    $("log").innerHTML = recent.map((s) => `<div><b>${esc(s.from)}</b> → ${esc(s.to)}: ${esc(s.text)}</div>`).join("");
  }

  function seek(ms) { t = Math.max(0, Math.min(end, ms)); render(); }
  function play(s) { if (s) speed = s; playing = true; $("play").textContent = "Pause"; }
  function pause() { playing = false; $("play").textContent = "Play"; }
  function card(title, sub) {
    $("card").style.display = title ? "grid" : "none";
    $("card").querySelector("h1").textContent = title || "";
    $("card").querySelector("p").textContent = sub || "";
  }

  function loop(now) {
    if (playing) { t = Math.min(end, t + (now - last) * speed); if (t >= end) pause(); render(); }
    last = now;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  const open = (f) => f && f.text().then(load).catch((e) => ($("clock").textContent = e.message));
  $("file").onchange = (e) => open(e.target.files[0]);
  document.ondragover = (e) => e.preventDefault();
  document.ondrop = (e) => { e.preventDefault(); open(e.dataTransfer.files[0]); };
  $("play").onclick = () => (playing ? pause() : play());
  $("speed").onchange = (e) => { speed = Number(e.target.value); render(); };
  $("seek").oninput = (e) => seek(Number(e.target.value));
  document.onclick = (e) => { const i = e.target.dataset && e.target.dataset.i; if (i != null) { e.preventDefault(); seek(highlights[i].start); } };
  document.onkeydown = (e) => { if (e.code === "Space" && e.target.tagName !== "INPUT") { e.preventDefault(); playing ? pause() : play(); } };

  const q = new URLSearchParams(location.search);
  if (q.has("clip")) document.body.classList.add("clip");
  if (q.get("src")) fetch(q.get("src")).then((r) => r.text()).then(load).catch((e) => ($("clock").textContent = e.message));

  window.replay = { load, seek, play, pause, card, setCaption: (c) => { caption = c; render(); }, get t() { return t; }, get end() { return end; } };
})();
