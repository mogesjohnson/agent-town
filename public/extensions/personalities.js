// Personalities editor side panel (playtest-operator). Renders user text with textContent/.value only.
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
const field = (label, input) => el("label", { style: "display:flex;flex-direction:column;gap:2px;margin:4px 0" }, label, input);
const split = (s, re) => s.split(re).map((x) => x.trim()).filter(Boolean);
const EMPTY = (name) => ({ name, traits: [], mood: "calm", backstory: "", speakingStyle: "", goals: [] });

export async function mount({ slot, api }) {
  const root = slot.panel;
  const meta = await api.get("/api/personalities");
  let data = meta.data, current = null;
  const L = meta.limits;
  const pick = el("select");
  const f = {
    name: el("input", { maxLength: L.name }),
    traits: el("input", { placeholder: `comma separated, up to ${L.traits}` }),
    mood: el("select"),
    backstory: el("textarea", { rows: 3, maxLength: L.backstory }),
    speakingStyle: el("input", { maxLength: L.speakingStyle }),
    goals: el("textarea", { rows: 3, placeholder: `one per line, up to ${L.goals}` }),
  };
  for (const m of meta.moods) f.mood.append(el("option", { value: m, textContent: m }));
  const status = el("span", { style: "font-size:11px;opacity:.7" });
  const errors = el("ul", { style: "color:#ff8a80;font-size:12px;padding-left:16px" });
  const save = el("button", { type: "submit", textContent: "Save" });
  const clear = el("button", { type: "button", textContent: "Remove" });
  const form = el("form", { autocomplete: "off" },
    field("Agent", pick), field("Name", f.name), field("Traits", f.traits), field("Mood", f.mood),
    field("Backstory", f.backstory), field("Speaking style", f.speakingStyle), field("Goals", f.goals),
    el("div", { style: "display:flex;gap:4px;align-items:center" }, save, clear, status), errors);
  root.replaceChildren(el("h2", { textContent: "Personalities" }), form);

  const has = (n) => Object.prototype.hasOwnProperty.call(data.agents, n);
  function renderPick() {
    const names = [...new Set([...meta.agents, ...Object.keys(data.agents)])];
    pick.replaceChildren(...names.map((n) => el("option", { value: n, textContent: has(n) ? `${n} *` : n })));
    if (current) pick.value = current;
  }
  function select(name) {
    current = name;
    const p = has(name) ? data.agents[name] : EMPTY(name);
    f.name.value = p.name; f.traits.value = p.traits.join(", "); f.mood.value = p.mood;
    f.backstory.value = p.backstory; f.speakingStyle.value = p.speakingStyle; f.goals.value = p.goals.join("\n");
    errors.replaceChildren();
    renderPick();
  }
  async function send(agents) {
    status.textContent = "saving...";
    const r = await api.post("/api/personalities", { version: 1, agents }).catch(() => ({ ok: false, errors: ["save failed"] }));
    if (!r.ok) {
      errors.replaceChildren(...(r.errors || ["save failed"]).map((e) => el("li", { textContent: String(e) })));
      status.textContent = "not saved";
      return;
    }
    data = r.data;
    status.textContent = `saved ${new Date().toLocaleTimeString()}`;
    select(current);
  }
  pick.addEventListener("change", () => select(pick.value));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send({ ...data.agents, [current]: {
      name: f.name.value.trim(), traits: split(f.traits.value, /,/), mood: f.mood.value,
      backstory: f.backstory.value.trim(), speakingStyle: f.speakingStyle.value.trim(), goals: split(f.goals.value, /\n/),
    } });
  });
  clear.addEventListener("click", () => { const a = { ...data.agents }; delete a[current]; send(a); });
  renderPick();
  if (meta.agents.length) select(meta.agents[0]);
}
