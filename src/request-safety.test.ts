import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { checkLocalRequest, readObject, RequestError } from "./request-safety.js";
const request = (headers = {}, method = "POST") => ({ method,
  socket: { localPort: 4317 }, headers: { host: "localhost:4317", "content-type": "application/json", ...headers } }) as IncomingMessage;
const status = (n: number) => (e: unknown) => e instanceof RequestError && e.status === n;
test("local UI and Origin-free MCP JSON requests are allowed", () => {
  checkLocalRequest(request());
  checkLocalRequest(request({ origin: "http://localhost:4317" }));
  checkLocalRequest(request({ host: "127.0.0.1:4317" }));
  checkLocalRequest(request({}, "DELETE"));
});
test("cross-origin browser commands, DNS rebinding and simple form posts are rejected", () => {
  for (const headers of [{ origin: "https://evil.example" }, { origin: "null" },
    { "sec-fetch-site": "cross-site" }, { host: "evil.example:4317" },
    { host: "localhost:80" }, { host: "localhost:4317@evil.example" }])
    assert.throws(() => checkLocalRequest(request(headers)), status(403));
  assert.throws(() => checkLocalRequest(request({ "content-type": "text/plain" })), status(415));
});
test("body parsing rejects malformed, scalar, array and oversized inputs", async () => {
  const body = (s: string) => Readable.from([Buffer.from(s)]) as IncomingMessage;
  for (const s of ["null", "[]", "true", "0", '"text"', "{"])
    await assert.rejects(readObject(body(s)), status(400));
  await assert.rejects(readObject(body('"' + "x".repeat(10_000) + '"')), status(413));
  assert.deepEqual(await readObject(body('{"paused":false}')), { paused: false });
});
