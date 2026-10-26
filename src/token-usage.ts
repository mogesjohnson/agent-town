import type { ChatRequest } from "./types.js";

export interface TokenCounts { inputTokens: number; outputTokens: number }
export interface TurnUsage extends TokenCounts { source: "reported" | "estimated" | "mock" }
export function emptyUsage() {
  return { reportedInput: 0, reportedOutput: 0, estimatedInput: 0, estimatedOutput: 0,
    completedTurns: 0, failedTurns: 0, mockTurns: 0, lastTurn: null as TurnUsage | null };
}
export type TokenUsage = ReturnType<typeof emptyUsage>;
const estimate = (text: string) => Math.ceil(Array.from(text).length / 4);

/** Text-only approximation: excludes hidden reasoning, tool output and provider framing. */
export function recordUsage(usage: TokenUsage, provider: string, req: ChatRequest,
  output: string, reported?: TokenCounts) {
  const valid = reported && [reported.inputTokens, reported.outputTokens]
    .every((n) => Number.isSafeInteger(n) && n >= 0);
  const turn: TurnUsage = provider === "mock"
    ? { source: "mock", inputTokens: 0, outputTokens: 0 }
    : valid ? { ...reported, source: "reported" }
    : { source: "estimated", inputTokens: estimate([req.system, ...req.messages.map((m) => m.content)].join("\n")),
      outputTokens: estimate(output) };
  usage.completedTurns++;
  if (turn.source === "mock") usage.mockTurns++;
  else if (turn.source === "reported") {
    usage.reportedInput += turn.inputTokens; usage.reportedOutput += turn.outputTokens;
  } else {
    usage.estimatedInput += turn.inputTokens; usage.estimatedOutput += turn.outputTokens;
  }
  usage.lastTurn = turn;
}
