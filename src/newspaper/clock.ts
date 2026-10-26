/**
 * In-game day counter. The base town has no clock, so a day is `dayMs` of unpaused real time,
 * advanced from the bus `tick` event. A `day` or `clock` event with a numeric `day` takes over.
 */
export class DayClock {
  day = 1;
  private ms = 0;
  private last = Date.now();
  private external = false;
  constructor(private dayMs: number) {}

  /** Call on every tick. Returns true when a new day (a morning) begins. */
  tick(paused: boolean, now = Date.now()): boolean {
    const dt = Math.min(now - this.last, 5_000);
    this.last = now;
    if (this.external || paused || (this.ms += dt) < this.dayMs) return false;
    this.ms = 0;
    this.day++;
    return true;
  }

  /** External day number from another feature. Returns true when it moved forward. */
  set(day: number): boolean {
    this.external = true;
    if (!Number.isFinite(day) || day <= this.day) return false;
    this.day = Math.floor(day);
    return true;
  }
}
