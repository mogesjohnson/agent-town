import { Adapter } from "../types.js";

const BASE = "http://localhost:11434";

/** Local Ollama over HTTP. Free and optional. */
export const ollama: Adapter = {
  id: "ollama",
  async detect() {
    try {
      const r = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(1500) });
      const j = (await r.json()) as { models?: { name: string }[] };
      return { available: r.ok, account: "local", models: j.models?.map((m) => m.name) };
    } catch { return { available: false }; }
  },
  async chat(req) {
    const r = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      signal: AbortSignal.timeout(req.timeoutMs),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: req.model ?? "llama3.2", stream: false, options: { num_predict: req.maxTokens },
        messages: [{ role: "system", content: req.system }, ...req.messages],
      }),
    });
    if (!r.ok) throw new Error(`ollama ${r.status}`);
    const j = (await r.json()) as { message?: { content?: string } };
    return j.message?.content ?? "";
  },
};
