import type { Agent, Town } from "../sim.js";
import { pickQuestions } from "./questions.js";
import { leaders } from "./scoreboard.js";

/** What a game gets from the host. Games only move agents inside the plaza and set bubbles. */
export interface GameCtx {
  town: Town;
  players: Agent[];
  plaza: { x: number; y: number; w: number; h: number };
  /** Emit a `minigame` event of this kind (game id and players are added by the host). */
  event(kind: string, data?: Record<string, unknown>): void;
  /** Waits `ms` of unpaused time; throws if the game was aborted (for example on reload). */
  sleep(ms: number): Promise<void>;
}

export interface GameResult { points: Record<string, number>; winners: string[]; summary: string }

export interface Game {
  id: "tag" | "trivia" | "rps";
  title: string;
  minPlayers: number;
  maxPlayers: number;
  play(ctx: GameCtx): Promise<GameResult>;
}

const rnd = (n: number) => Math.floor(Math.random() * n);
const name = (a: Agent) => a.cfg.name;
const say = (a: Agent, text: string, ms = 2500) => { a.bubble = { text, until: Date.now() + ms }; };
const zero = (ps: Agent[]) => Object.fromEntries(ps.map((p) => [name(p), 0])) as Record<string, number>;
const dist = (a: Agent, b: Agent) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const names = (ns: string[]) => ns.join(" & ") || "nobody";

function moveInPlaza(ctx: GameCtx, a: Agent, dx: number, dy: number) {
  const { x, y, w, h } = ctx.plaza;
  a.x = Math.max(x, Math.min(x + w - 1, a.x + dx));
  a.y = Math.max(y, Math.min(y + h - 1, a.y + dy));
  a.tx = a.x; a.ty = a.y;
}

/** Tag: whoever is "it" chases the nearest player. One point per tag; no tag-backs. */
export const tag: Game = {
  id: "tag", title: "Tag", minPlayers: 2, maxPlayers: 3,
  async play(ctx) {
    const ps = ctx.players, points = zero(ps);
    let it = ps[rnd(ps.length)], last = "";
    say(it, "I'm it! Run!");
    ctx.event("round", { it: name(it) });
    for (let step = 0; step < 24; step++) {
      await ctx.sleep(500);
      const others = ps.filter((p) => p !== it);
      const prey = others.reduce((m, p) => (dist(p, it) < dist(m, it) ? p : m), others[0]);
      moveInPlaza(ctx, it, Math.sign(prey.x - it.x), Math.sign(prey.y - it.y));
      for (const p of others) if (Math.random() < 0.5) {
        moveInPlaza(ctx, p, Math.sign(p.x - it.x) || rnd(3) - 1, Math.sign(p.y - it.y) || rnd(3) - 1);
      }
      const caught = others.find((p) => dist(p, it) <= 1 && name(p) !== last);
      if (!caught) continue;
      points[name(it)]++;
      say(it, `Tag, ${name(caught)}!`);
      ctx.event("tag", { by: name(it), tagged: name(caught), points: { ...points } });
      last = name(it); it = caught;
    }
    const winners = leaders(points);
    return { points, winners, summary: `Tag over! Most tags: ${names(winners)}.` };
  },
};

/** Parse "B", "b) ...", or an option's text out of a free-form reply. -1 if none. */
function parseChoice(text: string | null, options: string[]): number {
  if (!text) return -1;
  const m = /^\W*([ABC])\b/i.exec(text);
  if (m) return "ABC".indexOf(m[1].toUpperCase());
  const lower = text.toLowerCase();
  return options.findIndex((o) => lower.includes(o.toLowerCase()));
}

/** Trivia: two built-in questions; each player answers through the sim's own speak(). */
export const trivia: Game = {
  id: "trivia", title: "Trivia", minPlayers: 2, maxPlayers: 3,
  async play(ctx) {
    const ps = ctx.players, points = zero(ps);
    for (const [i, q] of pickQuestions(2).entries()) {
      const opts = q.options.map((o, j) => `${"ABC"[j]}) ${o}`).join(" ");
      ctx.event("round", { round: i + 1, question: q.q, options: q.options });
      ctx.town.addLog("Trivia host", "Plaza", `${q.q} ${opts}`);
      const prompt = `(Plaza trivia game!) ${q.q} ${opts}. Start your reply with the letter A, B or C, then add a short quip.`;
      const replies = await Promise.all(ps.map((p) => ctx.town.speak(p, "the trivia host", [{ role: "user", content: prompt }])));
      ps.forEach((p, j) => {
        let choice = parseChoice(replies[j], q.options);
        const guessed = choice < 0;
        if (guessed) { choice = rnd(3); say(p, `Umm... ${"ABC"[choice]}?`); }
        const correct = choice === q.answer;
        if (correct) points[name(p)]++;
        ctx.event("answer", { round: i + 1, player: name(p), choice: "ABC"[choice], correct, guessed });
      });
      await ctx.sleep(2000);
      ctx.town.addLog("Trivia host", "Plaza", `Answer: ${"ABC"[q.answer]}) ${q.options[q.answer]}`);
    }
    const winners = leaders(points);
    return { points, winners, summary: `Trivia over! Top score: ${names(winners)}.` };
  },
};

const MOVES = ["rock", "paper", "scissors"] as const;
const ICON = { rock: "✊", paper: "✋", scissors: "✌️" };

/** Rock-paper-scissors: two players, first to two round wins (at most six throws). */
export const rps: Game = {
  id: "rps", title: "Rock-paper-scissors", minPlayers: 2, maxPlayers: 2,
  async play(ctx) {
    const [a, b] = ctx.players, points = zero(ctx.players);
    for (let round = 1; round <= 6 && points[name(a)] < 2 && points[name(b)] < 2; round++) {
      await ctx.sleep(1500);
      const ma = rnd(3), mb = rnd(3);
      say(a, `${ICON[MOVES[ma]]} ${MOVES[ma]}!`); say(b, `${ICON[MOVES[mb]]} ${MOVES[mb]}!`);
      const winner = ma === mb ? null : (ma - mb + 3) % 3 === 1 ? a : b;
      if (winner) points[name(winner)]++;
      ctx.event("throw", {
        round, throws: { [name(a)]: MOVES[ma], [name(b)]: MOVES[mb] },
        winner: winner ? name(winner) : null, points: { ...points },
      });
    }
    await ctx.sleep(1000);
    const winners = leaders(points).length === 1 ? leaders(points) : [];
    return { points, winners, summary: `RPS over! Winner: ${names(winners)}.` };
  },
};

export const GAMES: Game[] = [tag, trivia, rps];
