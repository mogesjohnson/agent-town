// HTTP handler for the season routes; registered by extension.ts.
import type { IncomingMessage, ServerResponse } from "node:http";
import { clearEvent, getActiveEvent, getEvents, getSource, getTopicHint, getVisuals, triggerEvent } from "./index.js";

function send(res: ServerResponse, status: number, o: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(o));
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((ok) => {
    let d = "";
    req.on("data", (c) => { d += c; if (d.length > 2_000) req.destroy(); });
    req.on("end", () => { try { const v = JSON.parse(d || "{}"); ok(v && typeof v === "object" ? v : {}); } catch { ok({}); } });
    req.on("error", () => ok({}));
  });
}

/** The season state as one JSON-safe object; `date` previews the date pick. */
export function seasonState(date: Date = new Date()) {
  const ev = getActiveEvent(date);
  return {
    source: getSource(),
    active: ev && { id: ev.id, name: ev.name, priority: ev.priority },
    topicHint: getTopicHint(date),
    visuals: getVisuals(date),
    events: getEvents().map((e) => ({ id: e.id, name: e.name, priority: e.priority, windows: e.windows })),
  };
}

/**
 * Handles the season routes and returns true, or returns false for any other path.
 * - GET  /api/season[?date=YYYY-MM-DD]  active event, hint, visuals and the event list
 * - POST /api/season  {"id":"halloween"} forces an event; {"id":null} clears the override
 * - POST /api/season/clear              clears the override
 */
export async function handleSeasonRequest(req: IncomingMessage, res: ServerResponse, onChange?: () => void): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/api/season" && url.pathname !== "/api/season/clear") return false;
  if (req.method === "GET" && url.pathname === "/api/season") {
    const q = url.searchParams.get("date");
    const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? new Date(`${q}T12:00:00`) : new Date();
    if (Number.isNaN(date.getTime())) { send(res, 400, { ok: false, error: "date must be YYYY-MM-DD" }); return true; }
    send(res, 200, seasonState(date));
    return true;
  }
  if (req.method !== "POST") { send(res, 405, { ok: false, error: "use GET or POST" }); return true; }
  const b = url.pathname === "/api/season/clear" ? { id: null } : await readJson(req);
  if (b.id === null || b.id === undefined || b.id === "") {
    clearEvent();
    console.log("[seasons] override cleared");
  } else if (!triggerEvent(String(b.id))) {
    send(res, 404, { ok: false, error: `unknown event "${String(b.id).slice(0, 60)}"` });
    return true;
  } else console.log(`[seasons] override: ${b.id}`);
  onChange?.();
  send(res, 200, { ok: true, ...seasonState() });
  return true;
}
