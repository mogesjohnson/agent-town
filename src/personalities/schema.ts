/** Personality schema, limits and validation. Server-side source of truth. */

export const MOODS = [
  "cheerful", "calm", "grumpy", "curious", "anxious", "excited", "sleepy", "mischievous", "melancholy",
] as const;
export type Mood = (typeof MOODS)[number];

export const LIMITS = {
  name: 24, trait: 24, traits: 6, backstory: 400, speakingStyle: 160, goal: 100, goals: 4,
  agents: 32, agentKey: 40, fileBytes: 64 * 1024,
} as const;

export interface Personality {
  name: string;
  traits: string[];
  mood: Mood;
  backstory: string;
  speakingStyle: string;
  goals: string[];
}

export interface PersonalitiesFile {
  version: 1;
  agents: Record<string, Personality>;
}

export type Result = { ok: true; value: PersonalitiesFile } | { ok: false; errors: string[] };

const FIELDS = ["name", "traits", "mood", "backstory", "speakingStyle", "goals"];
const SECRET_KEY = /(api[_-]?key|secret|token|passw(or)?d|credential|auth|bearer|private[_-]?key|cookie|session)/i;
const SECRET_VALUE =
  /(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|xox[abprs]-|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN|eyJ[A-Za-z0-9_-]{20,}\.)/;
const SCRIPTY = /(<\s*\/?\s*(script|iframe|object|embed|style|svg|img)\b|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|\bon[a-z]+\s*=)/i;
const NAME_RE = /^[\p{L}\p{N} .'-]+$/u;

/** Strip tags and control characters, collapse whitespace. */
export function cleanText(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function text(v: unknown, field: string, max: number, errors: string[], required = false): string {
  if (v === undefined || v === null) v = "";
  if (typeof v !== "string") { errors.push(`${field}: must be text`); return ""; }
  if (SCRIPTY.test(v)) { errors.push(`${field}: script-like content is not allowed`); return ""; }
  if (SECRET_VALUE.test(v)) { errors.push(`${field}: looks like a secret or API key; remove it`); return ""; }
  const out = cleanText(v);
  if (out.length > max) errors.push(`${field}: at most ${max} characters (got ${out.length})`);
  if (required && !out) errors.push(`${field}: required`);
  return out;
}

function list(v: unknown, field: string, maxItems: number, maxLen: number, errors: string[]): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) { errors.push(`${field}: must be a list`); return []; }
  if (v.length > maxItems) errors.push(`${field}: at most ${maxItems} items (got ${v.length})`);
  return v.map((x, i) => text(x, `${field}[${i}]`, maxLen, errors)).filter(Boolean);
}

export function validatePersonality(raw: unknown, where: string, errors: string[]): Personality | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) { errors.push(`${where}: must be an object`); return null; }
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) {
    if (SECRET_KEY.test(k)) errors.push(`${where}.${k}: secret-like keys are never stored in personality files`);
    else if (!FIELDS.includes(k)) errors.push(`${where}.${k}: unknown field`);
  }
  const name = text(r.name, `${where}.name`, LIMITS.name, errors, true);
  if (name && !NAME_RE.test(name)) errors.push(`${where}.name: only letters, digits, space, - ' .`);
  const mood = r.mood === undefined ? "calm" : r.mood;
  if (!MOODS.includes(mood as Mood)) errors.push(`${where}.mood: must be one of ${MOODS.join(", ")}`);
  return {
    name,
    traits: list(r.traits, `${where}.traits`, LIMITS.traits, LIMITS.trait, errors),
    mood: mood as Mood,
    backstory: text(r.backstory, `${where}.backstory`, LIMITS.backstory, errors),
    speakingStyle: text(r.speakingStyle, `${where}.speakingStyle`, LIMITS.speakingStyle, errors),
    goals: list(r.goals, `${where}.goals`, LIMITS.goals, LIMITS.goal, errors),
  };
}

/** Validate a whole personalities file. Returns cleaned data or every error found. */
export function validatePersonalities(raw: unknown): Result {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["file: must be an object"] };
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) {
    if (SECRET_KEY.test(k)) errors.push(`${k}: secret-like keys are never stored in personality files`);
    else if (k !== "version" && k !== "agents") errors.push(`${k}: unknown field`);
  }
  if (r.version !== undefined && r.version !== 1) errors.push("version: must be 1");
  const agents = r.agents ?? {};
  if (typeof agents !== "object" || Array.isArray(agents)) return { ok: false, errors: [...errors, "agents: must be an object"] };
  const entries = Object.entries(agents as Record<string, unknown>);
  if (entries.length > LIMITS.agents) errors.push(`agents: at most ${LIMITS.agents}`);
  const out: Record<string, Personality> = {};
  for (const [key, val] of entries) {
    if (key.length > LIMITS.agentKey || !NAME_RE.test(key) || ["__proto__", "constructor", "prototype"].includes(key)) {
      errors.push(`agents.${key.slice(0, LIMITS.agentKey)}: invalid agent key`);
      continue;
    }
    const p = validatePersonality(val, `agents.${key}`, errors);
    if (p) out[key] = p;
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: { version: 1, agents: out } };
}
