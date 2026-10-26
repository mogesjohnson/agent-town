// Ops for custom places (POST /api/places, DELETE /api/places/:id from the places feature, PR #24).
// The places routes check everything again (fit, overlap, ids); these add dryRun and undo info.
import type { Args } from "./schema.js";
import { OpError, type Run, type Self } from "./ops.js";

type Place = { id: string; name: string; type: string; x: number; y: number; w: number; h: number; enabled: boolean;
  custom?: boolean; hours: { open: number; close: number }; vibe: string; items: string[]; topics: string[] };
type Body = Omit<Place, "enabled" | "custom">;

const NA = "custom places are not available on this town (needs POST/DELETE /api/places, PR #24)";

export function placeOps(self: Self): Record<string, Run> {
  const types = async (): Promise<{ type: string; w: number; h: number }[]> => {
    try { return (await self("/api/places/types")).types; } catch (e) { throw e instanceof OpError && e.status === 404 ? new OpError(NA, 404) : e; }
  };
  const places = async (): Promise<Place[]> => (await self("/api/places")).places ?? [];
  const body = ({ id, name, type, x, y, w, h, hours, vibe, items, topics }: Place): Body => ({ id, name, type, x, y, w, h, hours, vibe, items, topics });

  return {
    "place.add": async (a: Args<"place.add">, dry) => {
      const list = await types();
      if (!list.some((t) => t.type === a.type)) throw new OpError(`unknown place type ${a.type}; types: ${list.map((t) => t.type).join(", ")}`);
      if (a.x === undefined || a.y === undefined) throw new OpError("give x and y");
      if (a.id && (await places()).some((p) => p.id === a.id)) throw new OpError(`id ${a.id} is taken`, 409);
      if (dry) return { before: null, after: { ...a, note: "fit and overlap are checked when applied" }, revert: { op: "place.remove", args: { id: a.id } } };
      const { place } = await self("/api/places", a);
      return { before: null, after: place, revert: { op: "place.remove", args: { id: place.id } } };
    },
    "place.remove": async (a: Args<"place.remove">, dry) => {
      await types();
      const p = (await places()).find((x) => x.id === a.id);
      if (!p) throw new OpError(`unknown place "${a.id}"`, 404);
      if (!p.custom) throw new OpError(`${a.id} is a built-in place and cannot be removed; close it with toggle_place`, 403);
      if (!dry) await self(`/api/places/${encodeURIComponent(a.id)}`, undefined, "DELETE");
      return { before: p, after: null, revert: { op: "place.restore", args: { place: body(p), enabled: p.enabled } } };
    },
    /** Undo of remove_place: re-creates the place with its old id; 409 if that id or spot was taken since. */
    "place.restore": async ({ place, enabled }: { place: Body; enabled: boolean }, dry) => {
      const revert = { op: "place.remove", args: { id: place.id } };
      if (dry) return { before: null, after: place, revert };
      let r;
      try { r = await self("/api/places", place); } catch (e) {
        throw e instanceof OpError ? new OpError(`cannot restore place ${place.id}: ${e.message}`, e.status) : e;
      }
      if (!enabled) await self("/api/places/toggle", { id: place.id, enabled: false });
      return { before: null, after: r.place, revert };
    },
  };
}
