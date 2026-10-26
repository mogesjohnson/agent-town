import { Adapter } from "../types.js";
import { flatten, resolveCli, runCli } from "./util.js";

/** Best effort: official grok CLI in headless prompt mode (-p), if on PATH. */
export const grok: Adapter = {
  id: "grok",
  async detect() { return resolveCli("grok") ? { available: true, account: "grok login" } : { available: false }; },
  async chat(req) {
    const bin = resolveCli("grok");
    if (!bin) throw new Error("grok not found");
    const args = ["-p", flatten(req)];
    if (req.model) args.push("--model", req.model);
    return runCli(bin, args, "", req.timeoutMs);
  },
};
