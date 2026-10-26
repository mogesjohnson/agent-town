export interface Convo { a: string; b: string; lines: string[] }

/** Everything collected for one in-game day, already capped in size. */
export interface DayEvents {
  day: number;
  convos: Convo[];
  meetings: number;
  games: string[];
  other: string[];
  speakers: Record<string, number>;
  visitorLines: number;
}

export interface Story { title: string; body: string }

export interface PaperContent { headline: string; stories: Story[]; gossip: string; weather: string }

export interface Paper extends PaperContent {
  issue: number;
  day: number;
  date: string;
  byline: string;
  source: "model" | "template";
  model?: string;
  /** Rumor-mill lines from the tracker, shown under the gossip column. */
  rumors?: string[];
  stats: { lines: number; conversations: number; meetings: number; games: number; other: number };
}
