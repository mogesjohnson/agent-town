import { Adapter } from "../types.js";

const OPENERS = ["Oh hey there!", "Fancy meeting you here!", "Well hello, neighbor!", "Hi! Nice day for a stroll."];
const LINES = [
  "Have you tried the cafe's new cinnamon buns?", "I saw a cloud shaped like a teapot earlier.",
  "The park is extra green today.", "I'm reading a book about lighthouses.", "Do you think pigeons have opinions?",
  "I've been practicing my whistling.", "The plaza fountain sounds like applause.", "Let's race to the library sometime!",
  "I lost a button and found a better one.", "What's your favorite time of day?",
];
const CLOSERS = ["Catch you later!", "Off I go, see you around!", "Great chat. Bye for now!"];
const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];

/** Built-in canned chatter so the town works with zero CLIs installed. */
export const mock: Adapter = {
  id: "mock",
  async detect() { return { available: true, account: "built-in", models: ["canned"] }; },
  async chat({ system, messages }) {
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
    const name = /Your name is ([^.]+)\./.exec(system)?.[1] ?? "I";
    const pers = /Personality: ([^.]+)\./.exec(system)?.[1] ?? "";
    const last = messages[messages.length - 1]?.content ?? "";
    if (messages.length <= 1 && last.startsWith("(")) return `${pick(OPENERS)} I'm ${name}, ${pers}.`;
    if (messages.length > 5) return pick(CLOSERS);
    if (last.endsWith("?")) return `Hmm, good question! ${pick(LINES)}`;
    return pick(LINES);
  },
};
