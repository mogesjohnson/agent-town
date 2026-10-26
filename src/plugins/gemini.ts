import { Adapter } from "../types.js";
import { flatten, resolveCli, runCli } from "./util.js";

/** Best effort: official Gemini CLI, non-interactive -p with the prompt on stdin. */
export const gemini: Adapter = {
  id: "gemini",
  async detect() { return resolveCli("gemini") ? { available: true, account: "gemini login" } : { available: false }; },
  async chat(req) {
    const bin = resolveCli("gemini");
    if (!bin) throw new Error("gemini not found");
    const args = ["-p", ""];
    if (req.model) args.push("-m", req.model);
    return runCli(bin, args, flatten(req), req.timeoutMs);
  },
};
