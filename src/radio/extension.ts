import type { ServerResponse } from "node:http";
import type { Routes } from "../extensions.js";
import type { Town } from "../sim.js";
import { seasonState } from "../seasons/route.js";
import { absHour, gameTime, hhmm, partOfDay } from "./clock.js";
import { readRadioConfig, type Brief, type RadioConfig, type Segment } from "./types.js";

const line = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 160);

/** Offline station: no provider calls, tools, real music or external audio downloads. */
export class RadioStation {
  readonly segments: Segment[] = [];
  private elapsed = 0;
  private lastAt: number;
  private lastHour: number | null = null;
  constructor(readonly config: RadioConfig, now = Date.now()) { this.lastAt = now; }
  tick(now: number, paused: boolean, brief: Omit<Brief, "time">): Segment | undefined {
    const delta = Math.max(0, now - this.lastAt);
    this.lastAt = now;
    if (paused || !this.config.enabled) return;
    this.elapsed += delta;
    const time = gameTime(0, this.elapsed, this.config.realSecondsPerGameHour), hour = absHour(time);
    if (this.lastHour !== null && hour - this.lastHour < this.config.segmentEveryHours) return;
    this.lastHour = hour;
    const recent = brief.events.filter((e) => e.from !== "You" && e.from !== "Radio").slice(-40);
    const quote = recent.at(-1);
    const names = brief.agents.slice(0, 6).join(", ") || "our neighbors";
    const segment: Segment = { id: `radio-${time.day}-${time.hour}`, ...time, source: "template", t: now, lines: [
      `Good ${partOfDay(time.hour)}, town! Day ${time.day}, ${hhmm(time.hour)}. This is Town Radio.`,
      quote ? `${quote.from} to ${quote.to}: ${quote.text}` : "Town news: a fresh day for exploring and making friends.",
      `Shout-out to ${names}. Today's imaginary song is Lanterns by the Pond, dedicated to you!`,
      brief.weather ? `Weather: ${brief.weather.weather}${brief.weather.eventName ? ` · ${brief.weather.eventName}` : ""}. Enjoy the town!`
        : "Take a breather in the park, or say hello to someone new.",
    ].map(line) };
    this.segments.push(segment);
    if (this.segments.length > 12) this.segments.shift();
    return segment;
  }
}

interface Ctx {
  town: Town; routes: Routes; clients: Set<ServerResponse>; config?: { radio?: unknown };
  on(event: string, fn: (data: unknown) => void): unknown;
}
export function register({ town, routes, clients, config, on }: Ctx) {
  const station = new RadioStation(readRadioConfig(config?.radio));
  const snapshot = () => ({ enabled: station.config.enabled, mode: "offline", calls: 0,
    tts: station.config.tts, segments: station.segments });
  routes.add("GET", "/api/radio", (_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(snapshot()));
  });
  on("tick", () => {
    const season = seasonState();
    const segment = station.tick(Date.now(), town.paused, {
      agents: town.agents.filter((a) => a.available).map((a) => a.cfg.name), events: town.log,
      weather: { weather: season.visuals.weather, eventName: season.active?.name ?? null },
    });
    if (!segment) return;
    const event = `event: radio\ndata: ${JSON.stringify(snapshot())}\n\n`;
    for (const client of clients) client.write(event);
  });
  return station;
}
