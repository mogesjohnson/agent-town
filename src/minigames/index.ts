import type { Routes } from "../extensions.js";
import { LANDMARKS, type Agent, type Emit, type Town } from "../sim.js";
import { GAMES, type Game, type GameCtx } from "./games.js";
import { Scoreboard } from "./scoreboard.js";

const FIRST_GAME_MS = 15_000, BETWEEN_GAMES_MS = 45_000, GATHER_MS = 15_000, COOLDOWN_MS = 10_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const shuffle = <T>(xs: T[]) => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
type OnFn = (event: string, fn: (data: unknown) => void) => unknown;

interface Current { game: Game["id"]; title: string; players: string[]; phase: "gather" | "play"; startedAt: number }

/**
 * Plug plaza minigames into an existing town. Emits `minigame` and `scoreboard` SSE events
 * through `emit`, serves GET /api/minigames when given the route table, and runs its host
 * loop on the extension `tick` event (or its own timer). Patches nothing.
 */
export function registerMinigames(town: Town, emit: Emit, routes?: Routes, on?: OnFn) {
  const board = new Scoreboard();
  const plaza = LANDMARKS.find((l) => l.name === "Plaza") ?? LANDMARKS[0];
  let current: Current | null = null;
  let nextAt = Date.now() + FIRST_GAME_MS;
  const snapshot = () => ({ current, scoreboard: board.snapshot(), games: GAMES.map((g) => g.id) });

  const event = (kind: string, data: Record<string, unknown> = {}) => {
    const ev = { kind, game: current?.game, players: current?.players, t: Date.now(), ...data };
    console.log(`[minigame] ${kind} ${ev.game ?? ""} ${JSON.stringify(data)}`);
    emit("minigame", ev);
  };

  async function run(game: Game, players: Agent[]) {
    let aborted = false;
    const present = () => players.every((p) => town.agents.includes(p));
    const hold = () => {
      for (const p of players) {
        if (p.status !== "thinking" && p.status !== "out-of-turns") p.status = "chatting";
        p.cooldownUntil = Date.now() + 600_000;
      }
    };
    const wait = async (ms: number, playing = true) => {
      for (let left = ms; left > 0;) {
        await sleep(Math.min(200, left));
        if (!present()) { aborted = true; throw new Error("players left the town"); }
        if (town.paused) continue;
        left -= 200;
        if (playing) hold();
      }
    };
    current = { game: game.id, title: game.title, players: players.map((p) => p.cfg.name), phase: "gather", startedAt: Date.now() };
    try {
      const spots = players.map((_, i) => ({ x: plaza.x + ((i * 2) % plaza.w), y: plaza.y + 1 + Math.floor((i * 2) / plaza.w) }));
      const aim = () => players.forEach((p, i) => { p.tx = spots[i].x; p.ty = spots[i].y; p.cooldownUntil = Date.now() + 600_000; });
      event("gather");
      town.addLog("Game host", "Plaza", `${current.players.join(", ")}: meet in the Plaza for ${game.title}!`);
      for (let t = 0; t < GATHER_MS && players.some((p, i) => p.x !== spots[i].x || p.y !== spots[i].y); t += 400) {
        aim();
        await wait(400, false);
      }
      current.phase = "play";
      hold();
      players.forEach((p) => { p.tx = p.x; p.ty = p.y; });
      event("start");
      const ctx: GameCtx = { town, players, plaza, event, sleep: (ms) => wait(ms) };
      const result = await game.play(ctx);
      board.record(result.points, result.winners);
      event("end", { points: result.points, winners: result.winners, summary: result.summary });
      town.addLog("Game host", "Plaza", result.summary);
      emit("scoreboard", board.snapshot());
    } catch (e) {
      event("end", { aborted: true, reason: (e as Error).message });
    } finally {
      for (const p of players) {
        if (!town.agents.includes(p)) continue;
        if (p.status === "chatting") p.status = p.turns >= town.config.maxTurnsPerAgent ? "out-of-turns" : "idle";
        p.cooldownUntil = Date.now() + COOLDOWN_MS;
      }
      if (aborted) console.log("[minigame] aborted");
      current = null;
      nextAt = Date.now() + BETWEEN_GAMES_MS;
      town.broadcastState();
    }
  }

  const step = () => {
    const now = Date.now();
    if (current || town.paused || now < nextAt) return;
    const free = shuffle(town.agents.filter((a) =>
      a.available && (a.status === "idle" || a.status === "walking") && a.cooldownUntil < now));
    const games = GAMES.filter((g) => g.minPlayers <= free.length);
    if (!games.length) { nextAt = now + 5_000; return; }
    const game = games[Math.floor(Math.random() * games.length)];
    void run(game, free.slice(0, Math.min(game.maxPlayers, free.length)));
  };
  if (on) on("tick", step); else setInterval(step, 2_000).unref();

  routes?.add("GET", "/api/minigames", (_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(snapshot()));
  });
  return { snapshot };
}
