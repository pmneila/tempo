import { afterEach, describe, expect, it, vi } from "vitest";
import {
  duplicate,
  flatten,
  loadRoutine,
  STORAGE_KEY,
  type Block,
} from "./model";
afterEach(() => vi.unstubAllGlobals());
const saved: Block[] = [
  {
    id: "series",
    kind: "series",
    name: "Legs",
    intervals: [{ id: "squat", kind: "interval", name: "Squat", seconds: 45 }],
  },
];
describe("saved routines", () => {
  it("restores the exact versioned routine", () => {
    const getItem = vi.fn(() => JSON.stringify({ version: 1, blocks: saved }));
    vi.stubGlobal("localStorage", { getItem });
    expect(loadRoutine()).toEqual({ blocks: saved });
    expect(getItem).toHaveBeenCalledWith(STORAGE_KEY);
  });
  it("preserves an intentionally empty routine", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => '{"version":1,"blocks":[]}',
    });
    expect(loadRoutine()).toEqual({ blocks: [] });
  });
  it.each([
    "broken json",
    '{"version":2,"blocks":[]}',
    '{"version":1,"blocks":[{"id":"x","kind":"interval","name":"Test","seconds":-1}]}',
    JSON.stringify({ version: 1, blocks: [saved[0], saved[0]] }),
  ])("handles corrupt or incompatible data without crashing", (raw) => {
    vi.stubGlobal("localStorage", { getItem: () => raw });
    const loaded = loadRoutine();
    expect(loaded.blocks).toEqual([]);
    expect(loaded.error).toBeTruthy();
  });
  it("handles blocked browser storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw Error("Storage blocked");
      },
    });
    expect(loadRoutine().error).toBeTruthy();
  });
  it("duplicates an entire series with fresh IDs", () => {
    const copy = duplicate(saved[0]);
    expect(copy.id).not.toBe(saved[0].id);
    expect(flatten([copy])[0].id).not.toBe("squat");
    expect(flatten([copy])[0].seconds).toBe(45);
  });
});
