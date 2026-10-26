// Town Radio data types and defaults. See README.md.
import type { ProviderId } from "../types.js";

export interface RadioConfig {
  enabled: boolean;
  provider: ProviderId;
  model: string;
  segmentEveryHours: number;
  maxCallsPerDay: number;
  afterCap: "template" | "skip";
  realSecondsPerGameHour: number;
  tts: boolean;
}

export const RADIO_DEFAULTS: RadioConfig = {
  enabled: true,
  provider: "mock",
  model: "canned",
  segmentEveryHours: 3,
  maxCallsPerDay: 0,
  afterCap: "template",
  realSecondsPerGameHour: 60,
  tts: false,
};

/** One line someone said, as in `town.log` and the `say` event. */
export interface SayEvent { t: number; from: string; to: string; text: string }

export interface GameTime { day: number; hour: number }

/** What the DJ knows when it builds a segment. */
export interface Brief {
  time: GameTime;
  events: SayEvent[];
  agents: string[];
  weather?: { weather: string; eventName: string | null };
}

export interface Segment {
  id: string;
  day: number;
  hour: number;
  source: "llm" | "template";
  lines: string[];
  t: number;
}

/** Merge a partial `radio` block from the town config over the defaults, ignoring bad values. */
export function readRadioConfig(raw: unknown): RadioConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof RadioConfig, unknown>>;
  const num = (v: unknown, d: number, min: number) => (typeof v === "number" && Number.isFinite(v) && v >= min ? v : d);
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : RADIO_DEFAULTS.enabled,
    provider: typeof r.provider === "string" ? (r.provider as ProviderId) : RADIO_DEFAULTS.provider,
    model: typeof r.model === "string" && r.model ? r.model : RADIO_DEFAULTS.model,
    segmentEveryHours: Math.round(num(r.segmentEveryHours, RADIO_DEFAULTS.segmentEveryHours, 1)),
    maxCallsPerDay: Math.round(num(r.maxCallsPerDay, RADIO_DEFAULTS.maxCallsPerDay, 0)),
    afterCap: r.afterCap === "skip" ? "skip" : "template",
    realSecondsPerGameHour: num(r.realSecondsPerGameHour, RADIO_DEFAULTS.realSecondsPerGameHour, 1),
    tts: typeof r.tts === "boolean" ? r.tts : RADIO_DEFAULTS.tts,
  };
}
