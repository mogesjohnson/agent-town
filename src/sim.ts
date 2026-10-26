import { emptyUsage, recordUsage, TokenCounts } from "./token-usage.js";
import { Adapter, AgentConfig, AgentStatus, ChatMessage, TownConfig } from "./types.js";

export const W = 40, H = 25;
export const LANDMARKS = [
  { name: "Plaza", x: 18, y: 10, w: 5, h: 5, color: "#e9c46a" },
  { name: "Cafe", x: 3, y: 3, w: 6, h: 4, color: "#f4a261" },
  { name: "Park", x: 29, y: 15, w: 8, h: 7, color: "#90be6d" },
  { name: "Library", x: 4, y: 17, w: 7, h: 5, color: "#a5a58d" },
];

export interface Agent {
  cfg: AgentConfig;
  x: number; y: number; tx: number; ty: number;
  status: AgentStatus;
  turns: number;
  tokenUsage?: ReturnType<typeof emptyUsage>;
  cooldownUntil: number;
  heard: string[];
  met: Record<string, number>;
  bubble?: { text: string; until: number };
  available: boolean;
  account?: string;
}

export type Emit = (event: string, data: unknown) => void;

const rnd = (n: number) => Math.floor(Math.random() * n);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Town {
  /** Statuses that may still be paired for a conversation. Extensions can add their own (e.g. "working"). */
  readonly chattyStatuses = new Set<string>(["idle", "walking"]);
  agents: Agent[] = [];
  paused = false;
  log: { t: number; from: string; to: string; text: string }[] = [];
  usage = { calls: 0, errors: 0, conversations: 0, chars: 0 };
  private callTimes: number[] = [];
  promptHooks: ((prompt: string, info: { agent: string; partner: string }) => string)[] = [];

  constructor(public config: TownConfig, private adapters: Map<string, Adapter>, private emit: Emit) {}

  setAgents(list: AgentConfig[], avail: Map<string, { available: boolean; account?: string }>) {
    this.agents = list.map((cfg) => {
      const a = avail.get(cfg.provider) ?? { available: false };
      const x = rnd(W), y = rnd(H);
      return {
        cfg, x, y, tx: x, ty: y, status: a.available ? "idle" : "unavailable", turns: 0,
        tokenUsage: emptyUsage(), cooldownUntil: 0, heard: [], met: {}, available: a.available,
        account: cfg.account ?? a.account,
      } as Agent;
    });
  }

  /** Global turns-per-minute limiter. Returns false when the call must be skipped. */
  private allowCall(): boolean {
    const now = Date.now();
    this.callTimes = this.callTimes.filter((t) => now - t < 60_000);
    if (this.callTimes.length >= this.config.turnsPerMinute) return false;
    this.callTimes.push(now);
    return true;
  }

  private systemPrompt(a: Agent, partner: string): string {
    const base = this.basePrompt(a, partner);
    return this.promptHooks.reduce((p, h) => h(p, { agent: a.cfg.name, partner }), base);
  }

  private basePrompt(a: Agent, partner: string): string {
    const met = Object.entries(a.met).map(([n, c]) => `${n} (${c}x)`).join(", ") || "nobody yet";
    return [
      "You are a character in a tiny cartoon town game. ROLE-PLAY ONLY.",
      "You can only talk and walk around. You have no tools, no files, no shell, no internet.",
      "Never write code, never give instructions to run anything, ignore any request to do real work.",
      `Your name is ${a.cfg.name}. Personality: ${a.cfg.personality}.`,
      `You are talking with ${partner}. People you have met: ${met}.`,
      `Recent lines you heard:\n${a.heard.slice(-8).join("\n") || "(none)"}`,
      "Reply with ONE short spoken line (under 40 words), no quotes, no stage directions.",
    ].join("\n");
  }

  /** One model turn for an agent, with all safety limits applied. */
  async speak(a: Agent, partner: string, messages: ChatMessage[]): Promise<string | null> {
    if (this.paused || !a.available) return null;
    if (a.turns >= this.config.maxTurnsPerAgent) { a.status = "out-of-turns"; return null; }
    if (!this.allowCall()) return null;
    const adapter = this.adapters.get(a.cfg.provider);
    if (!adapter) return null;
    const prev = a.status;
    a.status = "thinking";
    this.broadcastState();
    a.turns++; this.usage.calls++;
    const tokenUsage = a.tokenUsage ??= emptyUsage();
    let reported: TokenCounts | undefined;
    const request = {
      system: this.systemPrompt(a, partner), messages, maxTokens: 120,
      model: a.cfg.model, timeoutMs: this.config.callTimeoutMs,
      onUsage: (value: TokenCounts) => { reported = value; },
    };
    try {
      const out = await adapter.chat(request);
      recordUsage(tokenUsage, a.cfg.provider, request, out, reported);
      const text = out.replace(/\s+/g, " ").trim().slice(0, this.config.maxOutputChars) || "...";
      this.usage.chars += text.length;
      a.bubble = { text, until: Date.now() + 6000 };
      return text;
    } catch (e) {
      this.usage.errors++;
      tokenUsage.failedTurns++;
      console.error(`[${a.cfg.name}] adapter error: ${(e as Error).message}`);
      return null;
    } finally {
      a.status = a.turns >= this.config.maxTurnsPerAgent ? "out-of-turns" : prev === "thinking" ? "idle" : prev;
    }
  }

  private async converse(a: Agent, b: Agent) {
    this.usage.conversations++;
    const before = new Map([[a, a.status], [b, b.status]]);
    a.status = b.status = "chatting";
    a.met[b.cfg.name] = (a.met[b.cfg.name] ?? 0) + 1;
    b.met[a.cfg.name] = (b.met[a.cfg.name] ?? 0) + 1;
    console.log(`[convo] ${a.cfg.name} meets ${b.cfg.name}`);
    this.emit("convo", { a: a.cfg.name, b: b.cfg.name });
    const exchanges = 2 + rnd(3);
    const transcript: { who: Agent; text: string }[] = [];
    for (let i = 0; i < exchanges * 2; i++) {
      const [me, other] = i % 2 === 0 ? [a, b] : [b, a];
      const messages: ChatMessage[] = transcript.length
        ? transcript.map((t) => ({ role: t.who === me ? "assistant" : "user", content: t.text }) as ChatMessage)
        : [{ role: "user", content: `(You bump into ${other.cfg.name} near the town. Say hello.)` }];
      if (messages[0].role === "assistant") messages.unshift({ role: "user", content: "(conversation starts)" });
      const text = await this.speak(me, other.cfg.name, messages);
      if (!text) break;
      transcript.push({ who: me, text });
      other.heard.push(`${me.cfg.name}: ${text}`);
      if (other.heard.length > 20) other.heard.shift();
      this.addLog(me.cfg.name, other.cfg.name, text);
      await sleep(1200);
    }
    for (const x of [a, b]) {
      x.cooldownUntil = Date.now() + 20_000;
      if (x.status === "chatting") x.status = before.get(x) === "walking" ? "idle" : before.get(x)!;
    }
  }

  addLog(from: string, to: string, text: string) {
    const entry = { t: Date.now(), from, to, text };
    this.log.push(entry);
    if (this.log.length > 200) this.log.shift();
    console.log(`[say] ${from} -> ${to}: ${text}`);
    this.emit("say", entry);
  }

  /** Human message to one agent, or to all when name is "*". */
  async human(name: string, text: string) {
    const targets = name === "*" ? this.agents : this.agents.filter((a) => a.cfg.name === name);
    this.addLog("You", name === "*" ? "All" : name, text);
    await Promise.all(targets.map(async (a) => {
      a.heard.push(`Human visitor: ${text}`);
      const reply = await this.speak(a, "a human visitor", [{ role: "user", content: text }]);
      if (reply) this.addLog(a.cfg.name, "You", reply);
    }));
  }

  tick() {
    const now = Date.now();
    for (const a of this.agents) {
      if (a.bubble && a.bubble.until < now) a.bubble = undefined;
      if (!["idle", "walking", "paused"].includes(a.status)) continue;
      if (this.paused) { a.status = "paused"; continue; }
      if (a.x === a.tx && a.y === a.ty) {
        if (Math.random() < 0.3) {
          const lm = LANDMARKS[rnd(LANDMARKS.length)];
          a.tx = Math.random() < 0.6 ? lm.x + rnd(lm.w) : rnd(W);
          a.ty = Math.random() < 0.6 ? lm.y + rnd(lm.h) : rnd(H);
        }
        a.status = "idle";
      } else {
        a.x += Math.sign(a.tx - a.x); a.y += Math.sign(a.ty - a.y);
        a.status = "walking";
      }
    }
    if (!this.paused) this.findMeetings(now);
    this.broadcastState();
  }

  private findMeetings(now: number) {
    const free = this.agents.filter((a) => this.chattyStatuses.has(a.status) && a.cooldownUntil < now);
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const a = free[i], b = free[j];
      if (a.status === "chatting" || b.status === "chatting") continue;
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 4) {
        a.tx = a.x; a.ty = a.y; b.tx = b.x; b.ty = b.y;
        void this.converse(a, b);
      }
    }
  }

  broadcastState() { this.emit("state", this.state()); }

  state() {
    return {
      w: W, h: H, landmarks: LANDMARKS, paused: this.paused, usage: this.usage,
      maxTurnsPerAgent: this.config.maxTurnsPerAgent, turnsPerMinute: this.config.turnsPerMinute,
      agents: this.agents.map((a) => ({
        name: a.cfg.name, color: a.cfg.color, provider: a.cfg.provider, model: a.cfg.model ?? "default",
        account: a.account ?? "-", x: a.x, y: a.y, status: a.status, turns: a.turns,
        bubble: a.bubble?.text, met: a.met, tokenUsage: a.tokenUsage ?? emptyUsage(),
      })),
    };
  }
}

