import { Adapter } from "../types.js";
import { flatten, resolveCli, runCli } from "./util.js";

/** Official Claude Code CLI in print mode, prompt on stdin, all tools disabled. */
export const claudeCode: Adapter = {
  id: "claude-code",
  async detect() {
    const bin = resolveCli("claude");
    return bin ? { available: true, account: "claude login", models: ["sonnet", "opus", "haiku"] } : { available: false };
  },
  async chat(req) {
    const bin = resolveCli("claude");
    if (!bin) throw new Error("claude not found");
    const args = ["-p", "--output-format", "text", "--allowedTools", "",
      "--disallowedTools", "Bash", "Edit", "Write", "Read", "WebFetch", "WebSearch", "--max-turns", "1"];
    if (req.model) args.push("--model", req.model);
    return runCli(bin, args, flatten(req), req.timeoutMs);
  },
};
