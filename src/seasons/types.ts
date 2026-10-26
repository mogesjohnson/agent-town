// Data contract for seasonal events. Renderer-agnostic: no drawing code lives here.

export const WEATHERS = ["clear", "rain", "snow", "fog", "wind", "storm"] as const;
export type Weather = (typeof WEATHERS)[number];

export const TIMES_OF_DAY = ["day", "dusk", "night"] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

/** Inclusive month/day range, "MM-DD" to "MM-DD". `from` after `to` wraps the year end. */
export interface DateWindow { from: string; to: string }

export interface Visuals {
  /** Decoration ids a renderer may draw; unknown ids are skipped. */
  decor: string[];
  weather: Weather;
  /** Colour wash for the scene, "#rrggbb". */
  tint: string;
  ambient?: { timeOfDay?: TimeOfDay; brightness?: number };
}

export interface SeasonEvent {
  id: string;
  name: string;
  windows: DateWindow[];
  /** Higher wins when windows overlap. */
  priority: number;
  /** One or two sentences appended to agents' system prompts. */
  topicHint: string;
  visuals: Visuals;
}
