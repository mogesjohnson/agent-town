import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatRequest } from "../types.js";

/** Resolve a CLI on PATH. On Windows, prefer the .cmd/.exe shim reported by `where`. */
export function resolveCli(name: string): string | null {
  try {
    const finder = process.platform === "win32" ? "where" : "which";
    const out = execFileSync(finder, [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], shell: false });
    const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (process.platform === "win32") return lines.find((l) => /\.(cmd|exe)$/i.test(l)) ?? lines[0] ?? null;
    return lines[0] ?? null;
  } catch { return null; }
}

/** Flatten a system prompt and messages into one plain-text prompt for CLIs. */
export function flatten(req: ChatRequest): string {
  const convo = req.messages.map((m) => `${m.role === "user" ? "Them" : "You"}: ${m.content}`).join("\n");
  return `${req.system}\n\nConversation so far:\n${convo}\n\nYour next line:`;
}

/**
 * Run a CLI with an argument array (never a shell string) in a fresh empty temp dir.
 * stdout is captured and capped; stderr is discarded so tokens are never printed.
 */
export function runCli(cmd: string, args: string[], stdin: string, timeoutMs: number): Promise<string> {
  const cwd = mkdtempSync(join(tmpdir(), "agent-town-"));
  // .cmd shims cannot be spawned without a shell on Windows; run them via cmd.exe with an arg array.
  const isCmd = process.platform === "win32" && /\.cmd$/i.test(cmd);
  const file = isCmd ? (process.env.ComSpec ?? "cmd.exe") : cmd;
  const argv = isCmd ? ["/d", "/s", "/c", cmd, ...args] : args;
  return new Promise((resolve, reject) => {
    const child = spawn(file, argv, { cwd, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("timeout")); }, timeoutMs);
    child.stdout.on("data", (d) => { if (out.length < 8000) out += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      try { rmSync(cwd, { recursive: true, force: true }); } catch { /* ignore */ }
      code === 0 ? resolve(out.trim()) : reject(new Error(`exit ${code}`));
    });
    child.stdin.end(stdin);
  });
}
