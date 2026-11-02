// Town log search: filter #log lines by a case-insensitive query.
export async function mount() {
  const log = document.getElementById("log");
  if (!log) return;
  const input = Object.assign(document.createElement("input"), { type: "search", placeholder: "Filter log…" });
  input.setAttribute("aria-label", "Filter town log");
  input.style.cssText = "width:100%;box-sizing:border-box;margin:4px 0;font-size:12px";
  log.before(input);
  const apply = () => {
    const q = input.value.trim().toLowerCase();
    for (const line of log.children) line.hidden = q !== "" && !line.textContent.toLowerCase().includes(q);
  };
  input.addEventListener("input", apply);
  new MutationObserver(apply).observe(log, { childList: true });
}
