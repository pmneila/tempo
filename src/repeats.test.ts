import { afterEach, describe, expect, it, vi } from "vitest";
import {
  duplicate,
  flatten,
  loadRoutine,
  moveItem,
  total,
  valid,
  type Block,
  type Series,
} from "./model";
import { TimerEngine } from "./engine";
const series: Series = {
  id: "series",
  kind: "series",
  name: "Set",
  repeats: 3,
  intervals: [
    { id: "work", kind: "interval", name: "Work", seconds: 4 },
    { id: "rest", kind: "interval", name: "Rest", seconds: 2 },
  ],
};
const blocks: Block[] = [
  { id: "warm", kind: "interval", name: "Warm up", seconds: 1 },
  series,
  { id: "cool", kind: "interval", name: "Cool down", seconds: 5 },
];
afterEach(() => vi.unstubAllGlobals());
describe("series rounds", () => {
  it("plays complete rounds in order and includes them in totals", () => {
    const steps = flatten(blocks);
    expect(steps.map((i) => i.name)).toEqual([
      "Warm up",
      "Work",
      "Rest",
      "Work",
      "Rest",
      "Work",
      "Rest",
      "Cool down",
    ]);
    expect(steps.slice(1, 7).map((i) => i.round)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(steps[3].rounds).toBe(3);
    expect(total(blocks)).toBe(24);
    expect(total([series])).toBe(18);
    expect(valid(blocks)).toBe(true);
  });
  it("plays old series without a repeat count once", () => {
    const { repeats: _, ...old } = series;
    expect(flatten([old])).toHaveLength(2);
    expect(total([old])).toBe(6);
  });
  it.each([0, -1, 1.5, 100, Infinity, NaN])(
    "rejects invalid round count %s without expanding it",
    (repeats) => {
      const invalid = { ...series, repeats };
      expect(valid([invalid])).toBe(false);
      expect(flatten([invalid])).toHaveLength(0);
    },
  );
  it("supports the maximum count", () => {
    expect(valid([{ ...series, repeats: 99 }])).toBe(true);
    expect(flatten([{ ...series, repeats: 99 }])).toHaveLength(198);
  });
  it("preserves rounds when duplicating and moving series", () => {
    const copy = duplicate(series) as Series;
    expect(copy.repeats).toBe(3);
    expect(copy.intervals[0].id).not.toBe("work");
    const moved = moveItem(blocks, "series", "root-end");
    expect(moved.at(-1)).toEqual(series);
    expect(total(moved)).toBe(24);
  });
  it("advances into the next round and cues its boundary", () => {
    let now = 0;
    const cue = vi.fn();
    const engine = new TimerEngine(flatten(blocks), () => now, cue);
    engine.resume();
    now = 7000;
    engine.tick();
    expect(engine.index).toBe(3);
    expect(engine.steps[engine.index].round).toBe(2);
    expect(engine.remaining).toBe(4000);
    expect(cue).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("interval navigation crosses rounds while series navigation skips them", () => {
    const engine = new TimerEngine(flatten(blocks));
    engine.jump(2);
    engine.jump(engine.index + 1);
    expect(engine.steps[engine.index].round).toBe(2);
    expect(engine.seriesTarget(-1)).toBe(0);
    expect(engine.seriesTarget(1)).toBe(7);
    engine.jump(7);
    expect(engine.seriesTarget(-1)).toBe(1);
  });
  it("restarts the whole series at round one before going to the previous block", () => {
    const engine = new TimerEngine(flatten(blocks));
    engine.jump(5);
    expect(engine.steps[engine.index].round).toBe(3);
    expect(engine.previousTarget("interval")).toBe(4);
    expect(engine.previousTarget("series")).toBe(1);
    engine.back("series");
    expect(engine.steps[engine.index].round).toBe(1);
    expect(engine.remaining).toBe(4000);
    engine.back("series");
    expect(engine.index).toBe(0);
  });
  it("completes after every round and final standalone interval", () => {
    let now = 0;
    const engine = new TimerEngine(flatten(blocks), () => now);
    engine.resume();
    now = 19000;
    engine.tick();
    expect(engine.index).toBe(7);
    expect(engine.status).toBe("running");
    now = 24000;
    engine.tick();
    expect(engine.status).toBe("complete");
  });
  it("loads and persists rounds in the existing storage version", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ version: 1, blocks }),
    });
    expect(loadRoutine()).toEqual({ blocks });
  });
  it("rejects saved round counts outside the supported range", () => {
    vi.stubGlobal("localStorage", {
      getItem: () =>
        JSON.stringify({
          version: 1,
          blocks: [{ ...series, repeats: 1000000 }],
        }),
    });
    expect(loadRoutine().error).toBeTruthy();
  });
});
