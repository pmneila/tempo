import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TimerEngine, type Snapshot } from "./engine";
import { flatten, type Block } from "./model";
import { timelineLabel, timelineLayout, timelinePosition } from "./timeline";
import WorkoutTimeline from "./WorkoutTimeline";

const blocks: Block[] = [
  { id: "warm", kind: "interval", name: "Warm up", seconds: 10 },
  {
    id: "series",
    kind: "series",
    name: "Strength",
    repeats: 2,
    intervals: [
      { id: "work", kind: "interval", name: "Work", seconds: 30 },
      { id: "rest", kind: "interval", name: "Rest", seconds: 10 },
    ],
  },
  { id: "cool", kind: "interval", name: "Cool down", seconds: 10 },
];
const steps = flatten(blocks);
const layout = timelineLayout(steps);
const paused: Snapshot = { index: 0, remaining: 10000, status: "paused" };
describe("workout timeline geometry", () => {
  it("scales each occurrence to duration and spans the entire routine", () => {
    expect(layout.duration).toBe(100);
    expect(
      layout.segments.map((s) => Number((s.end - s.start).toFixed(2))),
    ).toEqual([0.1, 0.3, 0.1, 0.3, 0.1, 0.1]);
    expect(layout.segments[0].start).toBe(0);
    expect(layout.segments.at(-1)?.end).toBe(1);
    expect(new Set(layout.segments.map((s) => s.key)).size).toBe(6);
  });
  it("distinguishes intervals, rounds and top-level blocks", () => {
    expect(layout.segments.map((s) => s.boundary)).toEqual([
      "block",
      "block",
      "interval",
      "round",
      "interval",
      "block",
    ]);
    expect(layout.blocks).toEqual([
      { key: "warm", name: "Warm up", start: 0, end: 0.1 },
      { key: "series", name: "Strength", start: 0.1, end: 0.9 },
      { key: "cool", name: "Cool down", start: 0.9, end: 1 },
    ]);
  });
  it("moves within the active interval using exact remaining time", () => {
    expect(
      timelinePosition(layout.segments, {
        index: 1,
        remaining: 15000,
        status: "running",
      }),
    ).toBeCloseTo(0.25);
  });
  it("stays frozen while paused, follows jumps both ways, resets and completes", () => {
    let now = 0;
    const engine = new TimerEngine(steps, () => now);
    engine.resume();
    now = 3500;
    engine.tick();
    expect(timelinePosition(layout.segments, engine.snapshot())).toBeCloseTo(
      0.035,
    );
    engine.pause();
    now = 50000;
    engine.tick();
    expect(timelinePosition(layout.segments, engine.snapshot())).toBeCloseTo(
      0.035,
    );
    engine.jump(3);
    expect(timelinePosition(layout.segments, engine.snapshot())).toBe(0.5);
    engine.jump(1);
    expect(timelinePosition(layout.segments, engine.snapshot())).toBe(0.1);
    engine.reset();
    expect(timelinePosition(layout.segments, engine.snapshot())).toBe(0);
    engine.resume();
    now = 150000;
    engine.tick();
    expect(timelinePosition(layout.segments, engine.snapshot())).toBe(1);
  });
  it("handles one interval, empty input, and a dense routine without distorted proportions", () => {
    const one = timelineLayout([steps[0]]);
    expect(one.segments[0].end).toBe(1);
    expect(timelinePosition(one.segments, { ...paused, remaining: 5000 })).toBe(
      0.5,
    );
    expect(timelinePosition(timelineLayout([]).segments, paused)).toBe(0);
    const dense = timelineLayout(
      Array.from({ length: 1000 }, (_, i) => ({
        ...steps[0],
        id: String(i),
        seconds: 1,
      })),
    );
    expect(dense.segments).toHaveLength(1000);
    expect(dense.segments.at(-1)?.end).toBe(1);
    expect(
      dense.segments.every((s) => s.end > s.start && Number.isFinite(s.start)),
    ).toBe(true);
  });
  it("clamps elapsed position to the selected interval", () => {
    expect(
      timelinePosition(layout.segments, { ...paused, remaining: -1000 }),
    ).toBe(0.1);
    expect(
      timelinePosition(layout.segments, { ...paused, remaining: 20000 }),
    ).toBe(0);
  });
  it("omits labels that cannot fit and truncates long names", () => {
    expect(timelineLabel("Warm up", 30)).toBe("");
    expect(timelineLabel("Warm up", 100)).toBe("Warm up");
    expect(timelineLabel("A very long series name", 60)).toBe("A very …");
  });
});
describe("timeline presentation", () => {
  it("exposes current position and round accessibly, with per-occurrence tooltips", () => {
    const html = renderToStaticMarkup(
      <WorkoutTimeline
        steps={steps}
        snapshot={{ index: 3, remaining: 30000, status: "paused" }}
      />,
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain(
      "Paused. Interval 4 of 6: Work, Strength, round 2 of 2",
    );
    expect(html).toContain("Work · 00:30 · Strength · Round 2 of 2");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("NaN");
  });
  it("presents completion as fully passed", () => {
    const html = renderToStaticMarkup(
      <WorkoutTimeline
        steps={steps}
        snapshot={{ index: 5, remaining: 0, status: "complete" }}
      />,
    );
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain("Workout complete");
    expect(html).not.toContain("timeline-segment current");
    expect(html.match(/timeline-segment passed/g)).toHaveLength(6);
  });
});
