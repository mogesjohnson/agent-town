export type ProviderId = "mock" | "claude-code" | "codex" | "grok" | "gemini" | "ollama";

export interface AgentConfig {
  name: string;
  personality: string;
  color: string;
  provider: ProviderId;
  model?: string;
  account?: string;
}

export interface TownConfig {
  port: number;
  maxTurnsPerAgent: number;
  turnsPerMinute: number;
  callTimeoutMs: number;
  maxOutputChars: number;
  adapters: Partial<Record<ProviderId, boolean>>;
  agents: AgentConfig[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DetectResult {
  available: boolean;
  account?: string;
  models?: string[];
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  model?: string;
  timeoutMs: number;
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
}

export interface Adapter {
  id: ProviderId;
  detect(): Promise<DetectResult>;
  chat(req: ChatRequest): Promise<string>;
}

/** Built-in statuses. Extensions may set their own (e.g. "playing"); the sim
 *  leaves an agent with a custom status in place until it is set back to "idle". */
export type AgentStatus =
  | "idle" | "walking" | "chatting" | "thinking" | "paused" | "out-of-turns" | "unavailable"
  | (string & {});

export const DEFAULT_CONFIG: Omit<TownConfig, "agents"> = {
  port: 4317,
  maxTurnsPerAgent: 20,
  turnsPerMinute: 30,
  callTimeoutMs: 60_000,
  maxOutputChars: 280,
  adapters: { mock: true, "claude-code": true, codex: true, grok: true, gemini: true, ollama: true },
};

