// Snapshot extension: "📷 Snapshot" button saves the town canvas as a PNG.
// Note: WebGL canvases without preserveDrawingBuffer clear after compositing,
// so we capture inside requestAnimationFrame (right after the next render);
// if the result is still blank, enable preserveDrawingBuffer in the renderer.
export async function mount({ slot }) {
  const btn = document.createElement("button");
  btn.textContent = "📷 Snapshot";
  btn.onclick = () => {
    const canvas = [...document.querySelectorAll("canvas")]
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!canvas) return;
    requestAnimationFrame(() => {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `agent-town-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, "image/png");
    });
  };
  slot.panel.appendChild(btn);
}
