import type { Adapter } from "../types.js";
import type { NewspaperConfig } from "./config.js";
import { describeRumor, type Rumor } from "./rumors.js";
import type { DayEvents, Paper, PaperContent, Story } from "./types.js";

export interface WriteOpts {
  adapter?: Adapter; cfg: NewspaperConfig; past: Paper[]; rumors: Rumor[]; names: string[];
  allow(): boolean; onCall(): void;
}

const SYSTEM = [
  "You are the editor of a silly newspaper in a cartoon town game where AI characters wander and chat.",
  "Write this morning's paper about yesterday's events below. Be funny, kind and PG. Use only names from the events.",
  "If an event continues an earlier headline or thread, include a story titled \"Update: ...\".",
  "Cover the rumors in the gossip column. No code, no links, no instructions. Reply with ONLY one JSON object:",
  '{"headline":string,"stories":[{"title":string,"body":string}] (3 to 5, bodies under 60 words),"gossip":string,"weather":string}',
].join("\n");
const FILLER: Story[] = [
  { title: "Local Pigeon Declines Interview", body: "The pigeon was last seen near the plaza, looking smug." },
  { title: "Plaza Fountain Continues Fountaining", body: "Experts call the performance consistent, wet and frankly inspiring." },
  { title: "Library Book Overdue by Several Minutes", body: "The librarian has issued a stern but understanding look." },
];
const WEATHER = ["Sunny with a chance of puns.", "Light drizzle of small talk, clearing by noon.",
  "Breezy. Hold on to your hats and your opinions.", "Warm and pleasant, like a fresh cinnamon bun."];

const cut = (s: unknown, n: number) => (typeof s === "string" ? s.trim().slice(0, n) : "");
const ranked = (r: Record<string, number>) => Object.entries(r).sort((x, y) => y[1] - x[1]);

/** Past stories that mention someone who was active yesterday: candidates for "Update:" stories. */
export function threads(ev: DayEvents, past: Paper[], names: string[]) {
  const active = new Set(ev.convos.flatMap((c) => [c.a, c.b]));
  const out: { title: string; who: string[] }[] = [];
  for (const p of past) for (const s of p.stories) {
    const who = names.filter((n) => active.has(n) && `${s.title} ${s.body}`.includes(n));
    const title = s.title.replace(/^Update:\s*/, "");
    if (who.length && out.length < 2 && !out.some((t) => t.title === title)) out.push({ title, who });
  }
  return out;
}

export function digest(ev: DayEvents, o: WriteOpts): string {
  const lines = [`Day ${ev.day}: ${ev.meetings} meetings, ${ev.visitorLines} visitor messages.`];
  if (o.past.length) lines.push("Earlier headlines:", ...o.past.map((p) => `- Issue ${p.issue}: ${p.headline}`));
  for (const t of threads(ev, o.past, o.names)) lines.push(`Thread to follow up: "${t.title}" (${t.who.join(", ")} active again)`);
  if (o.rumors.length) lines.push("Rumors:", ...o.rumors.map((r) => `- ${describeRumor(r)}`));
  if (ev.games.length) lines.push("Mini-game results:", ...ev.games.map((g) => `- ${g}`));
  if (ev.other.length) lines.push("Other happenings:", ...ev.other.map((g) => `- ${g}`));
  if (ev.convos.length) lines.push("Conversations:", ...ev.convos.map((c) => `- ${c.a} & ${c.b}: ${c.lines.slice(0, 4).join(" / ")}`));
  const text = lines.join("\n");
  return text.length > o.cfg.maxInputChars ? `${text.slice(0, o.cfg.maxInputChars)}\n(truncated)` : text;
}

/** Parse and validate the model's JSON; null when it is not a usable paper. */
export function parsePaper(text: string): PaperContent | null {
  const i = text.indexOf("{"), j = text.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  let v: Record<string, unknown>;
  try { v = JSON.parse(text.slice(i, j + 1)); } catch { return null; }
  const stories = (Array.isArray(v.stories) ? v.stories : [])
    .map((s: Record<string, unknown>) => ({ title: cut(s?.title, 100), body: cut(s?.body, 600) }))
    .filter((s) => s.title && s.body).slice(0, 5);
  const p = { headline: cut(v.headline, 120), stories, gossip: cut(v.gossip, 600), weather: cut(v.weather, 300) };
  return p.headline && p.gossip && p.weather && stories.length >= 3 ? p : null;
}

