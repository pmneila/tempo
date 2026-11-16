import { describe, expect, it, vi } from "vitest";
import { Beeper, TimerEngine } from "./engine";
import { flatten, moveItem, valid, type Block } from "./model";
const blocks: Block[] = [
  { id: "warm", kind: "interval", name: "Warm up", seconds: 5 },
  {
    id: "set",
    kind: "series",
    name: "Set",
    intervals: [
      { id: "work", kind: "interval", name: "Work", seconds: 3 },
      { id: "rest", kind: "interval", name: "Rest", seconds: 1 },
    ],
  },
  { id: "cool", kind: "interval", name: "Cool down", seconds: 2 },
];
function setup() {
  let time = 0;
  const cue = vi.fn();
  const cancel = vi.fn();
  const engine = new TimerEngine(flatten(blocks), () => time, cue, cancel);
  return {
    engine,
    cue,
    cancel,
    at: (value: number) => {
      time = value;
      engine.tick();
    },
  };
}
describe("deadline timer", () => {
  it("preserves millisecond accuracy through pause and resume", () => {
    const { engine, at } = setup();
    engine.resume();
    at(1234);
    engine.pause();
    expect(engine.remaining).toBe(3766);
    at(9000);
    engine.resume();
    at(10000);
    expect(engine.remaining).toBe(2766);
  });
  it("cues at 3, 2, 1 and the transition, including short intervals", () => {
    const { engine, at, cue } = setup();
    engine.resume();
    at(2000);
    at(3000);
    at(4000);
    expect(cue.mock.calls).toEqual([[false], [false], [false]]);
    at(5000);
    expect(engine.index).toBe(1);
    expect(cue.mock.calls.slice(-2)).toEqual([[true], [false]]);
    at(6000);
    at(7000);
    at(8000);
    expect(engine.index).toBe(2);
    expect(cue.mock.calls.slice(-2)).toEqual([[true], [false]]);
  });
  it("beeps immediately for a three-second first interval", () => {
    let now = 0;
    const cue = vi.fn();
    const engine = new TimerEngine([flatten(blocks)[1]], () => now, cue);
    engine.resume();
    now = 20;
    engine.tick();
    expect(cue).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("catches up after interruption without replaying missed cues", () => {
    const { engine, at, cue } = setup();
    engine.resume();
    at(9500);
    expect(engine.index).toBe(3);
    expect(engine.remaining).toBe(1500);
    expect(cue).not.toHaveBeenCalled();
  });
  it("completes once and plays the final end cue", () => {
    const { engine, at, cue } = setup();
    engine.resume();
    at(11000);
    expect(engine.status).toBe("complete");
    expect(engine.remaining).toBe(0);
    expect(cue).toHaveBeenCalledExactlyOnceWith(true);
    at(12000);
    expect(cue).toHaveBeenCalledTimes(1);
  });
  it("navigates series using top-level block membership", () => {
    const { engine } = setup();
    expect(engine.seriesTarget(-1)).toBe(-1);
    expect(engine.seriesTarget(1)).toBe(1);
    engine.jump(2);
    expect(engine.seriesTarget(-1)).toBe(0);
    expect(engine.seriesTarget(1)).toBe(3);
    engine.jump(3);
    expect(engine.seriesTarget(-1)).toBe(1);
    expect(engine.seriesTarget(1)).toBe(-1);
  });
  it("resets destinations and preserves paused/running state", () => {
    const { engine, at, cancel } = setup();
    engine.jump(1);
    expect(engine.status).toBe("paused");
    expect(engine.remaining).toBe(3000);
    engine.resume();
    at(500);
    engine.jump(2);
    expect(engine.status).toBe("running");
    expect(engine.remaining).toBe(1000);
    at(1000);
    expect(engine.remaining).toBe(500);
    engine.pause();
    engine.jump(0);
    expect(engine.status).toBe("paused");
    expect(engine.remaining).toBe(5000);
    expect(cancel).toHaveBeenCalledTimes(4);
  });
  it("ignores invalid navigation and reset cancels audio", () => {
    const { engine, cancel } = setup();
    engine.jump(-1);
    engine.jump(999);
    expect(engine.index).toBe(0);
    engine.resume();
    engine.reset();
    expect(engine.snapshot()).toEqual({
      index: 0,
      remaining: 5000,
      status: "paused",
    });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
describe("routine editing", () => {
  it("keeps series membership in playback order", () => {
    expect(flatten(blocks).map((i) => i.blockId)).toEqual([
      "warm",
      "set",
      "set",
      "cool",
    ]);
  });
  it("moves intervals into, out of, and within series without losing them", () => {
    const inside = moveItem(blocks, "warm", "set");
    expect(flatten(inside).map((i) => i.id)).toEqual([
      "work",
      "rest",
      "warm",
      "cool",
    ]);
    const reordered = moveItem(inside, "warm", "work");
    expect(flatten(reordered).map((i) => i.id)).toEqual([
      "warm",
      "work",
      "rest",
      "cool",
    ]);
    const outside = moveItem(reordered, "warm", "root-end");
    expect(outside.at(-1)?.id).toBe("warm");
    expect(flatten(outside)).toHaveLength(4);
  });
  it("moves a whole series and refuses nesting a series in an interval", () => {
    expect(moveItem(blocks, "set", "warm")[0].id).toBe("set");
    expect(moveItem(blocks, "set", "work")).toBe(blocks);
  });
  it("rejects empty routines, empty series, zero and fractional durations", () => {
    expect(valid(blocks)).toBe(true);
    expect(valid([])).toBe(false);
    expect(valid([{ id: "s", kind: "series", name: "", intervals: [] }])).toBe(
      false,
    );
    expect(
      valid([{ ...blocks[0], kind: "interval", seconds: 0 } as Block]),
    ).toBe(false);
    expect(
      valid([{ ...blocks[0], kind: "interval", seconds: 1.5 } as Block]),
    ).toBe(false);
  });
});
describe("audio cancellation", () => {
  it("stops all pending oscillators when cancelled", () => {
    const sound = new Beeper();
    const a = { stop: vi.fn() };
    const b = { stop: vi.fn() };
    sound.nodes.add(a as unknown as OscillatorNode);
    sound.nodes.add(b as unknown as OscillatorNode);
    sound.cancel();
    expect(a.stop).toHaveBeenCalledOnce();
    expect(b.stop).toHaveBeenCalledOnce();
    expect(sound.nodes.size).toBe(0);
  });
  it("does not generate sounds while muted or suspended", () => {
    const sound = new Beeper();
    const create = vi.fn();
    sound.context = {
      state: "suspended",
      createOscillator: create,
    } as unknown as AudioContext;
    sound.play(false);
    sound.context = {
      state: "running",
      createOscillator: create,
    } as unknown as AudioContext;
    sound.muted = true;
    sound.play(true);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("back navigation", () => {
  it.each([0, 1999, 2000, 2001])(
    "uses the two-second interval boundary at %i ms",
    (elapsed) => {
      const { engine, at, cancel } = setup();
      engine.jump(1);
      engine.resume();
      at(elapsed);
      cancel.mockClear();
      expect(engine.previousTarget("interval")).toBe(elapsed > 2000 ? 1 : 0);
      engine.back("interval");
      expect(engine.snapshot()).toEqual({
        index: elapsed > 2000 ? 1 : 0,
        remaining: elapsed > 2000 ? 3000 : 5000,
        status: "running",
      });
      expect(cancel).toHaveBeenCalledOnce();
      engine.back("interval");
      expect(engine.index).toBe(0);
    },
  );
  it.each(["interval", "series"] as const)(
    "allows restarting the first %s only after two seconds",
    (scope) => {
      const { engine, at } = setup();
      expect(engine.previousTarget(scope)).toBe(-1);
      engine.resume();
      at(2000);
      expect(engine.previousTarget(scope)).toBe(-1);
      at(2001);
      expect(engine.previousTarget(scope)).toBe(0);
      engine.back(scope);
      expect(engine.remaining).toBe(5000);
      expect(engine.previousTarget(scope)).toBe(-1);
    },
  );
  it.each(["interval", "series"] as const)(
    "preserves paused time and status for %s navigation",
    (scope) => {
      const { engine, at } = setup();
      engine.jump(1);
      engine.resume();
      at(2200);
      engine.pause();
      at(100000);
      engine.back(scope);
      expect(engine.snapshot()).toEqual({
        index: 1,
        remaining: 3000,
        status: "paused",
      });
      engine.back(scope);
      expect(engine.snapshot()).toEqual({
        index: 0,
        remaining: 5000,
        status: "paused",
      });
    },
  );
  it("uses total series position even at the beginning of a later interval", () => {
    const { engine } = setup();
    engine.jump(2);
    expect(engine.previousTarget("interval")).toBe(1);
    expect(engine.previousTarget("series")).toBe(1);
    engine.back("series");
    expect(engine.remaining).toBe(3000);
    engine.back("series");
    expect(engine.index).toBe(0);
  });
  it.each(["interval", "series"] as const)(
    "resolves the live deadline for %s without replaying missed sounds",
    (scope) => {
      let now = 0;
      const cue = vi.fn();
      const cancel = vi.fn();
      const engine = new TimerEngine(flatten(blocks), () => now, cue, cancel);
      engine.resume();
      now = 2001;
      expect(engine.previousTarget(scope)).toBe(0);
      now = 7200;
      engine.back(scope);
      expect(engine.snapshot()).toEqual({
        index: 1,
        remaining: 3000,
        status: "running",
      });
      expect(cue).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
    },
  );
  it("handles short intervals and keeps completion controls disabled", () => {
    const { engine, at } = setup();
    engine.jump(2);
    engine.resume();
    at(500);
    engine.back("interval");
    expect(engine.index).toBe(1);
    at(10000);
    expect(engine.status).toBe("complete");
    const completed = engine.snapshot();
    for (const scope of ["interval", "series"] as const) {
      expect(engine.previousTarget(scope)).toBe(-1);
      engine.back(scope);
      expect(engine.snapshot()).toEqual(completed);
    }
    const empty = new TimerEngine([]);
    expect(empty.previousTarget("interval")).toBe(-1);
    expect(empty.previousTarget("series")).toBe(-1);
  });
});

describe("relative time seeking", () => {
  const seekBlocks: Block[] = [
    { id: "first", kind: "interval", name: "First", seconds: 20 },
    {
      id: "series",
      kind: "series",
      name: "Series",
      repeats: 2,
      intervals: [
        { id: "long", kind: "interval", name: "Long", seconds: 7 },
        { id: "short", kind: "interval", name: "Short", seconds: 3 },
      ],
    },
    { id: "last", kind: "interval", name: "Last", seconds: 20 },
  ];
  function seeking() {
    let now = 0;
    const cue = vi.fn();
    const cancel = vi.fn();
    const engine = new TimerEngine(flatten(seekBlocks), () => now, cue, cancel);
    return {
      engine,
      cue,
      cancel,
      clock: (value: number) => {
        now = value;
      },
    };
  }
  it.each(["running", "paused"] as const)(
    "preserves fractional time and %s state",
    (status) => {
      const { engine, clock, cancel } = seeking();
      engine.resume();
      clock(1234);
      if (status === "paused") {
        engine.pause();
        clock(100000);
      }
      engine.seekBy(10);
      expect(engine.snapshot()).toEqual({ index: 0, remaining: 8766, status });
      engine.seekBy(-10);
      expect(engine.snapshot()).toEqual({ index: 0, remaining: 18766, status });
      expect(cancel).toHaveBeenCalledTimes(status === "paused" ? 3 : 2);
    },
  );
  it("keeps the new deadline accurate through pause and resume", () => {
    const { engine, clock } = seeking();
    engine.resume();
    clock(1234);
    engine.seekBy(10);
    clock(2000);
    engine.pause();
    expect(engine.remaining).toBe(8000);
    clock(9000);
    engine.resume();
    clock(10000);
    engine.tick();
    expect(engine.remaining).toBe(7000);
  });
  it("selects the next occurrence at exact interval, round and series boundaries", () => {
    const { engine } = seeking();
    for (const [delta, index, remaining] of [
      [20, 1, 7000],
      [7, 2, 3000],
      [3, 3, 7000],
      [10, 5, 20000],
      [-10, 3, 7000],
      [-10, 1, 7000],
      [-20, 0, 20000],
    ]) {
      engine.seekBy(delta);
      expect(engine.snapshot()).toEqual({ index, remaining, status: "paused" });
    }
  });
  it("crosses multiple short intervals in one jump and clamps at the beginning", () => {
    const { engine } = seeking();
    engine.seekBy(24);
    engine.seekBy(10);
    expect(engine.index).toBe(3);
    expect(engine.steps[engine.index].round).toBe(2);
    expect(engine.remaining).toBe(3000);
    engine.seekBy(-10);
    expect(engine.snapshot()).toEqual({
      index: 1,
      remaining: 3000,
      status: "paused",
    });
    engine.seekBy(-100);
    expect(engine.snapshot()).toEqual({
      index: 0,
      remaining: 20000,
      status: "paused",
    });
    engine.seekBy(-10);
    expect(engine.remaining).toBe(20000);
  });
  it.each(["running", "paused"] as const)(
    "completes silently when seeking to the end while %s",
    (status) => {
      const { engine, clock, cue, cancel } = seeking();
      if (status === "running") engine.resume();
      engine.seekBy(50);
      engine.seekBy(10);
      expect(engine.snapshot()).toEqual({
        index: 5,
        remaining: 0,
        status: "complete",
      });
      engine.seekBy(-10);
      clock(100000);
      engine.tick();
      expect(engine.status).toBe("complete");
      expect(cue).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledTimes(2);
      engine.reset();
      engine.resume();
      expect(engine.snapshot()).toEqual({
        index: 0,
        remaining: 20000,
        status: "running",
      });
    },
  );
  it("clamps overshoot at completion, including a single short interval", () => {
    const engine = new TimerEngine([flatten(blocks)[2]]);
    engine.seekBy(10);
    expect(engine.snapshot()).toEqual({
      index: 0,
      remaining: 0,
      status: "complete",
    });
  });
  it("uses live elapsed time after delayed callbacks without replaying cues", () => {
    const { engine, clock, cue } = seeking();
    engine.resume();
    clock(33000);
    engine.seekBy(10);
    expect(engine.snapshot()).toEqual({
      index: 5,
      remaining: 17000,
      status: "running",
    });
    engine.seekBy(-10);
    expect(engine.snapshot()).toEqual({
      index: 3,
      remaining: 4000,
      status: "running",
    });
    expect(cue).not.toHaveBeenCalled();
  });
  it("does not replay landing-point cues but plays subsequent natural cues", () => {
    const { engine, clock, cue, cancel } = seeking();
    engine.resume();
    engine.seekBy(17);
    engine.tick();
    expect(cue).not.toHaveBeenCalled();
    for (const now of [1000, 2000, 3000]) {
      clock(now);
      engine.tick();
    }
    expect(cue.mock.calls).toEqual([[false], [false], [true]]);
    expect(cancel).toHaveBeenCalledOnce();
    expect(engine.index).toBe(1);
  });
  it("keeps backward navigation based on the new interval and series position", () => {
    const { engine } = seeking();
    engine.seekBy(34);
    expect(engine.previousTarget("interval")).toBe(3);
    expect(engine.previousTarget("series")).toBe(1);
    engine.back("series");
    expect(engine.remaining).toBe(7000);
    engine.back("series");
    expect(engine.index).toBe(0);
  });
  it("ignores empty timelines and non-finite offsets", () => {
    const { engine, cancel } = seeking();
    for (const delta of [NaN, Infinity, -Infinity]) engine.seekBy(delta);
    expect(engine.snapshot()).toEqual({
      index: 0,
      remaining: 20000,
      status: "paused",
    });
    expect(cancel).not.toHaveBeenCalled();
    const empty = new TimerEngine([]);
    empty.seekBy(10);
    expect(empty.snapshot()).toEqual({
      index: 0,
      remaining: 0,
      status: "paused",
    });
  });
});
