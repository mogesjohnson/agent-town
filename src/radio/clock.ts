// The town has no in-game clock yet, so the radio keeps its own. See README.md "In-game clock".
import type { GameTime } from "./types.js";

export const START_HOUR = 8;

/** Game time from real elapsed time: one hour per `secondsPerHour`, day 1 starts at 08:00. */
export function gameTime(startedAt: number, now: number, secondsPerHour: number): GameTime {
  const total = START_HOUR + Math.floor((now - startedAt) / 1000 / secondsPerHour);
  return { day: 1 + Math.floor(total / 24), hour: total % 24 };
}

/** Hours since day 1, 00:00. Handy for "every N hours" checks. */
export const absHour = (t: GameTime) => (t.day - 1) * 24 + t.hour;

export function partOfDay(hour: number): "morning" | "afternoon" | "evening" | "night" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

export const hhmm = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