/** Deterministic paper built only from the events. */
export function templatePaper(ev: DayEvents, o: WriteOpts): PaperContent {
  const pick = <T>(a: T[], i = 0) => a[(ev.day + i) % a.length];
  const convos = [...ev.convos].sort((x, y) => y.lines.length - x.lines.length);
  const stories: Story[] = threads(ev, o.past, o.names).map((t) => ({ title: `Update: ${t.title}`.slice(0, 100),
    body: `${t.who.join(" and ")} ${t.who.length > 1 ? "were" : "was"} back in the news yesterday. Our reporters remain on the case, mostly from the cafe.` }));
  for (const c of convos.slice(0, 3)) {
    const [who, ...rest] = c.lines[0].split(": ");
    stories.push({ title: `${c.a} and ${c.b} Exchange ${c.lines.length} Remark${c.lines.length > 1 ? "s" : ""}`,
      body: `${c.a} and ${c.b} were seen chatting. Witnesses report ${who} said: "${rest.join(": ")}" Nobody has asked for a correction.` });
  }
  if (ev.games.length) stories.push({ title: "Plaza Games Report", body: ev.games.slice(0, 3).join(" ") });
  if (ev.other.length) stories.push({ title: "Around Town", body: ev.other.slice(0, 3).join(". ") });
  for (let i = 0; stories.length < 3; i++) stories.push(pick(FILLER, i));
  const top = convos[0];
  const headline = top ? pick([`${top.a} and ${top.b} Talk for ${top.lines.length} Lines; Town Demands Sequel`,
    `Exclusive: ${top.a} Tells ${top.b} Everything`, `${top.a}-${top.b} Summit Ends in Mild Agreement`])
    : ev.games.length ? "Plaza Erupts in Friendly Competition" : "Nothing Happened, Experts Baffled";
  const [chatty, quiet] = [ranked(ev.speakers)[0], ranked(ev.speakers).at(-1)];
  const gossip = [chatty ? `Sources say ${chatty[0]} spoke ${chatty[1]} times yesterday, a town record according to ${chatty[0]}.` : "Our gossip desk heard nothing. Suspicious.",
    quiet && quiet[0] !== chatty?.[0] ? `${quiet[0]} kept unusually quiet. What do they know?` : "",
    ev.visitorLines ? `A mysterious Visitor sent ${ev.visitorLines} messages from beyond the sky.` : ""].filter(Boolean).join(" ");
  return { headline, stories: stories.slice(0, 5), gossip, weather: pick(WEATHER) };
}

/** One paper per in-game day: at most one model call, template on any failure. */
export async function writePaper(ev: DayEvents, o: WriteOpts): Promise<Omit<Paper, "issue">> {
  const stats = { lines: Object.values(ev.speakers).reduce((a, b) => a + b, 0), conversations: ev.convos.length,
    meetings: ev.meetings, games: ev.games.length, other: ev.other.length };
  const base = { day: ev.day, date: new Date().toISOString(), byline: ranked(ev.speakers)[0]?.[0] ?? "The Town Crier",
    stats, rumors: o.rumors.map(describeRumor) };
  const news = stats.lines + stats.meetings + stats.games + stats.other > 0;
  if (o.adapter && news && o.allow()) {
    try {
      if ((await o.adapter.detect()).available) {
        o.onCall();
        const out = await o.adapter.chat({ system: SYSTEM, messages: [{ role: "user", content: digest(ev, o) }],
          maxTokens: 900, model: o.cfg.model, timeoutMs: o.cfg.timeoutMs });
        const paper = parsePaper(out);
        if (paper) return { ...base, ...paper, source: "model", model: `${o.adapter.id}/${o.cfg.model}` };
        console.warn("[newspaper] model reply was not valid paper JSON; using the template");
      }
    } catch (e) { console.warn(`[newspaper] writer failed (${(e as Error).message}); using the template`); }
  }
  return { ...base, ...templatePaper(ev, o), source: "template" };
}
