import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Paper } from "./types.js";
import type { Rumor } from "./rumors.js";

const pad = (n: number) => String(n).padStart(4, "0");
const today = () => new Date().toLocaleDateString("sv");

function markdown(p: Paper): string {
  const parts = [`# ${p.headline}`, `*Issue ${p.issue}, day ${p.day}, by ${p.byline}*`];
  for (const s of p.stories) parts.push(`## ${s.title}`, s.body);
  parts.push("## Gossip", p.gossip, ...(p.rumors ?? []).map((r) => `- ${r}`), "## Weather", p.weather);
  return parts.join("\n\n") + "\n";
}

/** Issues, rumor state and the per-real-day call counter, as files in the data dir. */
export class Store {
  constructor(private dir: string) { mkdirSync(dir, { recursive: true }); }

  private read<T>(file: string, def: T): T {
    try { return JSON.parse(readFileSync(join(this.dir, file), "utf8")) as T; } catch { return def; }
  }
  private write(file: string, data: string) {
    const p = join(this.dir, file);
    writeFileSync(`${p}.tmp`, data);
    renameSync(`${p}.tmp`, p);
  }
  private nums(): number[] {
    return readdirSync(this.dir).map((f) => Number(/^issue-(\d+)\.json$/.exec(f)?.[1])).filter((n) => n > 0).sort((a, b) => a - b);
  }

  get(n: number): Paper | null { return Number.isInteger(n) && n > 0 ? this.read<Paper | null>(`issue-${pad(n)}.json`, null) : null; }
  recent(k: number): Paper[] { return this.nums().slice(-k).reverse().map((n) => this.get(n)).filter((p): p is Paper => !!p); }
  latest(): Paper | null { return this.recent(1)[0] ?? null; }
  list() { return this.recent(1000).map(({ issue, day, date, headline }) => ({ issue, day, date, headline })); }

  save(p: Omit<Paper, "issue">): Paper {
    const full: Paper = { ...p, issue: (this.nums().pop() ?? 0) + 1 };
    this.write(`issue-${pad(full.issue)}.json`, JSON.stringify(full, null, 2));
    this.write(`issue-${pad(full.issue)}.md`, markdown(full));
    return full;
  }

  callsToday(): number {
    const c = this.read("calls.json", { date: "", count: 0 });
    return c.date === today() ? c.count : 0;
  }
  countCall() { this.write("calls.json", JSON.stringify({ date: today(), count: this.callsToday() + 1 })); }
  loadRumors(): Rumor[] { return this.read<Rumor[]>("rumors.json", []); }
  saveRumors(r: Rumor[]) { this.write("rumors.json", JSON.stringify(r, null, 2)); }
}
