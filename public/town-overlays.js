import * as THREE from "three";

export function createOverlays(view, crowd) {
  const tags = new Map();
  let clock = 0, previous = performance.now();
  function tag(name) {
    const label = document.createElement("span"), bubble = document.createElement("div");
    label.className = "agent-name"; label.textContent = name;
    bubble.className = "agent-bubble";
    bubble.hidden = true;
    view.overlay.append(label, bubble);
    const entry = { label, bubble, text: "", started: 0 };
    tags.set(name, entry);
    return entry;
  }
  function animate(now, paused) {
    if (!paused) clock += Math.min(now - previous, 100);
    previous = now;
    for (const [name, entry] of tags) if (!crowd.people.has(name)) {
      entry.label.remove(); entry.bubble.remove(); tags.delete(name);
    }
    const candidates = [];
    for (const [name, person] of crowd.people) {
      const entry = tags.get(name) ?? tag(name);
      const { agent } = person;
      const thinking = agent.status === "thinking";
      const text = thinking ? "..." : agent.bubble ?? "";
      if (text !== entry.text) { entry.text = text; entry.started = clock; }
      const head = person.root.position.clone().add(new THREE.Vector3(0, 2.6, 0));
      view.project(head, entry.label);
      entry.label.classList.toggle("unavailable", agent.status === "unavailable");
      entry.bubble.hidden = true;
      if (text && !entry.label.hidden) candidates.push({ entry, head, thinking });
    }
    candidates.sort((a, b) => Number(b.thinking) - Number(a.thinking) || b.entry.started - a.entry.started);
    const rectangles = [];
    for (const { entry, head, thinking } of candidates) {
      if (rectangles.length === 2) break;
      view.project(head.add(new THREE.Vector3(0, 0.65, 0)), entry.bubble);
      if (entry.bubble.hidden) continue;
      const count = Math.max(1, Math.floor((clock - entry.started) / 28));
      entry.bubble.textContent = thinking ? "..." : entry.text.slice(0, count);
      entry.bubble.classList.toggle("thinking", thinking);
      const bounds = entry.bubble.getBoundingClientRect();
      const stage = view.overlay.getBoundingClientRect();
      if (bounds.left < stage.left || bounds.right > stage.right || bounds.top < stage.top) {
        entry.bubble.hidden = true; continue;
      }
      if (rectangles.some((r) => bounds.left < r.right + 8 && bounds.right > r.left - 8 &&
        bounds.top < r.bottom + 8 && bounds.bottom > r.top - 8)) {
        entry.bubble.hidden = true; continue;
      }
      rectangles.push(bounds);
    }
  }
  return { animate };
}
