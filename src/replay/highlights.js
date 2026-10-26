// Highlight picker for agent-town replays. Plain script: works as a classic <script> in the
// browser and from Node (import it, then read globalThis.AgentTownHighlights).
// Input: the parsed replay lines (header first). Output: scored, captioned moments.
(function (root) {
  "use strict";
  const PEOPLE = (n) => n && n !== "You" && n !== "All";
  const clip = (s, n = 70) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
  const join = (xs) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

  function parse(text) {
    return String(text).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  }

  function pick(lines, opts) {
    const o = Object.assign({ burstWindow: 10000, burstMin: 4, pad: 2500, hold: 9000 }, opts);
    const events = lines.filter((e) => e.type !== "header").sort((a, b) => a.t - b.t);
    const says = events.filter((e) => e.type === "say");
    const out = [];
    const add = (h) => out.push(Object.assign({ start: Math.max(0, h.t - o.pad), end: h.t + o.hold }, h));

    // First meetings: the first line ever exchanged between two agents.
    const met = new Set();
    for (const s of says) {
      if (!PEOPLE(s.from) || !PEOPLE(s.to)) continue;
      const key = [s.from, s.to].sort().join("|");
      if (met.has(key)) continue;
      met.add(key);
      add({ t: s.t, kind: "first-meeting", score: 6 + (s.text.endsWith("?") ? 1 : 0), agents: [s.from, s.to],
        caption: `${s.from} meets ${s.to} for the first time: “${clip(s.text, 60)}”` });
    }

    // Chat bursts: the busiest windows of the day (most lines in `burstWindow` ms).
    const wins = [];
    for (let i = 0, j = 0; i < says.length; i++) {
      while (says[j].t < says[i].t - o.burstWindow) j++;
      wins.push({ from: j, to: i, n: i - j + 1 });
    }
    for (const w of wins.sort((a, b) => b.n - a.n)) {
      if (w.n < o.burstMin) break;
      const run = says.slice(w.from, w.to + 1);
      const t = run[0].t;
      if (out.some((h) => h.kind === "chat-burst" && Math.abs(h.t - t) < o.burstWindow)) continue;
      const who = [...new Set(run.flatMap((s) => [s.from, s.to]).filter(PEOPLE))];
      add({ t, end: run[run.length - 1].t + 2500, kind: "chat-burst", score: Math.min(9, 2 + w.n / 2), agents: who,
        caption: `Busy town: ${who.length > 4 ? `${who.slice(0, 3).join(", ")} and ${who.length - 3} others` : join(who)} trade ${w.n} lines in ${Math.round(o.burstWindow / 1000)} s` });
    }

    // Visitors talking to the town.
    for (const s of says) {
      if (s.from !== "You") continue;
      const replies = says.filter((r) => r.to === "You" && r.t >= s.t && r.t - s.t < 20000).length;
      add({ t: s.t, kind: "visitor", score: 4 + Math.min(replies, 6), agents: [],
        caption: `A visitor says “${clip(s.text, 50)}” and ${replies} agent${replies === 1 ? "" : "s"} answer` });
    }

    // Mini-game wins, when the mini-games feature is present.
    for (const g of events) {
      if (g.type !== "minigame" || g.kind !== "end") continue;
      const winners = g.winners && g.winners.length ? g.winners : g.winner ? [g.winner] : [];
      if (!winners.length) continue;
      add({ t: g.t, kind: "game-win", score: 8, agents: winners.concat(g.players || []),
        caption: `${join(winners)} win${winners.length === 1 ? "s" : ""} ${g.game || "a mini-game"}!` });
    }

    // Greedy pick with variety: each moment of a kind already chosen costs 30% of the score.
    // Overlapping windows are dropped, then the result is returned in time order.
    const kept = [], left = out.slice(), limit = o.top || out.length;
    const adj = (h) => h.score * Math.pow(0.7, kept.filter((k) => k.kind === h.kind).length);
    while (kept.length < limit && left.length) {
      left.sort((a, b) => adj(b) - adj(a) || a.t - b.t);
      const h = left.shift();
      if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h);
    }
    return kept.sort((a, b) => a.t - b.t);
  }

  root.AgentTownHighlights = { parse, pick };
})(typeof window !== "undefined" ? window : globalThis);
