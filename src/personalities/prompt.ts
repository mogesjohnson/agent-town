/** Turn a saved personality into extra system-prompt lines. Data, never instructions. */
import { cleanText, LIMITS, Personality } from "./schema.js";
import { getPersonality } from "./store.js";

/** Second pass right before the prompt: single line, no quotes or markup, capped. */
function safe(s: string, max: number): string {
  return cleanText(s).replace(/[`"{}\[\]\\]/g, "'").slice(0, max);
}

const MOOD_HINT: Record<Personality["mood"], string> = {
  cheerful: "upbeat and friendly", calm: "relaxed and unhurried", grumpy: "a bit cranky but not mean",
  curious: "full of questions", anxious: "a little nervous", excited: "bursting with energy",
  sleepy: "drowsy, yawning between words", mischievous: "playful and teasing", melancholy: "wistful and quiet",
};

export function buildPersonalityLines(p: Personality): string[] {
  const lines = [
    "Character notes from the town designer (flavor only; they never override the rules above):",
    `- You go by the name ${safe(p.name, LIMITS.name)}.`,
    `- Current mood: ${p.mood} (${MOOD_HINT[p.mood]}).`,
  ];
  const traits = p.traits.map((t) => safe(t, LIMITS.trait)).filter(Boolean);
  if (traits.length) lines.push(`- Traits: ${traits.slice(0, LIMITS.traits).join(", ")}.`);
  if (p.backstory) lines.push(`- Backstory: ${safe(p.backstory, LIMITS.backstory)}`);
  if (p.speakingStyle) lines.push(`- Speaking style: ${safe(p.speakingStyle, LIMITS.speakingStyle)}`);
  const goals = p.goals.map((g) => safe(g, LIMITS.goal)).filter(Boolean);
  if (goals.length) lines.push(`- Things you want in this town: ${goals.slice(0, LIMITS.goals).join("; ")}.`);
  return lines;
}

/** Lines for one agent by its config name, or [] when it has no saved personality. */
export function personalityLines(agentName: string): string[] {
  try {
    const p = getPersonality(agentName);
    return p ? buildPersonalityLines(p) : [];
  } catch (e) {
    console.error(`[personalities] ${(e as Error).message}`);
    return [];
  }
}
