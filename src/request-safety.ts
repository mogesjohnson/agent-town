import type { IncomingMessage } from "node:http";

export class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
/** Local UI and non-browser loopback clients only. Runs before extension handlers too. */
export function checkLocalRequest(req: IncomingMessage) {
  const host = req.headers.host ?? "";
  let target: URL;
  try { target = new URL(`http://${host}`); }
  catch { throw new RequestError(403, "invalid host"); }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
    || target.host !== host || target.username || target.password
    || Number(target.port || 80) !== req.socket.localPort)
    throw new RequestError(403, "loopback host required");
  const mutates = !["GET", "HEAD", "OPTIONS"].includes(req.method ?? "GET");
  if (!mutates) return;
  const origin = req.headers.origin;
  if ((origin && origin !== target.origin) || req.headers["sec-fetch-site"] === "cross-site")
    throw new RequestError(403, "same-origin request required");
  if (["POST", "PUT", "PATCH"].includes(req.method ?? "")
    && !/^application\/json(?:\s*;|\s*$)/i.test(req.headers["content-type"] ?? ""))
    throw new RequestError(415, "application/json required");
}

/** Reject bad bodies rather than coercing them to an empty command. Drain oversized input. */
export async function readObject(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += Buffer.byteLength(chunk);
    if (bytes <= 10_000) chunks.push(Buffer.from(chunk));
  }
  if (bytes > 10_000) throw new RequestError(413, "request body too large");
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw new RequestError(400, "invalid JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RequestError(400, "JSON object required");
  return value as Record<string, unknown>;
}
