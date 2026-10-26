// Loopback-only HTTP client for the town server. The MCP server never touches files itself.

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Town server base URL from AGENT_TOWN_URL or AGENT_TOWN_PORT; throws on a non-loopback host. */
export function townUrl(env = process.env): URL {
  const raw = env.AGENT_TOWN_URL ?? `http://127.0.0.1:${env.AGENT_TOWN_PORT ?? "4317"}`;
  const url = new URL(raw);
  if (url.protocol !== "http:") throw new Error(`AGENT_TOWN_URL must be http://, got ${url.protocol}`);
  if (!LOOPBACK.has(url.hostname)) throw new Error(`refusing non-loopback town host "${url.hostname}"`);
  return url;
}

export type Reply = { ok: true; data: unknown } | { ok: false; unavailable: true; reason: string };

/** GET or POST JSON. A missing route, a non-JSON page or a stopped server is "unavailable", never a throw. */
export async function call(base: URL, path: string, body?: unknown): Promise<Reply> {
  const init: RequestInit = { signal: AbortSignal.timeout(5_000), redirect: "error" };
  if (body !== undefined) {
    init.method = "POST";
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(new URL(path, base), init);
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { return { ok: false, unavailable: true, reason: `${path}: not available on this town (HTTP ${res.status})` }; }
    if (!res.ok) return { ok: false, unavailable: true, reason: `${path}: HTTP ${res.status} ${JSON.stringify(data).slice(0, 300)}` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, unavailable: true, reason: `town server not reachable at ${base.origin} (${(e as Error).message}); start it with npm start` };
  }
}
