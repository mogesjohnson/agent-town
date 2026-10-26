import test from "node:test";
import assert from "node:assert/strict";
import { emptyUsage, recordUsage } from "./token-usage.js";
const req = { system: "1234", messages: [{ role: "user" as const, content: "5678" }], maxTokens: 120, timeoutMs: 100 };

test("reported and estimated counts remain separate and use full response", () => {
  const u = emptyUsage();
  recordUsage(u, "ollama", req, "reply", { inputTokens: 47, outputTokens: 6 });
  recordUsage(u, "codex", req, "12345678");
  assert.equal(u.reportedInput, 47); assert.equal(u.reportedOutput, 6);
  assert.equal(u.estimatedInput, 3); assert.equal(u.estimatedOutput, 2);
  assert.equal(u.completedTurns, 2); assert.equal(u.lastTurn?.source, "estimated");
});
test("mock is zero, invalid reporting becomes an explicit estimate", () => {
  const u = emptyUsage();
  recordUsage(u, "mock", req, "long canned reply", { inputTokens: 100, outputTokens: 4 });
  assert.deepEqual(u.lastTurn, { source: "mock", inputTokens: 0, outputTokens: 0 });
  assert.equal(u.mockTurns, 1);
  recordUsage(u, "ollama", req, "text", { inputTokens: -1, outputTokens: NaN });
  assert.equal(u.lastTurn?.source, "estimated");
});
