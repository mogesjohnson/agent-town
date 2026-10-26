/** Running scoreboard across all minigames, kept in memory only. */
export interface Score { name: string; points: number; wins: number; played: number }

export class Scoreboard {
  private scores = new Map<string, Score>();

  private row(name: string): Score {
    let s = this.scores.get(name);
    if (!s) { s = { name, points: 0, wins: 0, played: 0 }; this.scores.set(name, s); }
    return s;
  }

  /** Record one finished game: points per player and the winners (ties can share a win). */
  record(points: Record<string, number>, winners: string[]) {
    for (const [name, p] of Object.entries(points)) { const s = this.row(name); s.points += p; s.played++; }
    for (const w of winners) this.row(w).wins++;
  }

  /** Sorted by wins, then points. */
  snapshot(): Score[] {
    return [...this.scores.values()].sort((a, b) => b.wins - a.wins || b.points - a.points || a.name.localeCompare(b.name));
  }
}

/** Names with the top score; empty when nobody scored. */
export function leaders(points: Record<string, number>): string[] {
  const best = Math.max(0, ...Object.values(points));
  return best > 0 ? Object.keys(points).filter((n) => points[n] === best) : [];
}
