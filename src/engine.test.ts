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
