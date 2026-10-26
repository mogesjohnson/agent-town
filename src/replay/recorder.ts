// Town replay recorder: turns sim events into a whitelisted NDJSON replay (format version 1).
// It never copies an event wholesale: every field written below is picked by name, and all
// text is scrubbed for token-looking strings. Env values, config and accounts are never read.
import { createWriteStream, mkdirSync, WriteStream } from "node:fs";
import { dirname } from "node:path";

export const REPLAY_VERSION = 1;

const SECRETS: RegExp[] = [
  /\b(sk|pk|rk|xai|ghp|gho|ghu|ghs|github_pat|glpat|AKIA|AIza|ya29)[-_A-Za-z0-9]{12,}/g,
  /\bBearer\s+[-._~+/A-Za-z0-9]+=*/gi,
  /\b(api[_-]?key|token|secret|password|passwd)\b\s*[:=]\s*\S+/gi,
  /\b[A-Fa-f0-9]{32,}\b/g,
  /\b[A-Za-z0-9+/_-]{40,}={0,2}/g,
];

/** Replace anything that looks like a credential with [redacted]. */
export function scrub(s: unknown, max = 400): string {
  let out = String(s ?? "").slice(0, max);
  for (const re of SECRETS) out = out.replace(re, "[redacted]");
  return out;
}

const str = (v: unknown, max = 60) => scrub(v, max);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);
const names = (v: unknown) => (Array.isArray(v) ? v.slice(0, 12).map((n) => str(typeof n === "object" && n ? (n as any).name : n)) : undefined);

export interface Header { seed: number | null; source: "server" | "headless"; startedAt?: string }

export class Recorder {
  private out: WriteStream;
  private start = Date.now();
  private lastFrame = "";
  private wroteHeader = false;
  lines = 0;

  constructor(path: string, private header: Header, private now: () => number = Date.now) {
    mkdirSync(dirname(path), { recursive: true });
    this.out = createWriteStream(path, { flags: "w" });
    this.start = now();
  }

  private write(o: object) { this.out.write(JSON.stringify(o) + "\n"); this.lines++; }
  private t() { return Math.max(0, Math.round(this.now() - this.start)); }

  /** Feed one sim event (the same name and payload the SSE stream carries). */
  record(event: string, data: any) {
    if (!data || typeof data !== "object") return;
    if (event === "state") return this.state(data);
    if (!this.wroteHeader) return; // nothing before the first state (we need the world)
    if (event === "say") {
      this.write({ t: this.t(), type: "say", from: str(data.from), to: str(data.to), text: scrub(data.text) });
    } else if (event === "minigame") {
      const e: Record<string, unknown> = { t: this.t(), type: "minigame", kind: str(data.kind, 20), game: str(data.game, 30) };
      const players = names(data.players); if (players) e.players = players;
      if (data.winner != null) e.winner = str(typeof data.winner === "object" ? data.winner.name : data.winner);
      const winners = names(data.winners); if (winners) e.winners = winners;
      if (typeof data.round === "number") e.round = data.round;
      this.write(e);
    } else if (event === "scoreboard") {
      const src = Array.isArray(data) ? Object.fromEntries(data.map((r: any) => [r?.name, r?.score ?? r?.wins])) : data;
      const scores: Record<string, number> = {};
      for (const [k, v] of Object.entries(src ?? {}).slice(0, 40)) if (typeof v === "number") scores[str(k)] = v;
      this.write({ t: this.t(), type: "scoreboard", scores });
    }
  }

  private state(s: any) {
    if (!this.wroteHeader) {
      const world = {
        w: num(s.w), h: num(s.h),
        landmarks: (Array.isArray(s.landmarks) ? s.landmarks : []).map((l: any) => ({
          name: str(l.name), x: num(l.x), y: num(l.y), w: num(l.w), h: num(l.h), color: str(l.color, 16),
        })),
      };
      this.write({
        type: "header", format: "agent-town-replay", version: REPLAY_VERSION, seed: this.header.seed,
        startedAt: this.header.startedAt ?? new Date().toISOString(), source: this.header.source, world,
      });
      this.wroteHeader = true;
    }
    const agents = (Array.isArray(s.agents) ? s.agents : []).map((a: any) => {
      const o: Record<string, unknown> = {
        name: str(a.name), color: str(a.color, 16), provider: str(a.provider, 20),
        x: num(a.x), y: num(a.y), status: str(a.status, 20), turns: num(a.turns),
      };
      if (a.bubble) o.bubble = scrub(a.bubble, 280);
      return o;
    });
    const frame = JSON.stringify({ paused: !!s.paused, agents });
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    this.write({ t: this.t(), type: "frame", paused: !!s.paused, agents });
  }

  close(): Promise<void> { return new Promise((r) => this.out.end(r)); }
}
