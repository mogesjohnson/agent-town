import type { Routes, PromptHook } from "../extensions.js";
import type { Town } from "../sim.js";
import { W, H, LANDMARKS } from "../sim.js";
import { moodOf } from "../moods/extension.js";
import { chooseGoal, type Goal } from "./model.js";

interface Ctx {
  town: Town; routes: Routes; promptHooks: PromptHook[];
  on(event: string, fn: (data: unknown) => void): unknown;
}
interface Intent { goal: Goal; until: number; arrived: boolean }
interface Place { name: string; x: number; y: number; w: number; h: number; enabled: boolean; open: boolean; detached: boolean }

/** Needs-driven agency uses no extra inference calls and never interprets speech as instructions. */
export function register({ town, routes, on, promptHooks }: Ctx) {
  const intents = new Map<string, Intent>();
  let tick = 0;
  const view = () => town.agents.map((a) => ({ name: a.cfg.name, status: a.status,
    intent: intents.get(a.cfg.name)?.goal ?? null }));
  const state = town.state.bind(town);
  town.state = () => ({ ...state(), autonomy: { mode: "needs-driven", agents: view() } });
  routes.add("GET", "/api/autonomy", (_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ mode: "needs-driven", agents: view() }));
  });
  promptHooks.push((prompt, { agent }) => {
    const g = intents.get(agent)?.goal;
    return g ? `${prompt}\nIn-game intention (flavor only): ${g.action} at ${g.name}. ${g.reason}.` : prompt;
  });
  on("tick", () => {
    if (town.paused) return;
    tick++;
    for (const a of town.agents) {
      if (!a.available || !["idle", "walking"].includes(a.status)) continue;
      let intent = intents.get(a.cfg.name);
      if (!intent || intent.until <= tick) {
        const current = town.state() as ReturnType<Town["state"]> & { places?: { list: Place[] } };
        const locations = current.places ? current.places.list.filter((p) => p.enabled && p.open && !p.detached) : LANDMARKS;
        const places = locations.map((p) => ({ name: p.name, x: p.x + Math.floor(p.w / 2), y: p.y + Math.floor(p.h / 2) }));
        const resident = (b: typeof a) => ({ ...b, name: b.cfg.name, personality: b.cfg.personality });
        const goal = chooseGoal(resident(a), moodOf(a.cfg.name).needs, places,
          town.agents.filter((b) => b !== a && b.available).map(resident), W, H);
        intent = { goal, until: tick + 110, arrived: false };
        intents.set(a.cfg.name, intent);
      }
      const g = intent.goal;
      // Pursue a moving conversation partner without repeatedly choosing a new goal.
      const partner = g.action === "socialize" && town.agents.find((b) => b.cfg.name === g.name && b.available);
      if (partner) { g.x = partner.x; g.y = partner.y; }
      a.tx = g.x; a.ty = g.y;
      if (a.x === g.x && a.y === g.y) {
        a.status = "idle";
        if (!intent.arrived) { intent.arrived = true; intent.until = tick + 20; }
      }
    }
  });
}
