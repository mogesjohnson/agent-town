export interface Resident {
  name: string; personality: string; x: number; y: number; met: Record<string, number>;
}
export interface Destination { name: string; x: number; y: number }
export interface Needs { hunger: number; energy: number; social: number }
export interface Goal extends Destination {
  action: "visit" | "socialize" | "rest" | "explore";
  reason: string;
}
const bound = (v: number, max: number) => Math.max(0, Math.min(max - 1, Math.floor(v)));

/** Finite game choices only. No model text is ever executed as an action. */
export function chooseGoal(a: Resident, needs: Needs, places: Destination[], others: Resident[],
  w: number, h: number, random = Math.random): Goal {
  const pick = <T>(xs: T[]) => xs[Math.min(xs.length - 1, Math.floor(random() * xs.length))];
  const finish = (g: Goal): Goal => ({ ...g, x: bound(g.x, w), y: bound(g.y, h) });
  const cafe = places.find((p) => /cafe|bakery|restaurant/i.test(p.name));
  const park = places.find((p) => /park/i.test(p.name));
  if (needs.hunger < 35 && cafe)
    return finish({ ...cafe, action: "visit", reason: "Feeling hungry; looking for a snack" });
  if (needs.energy < 35 && park)
    return finish({ ...park, action: "rest", reason: "Low energy; taking a quiet break" });
  const social = needs.social < 40 || /social|friendly|chat|outgoing/i.test(a.personality);
  if (others.length && (social || random() < 0.25)) {
    const leastMet = Math.min(...others.map((b) => a.met[b.name] ?? 0));
    const friend = pick(others.filter((b) => (a.met[b.name] ?? 0) === leastMet));
    return finish({ ...friend, action: "socialize", reason: "Seeking someone to get to know better" });
  }
  if (places.length && random() < 0.7) {
    const favorite = /book|read|quiet/i.test(a.personality) && places.find((p) => /library/i.test(p.name));
    return finish({ ...(favorite || pick(places)), action: "visit", reason: "Following a personal interest" });
  }
  return finish({ name: "a new corner of town", x: random() * w, y: random() * h,
    action: "explore", reason: "Curious about somewhere new" });
}
