const options = [
  ["natural", "Natural 3D", "Scanned materials · third-person exploration"],
  ["voxel", "Cozy voxel", "Original pixel town · preserved"],
  ["2d", "Classic 2D", "Lightweight canvas fallback"],
];
const query = new URLSearchParams(location.search);
const current = query.get("renderer") === "2d" ? "2d" : query.get("style") || "natural";
const section = document.createElement("details");
section.className = "style-panel";
const tab = document.createElement("summary");
tab.textContent = "Styles";
section.append(tab);
for (const [id, title, description] of options) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `${title} — ${description}`;
  button.setAttribute("aria-pressed", String(current === id));
  button.addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.set("style", id);
    if (id === "2d") url.searchParams.set("renderer", "2d");
    else url.searchParams.delete("renderer");
    location.assign(url);
  });
  section.append(button);
}
document.querySelector("header").after(section);
