import { Adapter } from "../types.js";
import { flatten, resolveCli, runCli } from "./util.js";

/** Official Codex CLI, non-interactive exec in a read-only sandbox, prompt on stdin ("-"). */
export const codex: Adapter = {
  id: "codex",
  async detect() {
    return resolveCli("codex") ? { available: true, account: "codex login" } : { available: false };
  },
  async chat(req) {
    const bin = resolveCli("codex");
    if (!bin) throw new Error("codex not found");
    const args = ["exec", "--sandbox", "read-only", "--skip-git-repo-check"];
    if (req.model) args.push("--model", req.model);
    args.push("-");
    const out = await runCli(bin, args, flatten(req), req.timeoutMs);
    return out.split(/\r?\n/).filter(Boolean).pop() ?? "";
  },
};
