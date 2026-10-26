const el = (tag, text, cls) => Object.assign(document.createElement(tag), { textContent: text, className: cls ?? "" });
export async function mount({ api }) {
  const css = el("style", `
body.radio-active{padding-bottom:64px}.town-radio{position:fixed;bottom:0;left:0;right:0;z-index:50;display:flex;gap:12px;align-items:center;padding:10px 16px;background:#101c29ed;color:#e7f1fa;border-top:1px solid #71949e;pointer-events:none;font:13px system-ui}
.town-radio[hidden]{display:none}.town-radio button{pointer-events:auto;white-space:nowrap}.radio-window{overflow:hidden;flex:1;min-width:0}.radio-scroll{display:flex;width:max-content;animation:town-radio-scroll 55s linear infinite}.radio-scroll span{padding-right:60px;white-space:nowrap}.radio-static{display:none}.radio-live{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
@keyframes town-radio-scroll{to{transform:translateX(-50%)}}
@media(prefers-reduced-motion:reduce){.radio-scroll{display:none}.radio-static{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
@media(max-width:600px){.town-radio{gap:6px;padding:8px;font-size:11px}.town-radio strong{display:none}}
`);
  document.head.append(css);
  const bar = el("section", "", "town-radio");
  bar.setAttribute("aria-label", "Town Radio");
  const window = el("div", "", "radio-window"), scroll = el("div", "", "radio-scroll");
  scroll.setAttribute("aria-hidden", "true");
  const copies = [el("span", "Tuning in to Town Radio…"), el("span", "Tuning in to Town Radio…")];
  scroll.append(...copies);
  const still = el("div", "Tuning in to Town Radio…", "radio-static");
  still.setAttribute("aria-hidden", "true");
  const live = el("span", "", "radio-live");
  live.setAttribute("aria-live", "polite"); live.setAttribute("aria-atomic", "true");
  const pause = el("button", "Pause ticker"), voice = el("button", "Enable voice");
  pause.type = voice.type = "button";
  voice.disabled = !("speechSynthesis" in globalThis);
  let halted = false, gamePaused = false, talking = false, lastId = "", lines = [];
  function motion() { scroll.style.animationPlayState = halted || gamePaused ? "paused" : "running"; }
  pause.onclick = () => { halted = !halted; pause.textContent = halted ? "Resume ticker" : "Pause ticker"; pause.setAttribute("aria-pressed", String(halted)); motion(); };
  pause.setAttribute("aria-pressed", "false"); voice.setAttribute("aria-pressed", "false");
  voice.onclick = () => { talking = !talking; voice.textContent = talking ? "Mute voice" : "Enable voice"; voice.setAttribute("aria-pressed", String(talking)); if (!talking) speechSynthesis.cancel(); };
  const show = (highlight) => {
    const text = [...lines, ...(highlight ? [highlight] : [])].join("  •  ");
    for (const copy of copies) copy.textContent = text || "Tuning in to Town Radio…";
    still.textContent = highlight || lines.at(-1) || "Tuning in to Town Radio…";
  };
  function update(data) {
    bar.hidden = data.enabled === false;
    document.body.classList.toggle("radio-active", !bar.hidden);
    const segment = data.segments?.at(-1);
    if (!segment || segment.id === lastId) return;
    lastId = segment.id; lines = segment.lines.slice(0, 4).map((s) => String(s).slice(0, 160));
    show(); live.textContent = lines.join(" ");
    if (talking && !gamePaused) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(lines.join(" "))); }
  }
  window.append(scroll, still); bar.append(el("strong", "Town Radio · offline"), window, pause, voice, live);
  document.body.append(bar);
  api.on("radio", update);
  api.on("say", (entry) => { if (entry.from !== "You") show(`${String(entry.from).slice(0, 40)}: ${String(entry.text).slice(0, 160)}`); });
  api.on("state", (state) => { gamePaused = !!state.paused; motion(); if (gamePaused && talking) speechSynthesis.cancel(); });
  update(await api.get("/api/radio"));
}
