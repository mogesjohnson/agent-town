/** Needs, mood model and tunable rates for the moods extension. Needs are 0-100, 100 = fully satisfied. */

export const NEEDS = ["hunger", "energy", "social", "happiness"] as const;
export type Need = (typeof NEEDS)[number];
export type Needs = Record<Need, number>;

/** Mirrors MOODS in src/personalities/schema.ts (PR #9); kept local so this compiles without it. */
export type BaselineMood =
  | "cheerful" | "calm" | "grumpy" | "curious" | "anxious" | "excited" | "sleepy" | "mischievous" | "melancholy";
/** Needs-driven states, separate from personality moods. */
export type NeedMood = "tired" | "hungry" | "lonely" | "sad";

export const DEFAULT_BASELINE: BaselineMood = "calm";

export const MOOD_CONFIG = {
  /** In-game minutes that pass per sim tick (one tick is about 400 ms of real time). */
  gameMinutesPerTick: 1,
  /** Change per in-game minute. Negative drains. */
  rates: { hunger: -0.06, energy: -0.05, social: -0.04 },
  /** Recovery per in-game minute while at the matching landmark. */
  eatRate: 1.5, restRate: 1.2,
  eatAt: "Cafe", restAt: "Park",
  /** Event boosts. */
  convoSocial: 20, convoHappiness: 4, saySocial: 2,
  /** A need below this drives the mood. */
  lowThreshold: 25,
  /** Happiness lost per in-game minute for each need (other than happiness) below the threshold. */
  lowNeedHappinessPenalty: 0.08,
  /** Fraction of the gap to the resting value closed per in-game minute. */
  happinessDrift: 0.01,
  start: { hunger: 80, energy: 90, social: 60 },
  defaultOverrideMinutes: 30,
  maxOverrideMinutes: 24 * 60,
  /** Broadcast the moods event every N ticks. */
  broadcastEveryTicks: 5,
};

/** Happiness drifts back to this, depending on the personality baseline. */
export const RESTING_HAPPINESS: Record<string, number> = {
  cheerful: 75, excited: 75, calm: 65, curious: 65, mischievous: 65,
  sleepy: 55, grumpy: 45, anxious: 45, melancholy: 40,
};
export const restingHappiness = (baseline: string) => RESTING_HAPPINESS[baseline] ?? 60;

export const EMOJI: Record<string, string> = {
  tired: "😴", hungry: "🍔", lonely: "🥺", sad: "😢",
  cheerful: "😊", calm: "😌", grumpy: "😠", curious: "🤔", anxious: "😟",
  excited: "🤩", sleepy: "🥱", mischievous: "😏", melancholy: "😔",
};
export const emojiFor = (mood: string) => EMOJI[mood] ?? "🙂";

const NEED_MOOD: Record<Need, NeedMood> = { energy: "tired", hunger: "hungry", social: "lonely", happiness: "sad" };

export const NUDGE: Record<string, string> = {
  tired: "You feel exhausted and want to head home to rest.",
  hungry: "Your stomach is growling and you want to go eat at the Cafe.",
  lonely: "You feel lonely and want to find someone to chat with.",
  sad: "You feel down and could use some kindness.",
};

/** Lowest need under the threshold wins; null when every need is fine. */
export function needMood(n: Needs, threshold = MOOD_CONFIG.lowThreshold): NeedMood | null {
  let low: Need | null = null;
  for (const k of NEEDS) if (n[k] < threshold && (low === null || n[k] < n[low])) low = k;
  return low ? NEED_MOOD[low] : null;
}

export const clamp = (v: number) => Math.max(0, Math.min(100, v));
export const round = (n: Needs): Needs =>
  ({ hunger: Math.round(n.hunger), energy: Math.round(n.energy), social: Math.round(n.social), happiness: Math.round(n.happiness) });
