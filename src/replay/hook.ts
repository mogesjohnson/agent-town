// Opt-in live recording. src/server.ts calls attachRecorder only when AGENT_TOWN_RECORD is set.
// The recorder joins the SSE client set as a write-only sink, so it sees exactly what a
// browser tab sees (state, say, minigame, scoreboard) and nothing else.
import { Recorder } from "./recorder.js";

type Sink = { write(chunk: string): boolean };

export function attachRecorder(clients: Set<unknown>, path: string, snapshot: () => unknown) {
  const rec = new Recorder(path, { seed: null, source: "server" });
  rec.record("state", snapshot());
  const sink: Sink = {
    write(chunk: string) {
      for (const block of chunk.split("\n\n")) {
        const ev = /^event: (\w+)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (!ev || !data) continue;
        try { rec.record(ev, JSON.parse(data)); } catch { /* skip malformed */ }
      }
      return true;
    },
  };
  clients.add(sink);
  const stop = () => { clients.delete(sink); void rec.close().then(() => process.exit(0)); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log(`[replay] recording to ${path}`);
}
