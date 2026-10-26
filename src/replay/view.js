// Default replay view: a simple 2D canvas drawn only from recorded frames. Any other view
// (for example a Three.js one) implements the same { setWorld, draw, destroy } shape and is
// assigned to window.AgentTownReplayView = (host) => view before player.js loads.
(function (root) {
  "use strict";
  const TILE = 20;
  function canvas2d(host) {
    const cv = document.createElement("canvas"), ctx = cv.getContext("2d");
    host.append(cv);
    let world = { w: 40, h: 25, landmarks: [] };
    function bubble(x, y, text) {
      const s = text.length > 64 ? text.slice(0, 63) + "…" : text;
      ctx.font = "12px sans-serif";
      const w = Math.min(ctx.measureText(s).width + 12, 260);
      const bx = Math.max(2, Math.min(cv.width - w - 2, x - w / 2)), by = Math.max(2, y - 26);
      ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.strokeStyle = "#333";
      ctx.beginPath(); ctx.roundRect(bx, by, w, 20, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#111"; ctx.fillText(s, bx + 6, by + 14, w - 12);
    }
    return {
      setWorld(w) { world = w; cv.width = w.w * TILE; cv.height = w.h * TILE; },
      draw(frame) {
        ctx.fillStyle = "#f6f1e7"; ctx.fillRect(0, 0, cv.width, cv.height);
        for (const l of world.landmarks) {
          ctx.fillStyle = l.color; ctx.fillRect(l.x * TILE, l.y * TILE, l.w * TILE, l.h * TILE);
          ctx.fillStyle = "#333"; ctx.font = "bold 12px sans-serif"; ctx.fillText(l.name, l.x * TILE + 4, l.y * TILE + 14);
        }
        if (!frame) return;
        for (const a of frame.agents) {
          const x = a.x * TILE + TILE / 2, y = a.y * TILE + TILE / 2;
          ctx.globalAlpha = a.status === "unavailable" ? 0.35 : 1;
          ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#111"; ctx.font = "11px sans-serif"; ctx.fillText(a.name, x - 12, y + 20);
          ctx.globalAlpha = 1;
        }
        for (const a of frame.agents) if (a.bubble) bubble(a.x * TILE + TILE / 2, a.y * TILE, a.bubble);
      },
      destroy() { cv.remove(); },
    };
  }
  root.AgentTownReplayViews = { canvas2d };
})(window);
