// Map editor: paint tiles and place/move/remove buildings. Every edit goes through /api/map* as actor "ui".
// Renderers can listen for window "agenttown:map" ({ detail: { map, change } }) to redraw tiles and buildings.
const COLORS = { grass: "#cfe8a9", road: "#d6c6a1", water: "#6bafb2", hill: "#8f8a5c", tree: "#4f7a45" };
const CELL = 7;

export async function mount({ slot, api }) {
  const { tiles, buildings } = await api.get("/api/map/palette");
  let map = null, tool = "road", moving = null, stroke = null;
  const p = slot.panel;
  p.innerHTML = `<h2>Map editor</h2><div class="me-tools"></div>
    <canvas class="me-mini" width="${40 * CELL}" height="${25 * CELL}"></canvas>
    <div><button data-act="undo">Undo</button> <button data-act="save">Save</button>
    <label><button data-act="load">Load</button><input type="file" accept=".json" hidden></label>
    <label><input type="checkbox" class="me-onmap"> paint on town</label></div>
    <div class="me-status"></div><ol class="me-history"></ol>`;
  p.style.cssText = "font-size:12px;margin-top:8px";
  const $ = (s) => p.querySelector(s), mini = $(".me-mini"), status = $(".me-status");
  mini.style.cssText = "width:100%;cursor:crosshair;image-rendering:pixelated";
  $(".me-history").style.cssText = "max-height:110px;overflow-y:auto;padding-left:18px;margin:4px 0";
  const tools = [...tiles, ...buildings.map((b) => `+${b}`), "move", "remove"];
  $(".me-tools").innerHTML = tools.map((t) => `<button data-tool="${t}">${t}</button>`).join(" ");
  const big = document.createElement("canvas");
  big.width = 800; big.height = 500;
  big.style.cssText = "position:absolute;opacity:.45;background:transparent";
  slot.overlay.append(big);

  const say = (msg) => { status.textContent = msg; };
  const setTool = (t) => {
    tool = t; moving = null;
    for (const b of p.querySelectorAll("[data-tool]")) b.style.outline = b.dataset.tool === t ? "2px solid #e9c46a" : "";
  };
  const post = async (path, body) => {
    const r = await api.post(path, { ...body, actor: "ui" });
    if (r.ok === false) say(`error: ${r.error}`);
    return r;
  };
  const at = (x, y) => map.buildings.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);

  function draw() {
    const town = document.getElementById("town");
    const onMap = $(".me-onmap").checked && (window.agentTown?.pickCell || (town && !town.hidden));
    big.style.display = onMap ? "" : "none";
    big.style.pointerEvents = onMap ? "auto" : "none";
    if (town && !town.hidden) { // sit exactly on the 2D canvas, which may be smaller than the stage
      Object.assign(big.style, { left: `${town.offsetLeft}px`, top: `${town.offsetTop}px`, width: `${town.offsetWidth}px`, height: `${town.offsetHeight}px` });
    } else Object.assign(big.style, { left: "0", top: "0", width: "100%", height: "100%" });
    for (const [cv, s, skipGrass] of [[mini, CELL, false], [big, 20, true]]) {
      const g = cv.getContext("2d");
      g.clearRect(0, 0, cv.width, cv.height);
      if (cv === big && window.agentTown?.pickCell) continue; // transparent 3D picking target
      map.tiles.forEach((row, y) => row.forEach((t, x) => {
        if (skipGrass && t === "grass") return;
        g.fillStyle = COLORS[t] ?? "#f0f"; g.fillRect(x * s, y * s, s, s);
      }));
      for (const b of map.buildings) {
        g.strokeStyle = b === moving ? "#e63946" : "#222"; g.lineWidth = 2;
        g.strokeRect(b.x * s + 1, b.y * s + 1, b.w * s - 2, b.h * s - 2);
      }
      g.setLineDash([3, 3]); g.strokeStyle = "#7b2cbf";
      for (const r of map.places ?? []) if (!r.anchor) g.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s);
      g.setLineDash([]);
    }
  }

  async function refresh(change) {
    map = await api.get("/api/map");
    draw();
    window.dispatchEvent(new CustomEvent("agenttown:map", { detail: { map, change } }));
    const hist = await api.get("/api/map/history?limit=20");
    $(".me-history").innerHTML = hist.map((e) =>
      `<li style="${e.undone ? "text-decoration:line-through;opacity:.6" : ""}">${e.actor}: ${e.summary.replace(/</g, "&lt;")}</li>`).join("");
  }

  async function click(x, y) {
    if (tiles.includes(tool)) {
      stroke ??= new Map();
      if (map.tiles[y][x] !== tool) { stroke.set(`${x},${y}`, { x, y, type: tool }); map.tiles[y][x] = tool; draw(); }
    } else if (tool.startsWith("+")) {
      const r = await post("/api/map/buildings", { op: "add", type: tool.slice(1), x, y });
      if (r.ok) say(`added ${r.building.id}`);
    } else if (tool === "remove") {
      const b = at(x, y);
      if (b && (await post("/api/map/buildings", { op: "remove", id: b.id })).ok) say(`removed ${b.id}`);
    } else if (tool === "move") {
      if (!moving) { moving = at(x, y) ?? null; say(moving ? `moving ${moving.id}: click destination` : ""); draw(); return; }
      const r = await post("/api/map/buildings", { op: "move", id: moving.id, x, y });
      moving = null;
      if (r.ok) say(`moved ${r.building.id}`);
    }
  }
  async function flush() {
    if (!stroke) return;
    const cells = [...stroke.values()];
    stroke = null;
    let skipped = 0;
    for (let i = 0; i < cells.length; i += 500) skipped += (await post("/api/map/tiles", { tiles: cells.slice(i, i + 500) })).skipped?.length ?? 0;
    if (skipped) say(`${skipped} cell(s) skipped: reserved by a place`);
    if (!cells.length) return;
    await refresh();
  }
  function cellOf(cv, e) {
    if (cv === big && window.agentTown?.pickCell) return window.agentTown.pickCell(e.clientX, e.clientY);
    const r = cv.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * 40), y = Math.floor(((e.clientY - r.top) / r.height) * 25);
    return x >= 0 && y >= 0 && x < 40 && y < 25 ? { x, y } : null;
  }
  for (const cv of [mini, big]) {
    let down = false;
    cv.addEventListener("pointerdown", (e) => { down = true; cv.setPointerCapture(e.pointerId); const c = cellOf(cv, e); if (c) click(c.x, c.y); });
    cv.addEventListener("pointermove", (e) => {
      const c = down && tiles.includes(tool) && cellOf(cv, e);
      if (c) click(c.x, c.y);
    });
    cv.addEventListener("pointerup", () => { down = false; flush(); });
  }

  p.addEventListener("click", async (e) => {
    const t = e.target.dataset?.tool, act = e.target.dataset?.act;
    if (t) setTool(t);
    if (act === "undo") { const r = await post("/api/map/undo", {}); if (r.ok) say(`undid ${r.undoneEditId}`); }
    if (act === "save") {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(await api.get("/api/map"), null, 1)], { type: "application/json" }));
      a.download = "town-map.json"; a.click(); URL.revokeObjectURL(a.href);
    }
    if (act === "load") { e.preventDefault(); $("input[type=file]").click(); }
  });
  $("input[type=file]").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try { if ((await post("/api/map/load", { map: JSON.parse(await f.text()) })).ok) say(`loaded ${f.name}`); }
    catch { say("error: not a JSON map file"); }
  });
  $(".me-onmap").addEventListener("change", draw);
  api.on("map:changed", (c) => { if (!stroke) refresh(c); });
  setTool(tool);
  await refresh();
}
