import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteTimeline,
  duplicateTimeline,
  emptyDraft,
  exportTimeline,
  importTimeline,
  isDirty,
  LIBRARY_KEY,
  loadLibrary,
  loadTimeline,
  MAX_IMPORT_BYTES,
  newTimeline,
  parseLibrary,
  persistLibrary,
  renameDraft,
  saveDraft,
  type Library,
} from "./library";
import { STORAGE_KEY, type Block } from "./model";
const blocks: Block[] = [
  { id: "warm", name: "Warm up", kind: "interval", seconds: 10 },
  {
    id: "set",
    name: "Set",
    kind: "series",
    repeats: 3,
    intervals: [{ id: "work", name: "Work", kind: "interval", seconds: 30 }],
  },
];
function firstInterval(blocks: Block[]) {
  const block = blocks[0];
  if (block.kind !== "interval") throw Error("Expected interval");
  return block;
}
function fixture(): Library {
  return loadTimeline(
    {
      version: 2,
      timelines: [
        { id: "one", name: "Workout", blocks: structuredClone(blocks) },
        { id: "two", name: "Other", blocks: [] },
      ],
      draft: emptyDraft(),
    },
    "one",
  );
}
function edited(): Library {
  const state = fixture();
  firstInterval(state.draft.blocks).seconds = 55;
  return state;
}
afterEach(() => vi.unstubAllGlobals());
describe("working draft and saved originals", () => {
  it("loads an independent working copy without sharing nested interval objects", () => {
    const state = fixture();
    expect(isDirty(state)).toBe(false);
    firstInterval(state.draft.blocks).seconds = 22;
    const series = state.draft.blocks[1];
    if (series.kind === "series") series.intervals[0].seconds = 99;
    expect(state.timelines[0].blocks).toEqual(blocks);
    expect(isDirty(state)).toBe(true);
  });
  it("saves an edited draft only to its original and clears dirty status", () => {
    const original = edited();
    const saved = saveDraft(original);
    expect(firstInterval(saved.timelines[0].blocks).seconds).toBe(55);
    expect(firstInterval(original.timelines[0].blocks).seconds).toBe(10);
    expect(saved.timelines[1]).toEqual(original.timelines[1]);
    expect(saved.draft.sourceId).toBe("one");
    expect(isDirty(saved)).toBe(false);
    firstInterval(saved.draft.blocks).seconds = 88;
    expect(firstInterval(saved.timelines[0].blocks).seconds).toBe(55);
  });
  it("Save as new keeps the original, gives items fresh IDs and selects the variation", () => {
    const saved = saveDraft(edited(), "Today", true);
    expect(saved.timelines).toHaveLength(3);
    expect(saved.timelines[0].blocks).toEqual(blocks);
    expect(saved.draft.name).toBe("Today");
    expect(saved.draft.sourceId).toBe(saved.timelines[2].id);
    expect(saved.draft.blocks[0].id).not.toBe("warm");
    expect(saved.draft.blocks[1]).toMatchObject({ repeats: 3 });
    expect(isDirty(saved)).toBe(false);
  });
  it("creates and saves an empty new timeline", () => {
    const state = newTimeline(edited());
    expect(state.draft.sourceId).toBeNull();
    expect(state.draft.blocks).toEqual([]);
    const saved = saveDraft(state, "Empty");
    expect(saved.timelines).toHaveLength(3);
    expect(saved.draft.name).toBe("Empty");
  });
  it("detects changes that have been reverted", () => {
    const state = edited();
    firstInterval(state.draft.blocks).seconds = 10;
    expect(isDirty(state)).toBe(false);
  });
  it.each(["", "   ", " Other ", "OTHER"])(
    "rejects blank or conflicting names %j",
    (name) => {
      expect(() => saveDraft(edited(), name, true)).toThrow();
    },
  );
  it("edits the draft name without changing the saved original until Save", () => {
    const state = renameDraft(edited(), " Renamed ");
    expect(state.timelines[0].name).toBe("Workout");
    expect(state.draft.name).toBe(" Renamed ");
    expect(state.timelines[0].blocks).toEqual(blocks);
    expect(isDirty(state)).toBe(true);
    const saved = saveDraft(state);
    expect(saved.timelines[0].name).toBe("Renamed");
    expect(isDirty(saved)).toBe(false);
  });
  it("preserves an empty temporary name across reload, and permits saving after it is filled", () => {
    const state = renameDraft(fixture(), "");
    expect(parseLibrary(JSON.parse(JSON.stringify(state))).draft.name).toBe("");
    expect(() => saveDraft(state)).toThrow("Enter a timeline name");
    expect(saveDraft(renameDraft(state, "Renamed")).timelines[0].name).toBe(
      "Renamed",
    );
    expect(importTimeline(exportTimeline(state.draft), []).name).toBe(
      "Untitled timeline",
    );
  });
  it("duplicates the saved baseline with a unique name and fresh nested IDs", () => {
    const one = duplicateTimeline(edited());
    const two = duplicateTimeline(loadTimeline(one, "one"));
    expect(one.draft.name).toBe("Workout copy");
    expect(two.draft.name).toBe("Workout copy (2)");
    expect(firstInterval(one.draft.blocks).seconds).toBe(10);
    expect(one.draft.blocks[0].id).not.toBe("warm");
    expect(isDirty(one)).toBe(false);
  });
  it("deletes the selected entry and loads another, or an empty draft after the last", () => {
    const state = deleteTimeline(edited(), "one");
    expect(state.draft.sourceId).toBe("two");
    const empty = deleteTimeline(state, "two");
    expect(empty.timelines).toEqual([]);
    expect(empty.draft).toEqual(emptyDraft());
  });
});
describe("library storage and migration", () => {
  it("migrates the old routine without overwriting or deleting legacy data", () => {
    const getItem = vi.fn((key: string) =>
      key === STORAGE_KEY ? JSON.stringify({ version: 1, blocks }) : null,
    );
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem, setItem });
    const loaded = loadLibrary();
    expect(loaded.error).toBeUndefined();
    expect(loaded.library.timelines[0]).toMatchObject({
      name: "My timeline",
      blocks,
    });
    expect(loaded.library.draft.blocks).toEqual(blocks);
    expect(isDirty(loaded.library)).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    persistLibrary(loaded.library);
    expect(setItem).toHaveBeenCalledExactlyOnceWith(
      LIBRARY_KEY,
      JSON.stringify(loaded.library),
    );
  });
  it("restores unsaved draft edits and selected source after reload, independently of the original", () => {
    const state = edited();
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(state) });
    const restored = loadLibrary().library;
    expect(firstInterval(restored.draft.blocks).seconds).toBe(55);
    expect(restored.draft.sourceId).toBe("one");
    expect(restored.timelines[0].blocks).toEqual(blocks);
    expect(isDirty(restored)).toBe(true);
  });
  it("restores an unsaved imported or new draft with no source", () => {
    const state = {
      ...fixture(),
      draft: { sourceId: null, name: "Imported", blocks },
    };
    expect(parseLibrary(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
  it("reports corrupt or inaccessible storage and leaves it untouched", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: () => "broken", setItem });
    expect(loadLibrary().error).toBeTruthy();
    expect(setItem).not.toHaveBeenCalled();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw Error();
      },
      setItem,
    });
    expect(loadLibrary().error).toBeTruthy();
  });
  it("does not mutate the library when a storage write fails", () => {
    const state = edited();
    const before = structuredClone(state);
    expect(() =>
      persistLibrary(state, {
        setItem: () => {
          throw Error("Quota exceeded");
        },
      }),
    ).toThrow("Quota exceeded");
    expect(state).toEqual(before);
  });
  it("rejects orphan drafts, duplicate names and unsupported versions", () => {
    const state = fixture();
    expect(() =>
      parseLibrary({
        ...state,
        draft: { ...state.draft, sourceId: "missing" },
      }),
    ).toThrow();
    expect(() =>
      parseLibrary({
        ...state,
        timelines: [...state.timelines, { ...state.timelines[0], id: "three" }],
      }),
    ).toThrow();
    expect(() => parseLibrary({ ...state, version: 99 })).toThrow();
  });
});
describe("timeline files", () => {
  it("exports temporary edits and imports them as an unsaved copy, retaining rounds", () => {
    const state = edited();
    const text = exportTimeline(state.draft);
    const draft = importTimeline(text, state.timelines);
    expect(draft.sourceId).toBeNull();
    expect(draft.name).toBe("Workout (2)");
    expect(draft.blocks[0]).toMatchObject({ name: "Warm up", seconds: 55 });
    expect(draft.blocks[0].id).not.toBe("warm");
    expect(draft.blocks[1]).toMatchObject({ repeats: 3 });
    expect(state.timelines[0].blocks).toEqual(blocks);
  });
  it("round trips empty and unfinished drafts", () => {
    const unfinished = {
      ...emptyDraft(),
      blocks: [{ ...blocks[0], seconds: 0 }],
    };
    expect(
      firstInterval(importTimeline(exportTimeline(unfinished), []).blocks)
        .seconds,
    ).toBe(0);
    expect(importTimeline(exportTimeline(emptyDraft()), []).blocks).toEqual([]);
  });
  it.each([
    "invalid",
    '{"format":"other","version":1}',
    '{"format":"tempo-timeline","version":2}',
    '{"format":"tempo-timeline","version":1,"name":"","blocks":[]}',
  ])("rejects invalid or unsupported files", (text) => {
    expect(() => importTimeline(text, [])).toThrow();
  });
  it("rejects oversized files, duplicate IDs, nested series and bad durations or rounds", () => {
    expect(() => importTimeline(" ".repeat(MAX_IMPORT_BYTES + 1), [])).toThrow(
      "1 MB",
    );
    const bad = [
      [blocks[0], blocks[0]],
      [{ ...blocks[0], seconds: -1 }],
      [{ ...blocks[0], seconds: 2.5 }],
      [{ ...blocks[1], repeats: 100 }],
      [{ ...blocks[1], intervals: [blocks[1]] }],
      [null],
    ];
    for (const entries of bad)
      expect(() =>
        importTimeline(
          JSON.stringify({
            format: "tempo-timeline",
            version: 1,
            name: "Bad",
            blocks: entries,
          }),
          [],
        ),
      ).toThrow();
  });
});
