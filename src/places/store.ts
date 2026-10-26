/** On/off state and custom places, saved atomically to .runtime/places.json (git-ignored local state). */
import type { Place } from "./catalog.js";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const STATE_PATH = ".runtime/places.json";
/** Sensible default set: four everyday shops and the three spots the town already has. */
export const DEFAULT_ENABLED = ["bakery", "cafe", "diner", "flower-shop", "library", "park"];

export class EnabledStore {
  private on: Set<string>;
  /** Places created over the API; `accept` re-validates them on load and drops bad ones. */
  readonly custom: Place[] = [];

  constructor(private known: string[], private path = STATE_PATH, accept: (raw: unknown[]) => Place[] = () => []) {
    this.on = new Set(DEFAULT_ENABLED.filter((id) => known.includes(id)));
    if (!existsSync(path)) return;
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      this.custom.push(...accept(Array.isArray(raw?.custom) ? raw.custom : []));
      known.push(...this.custom.map((p) => p.id));
      if (Array.isArray(raw?.enabled)) this.on = new Set(raw.enabled.filter((id: unknown) => known.includes(id as string)));
    } catch { console.error(`[places] ignoring unreadable ${path}`); }
  }

  isEnabled(id: string) { return this.on.has(id); }
  enabledIds() { return this.known.filter((id) => this.on.has(id)); }

  /** Returns false for an unknown id. Saves on every change. */
  set(id: string, enabled: boolean): boolean {
    if (!this.known.includes(id)) return false;
    if (enabled) this.on.add(id); else this.on.delete(id);
    this.save();
    return true;
  }

  /** Add a custom place (enabled) and save. */
  addCustom(p: Place) { this.custom.push(p); this.known.push(p.id); this.on.add(p.id); this.save(); }

  /** Remove a custom place and save. Returns false if `id` is not custom. */
  removeCustom(id: string): boolean {
    const i = this.custom.findIndex((p) => p.id === id);
    if (i < 0) return false;
    this.custom.splice(i, 1); this.known.splice(this.known.indexOf(id), 1); this.on.delete(id); this.save();
    return true;
  }

  private save() {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify({ version: 1, enabled: this.enabledIds(), custom: this.custom }, null, 2) + "\n", "utf8");
      renameSync(tmp, this.path);
    } catch (e) { console.error(`[places] could not save ${this.path}: ${(e as Error).message}`); }
  }
}
