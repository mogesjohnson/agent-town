import { test } from "node:test";
import { strict as assert } from "node:assert";
import { RadioStation } from "./extension.js";
import { readRadioConfig } from "./types.js";

const brief = { agents: ["Ada", "Ben"], events: [
  { t: 1, from: "You", to: "All", text: "private visitor message" },
  { t: 2, from: "Ada", to: "Ben", text: "Hello neighbor!" },
], weather: { weather: "sunny", eventName: "Harvest Day" } };
test("station makes a capped offline segment from actual town activity", () => {
  const station = new RadioStation(readRadioConfig({ provider: "mock" }), 0);
  const segment = station.tick(0, false, brief)!;
  assert.equal(segment.source, "template");
  assert.equal(segment.lines.length, 4);
  assert.match(segment.lines.join(" "), /Ada to Ben: Hello neighbor!/);
  assert.match(segment.lines.join(" "), /sunny.*Harvest Day/);
  assert.doesNotMatch(segment.lines.join(" "), /private visitor/);
  assert.ok(segment.lines.every((s) => s.length <= 160));
});
test("schedule freezes while paused, resumes once per interval and bounds history", () => {
  const station = new RadioStation(readRadioConfig({ segmentEveryHours: 1, realSecondsPerGameHour: 1 }), 0);
  station.tick(0, false, brief);
  assert.equal(station.tick(10_000, true, brief), undefined);
  assert.equal(station.tick(10_500, false, brief), undefined);
  assert.equal(station.tick(11_000, false, brief)?.hour, 9);
  assert.equal(station.tick(11_000, false, brief), undefined);
  for (let i = 12; i < 40; i++) station.tick(i * 1000, false, brief);
  assert.equal(station.segments.length, 12);
});
test("disabled radio creates no segments", () => {
  const station = new RadioStation(readRadioConfig({ enabled: false }), 0);
  assert.equal(station.tick(100_000, false, brief), undefined);
  assert.equal(station.segments.length, 0);
});
