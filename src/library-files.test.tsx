import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  emptyDraft,
  exportTimeline,
  exportTimelines,
  isDirty,
  loadTimeline,
  MAX_IMPORT_BYTES,
  MAX_LIBRARY_IMPORT_BYTES,
  mergeTimelines,
  readTimelineFile,
  type Library,
  type TimelineFile,
} from "./library";
import TimelineChooser from "./TimelineChooser";
import type { Block } from "./model";
const blocks: Block[] = [
  { id: "warm", name: "Warm up", kind: "interval", seconds: 10 },
  {
    id: "series",
    name: "Circuit",
    kind: "series",
    repeats: 3,
    intervals: [{ id: "work", name: "Work", kind: "interval", seconds: 30 }],
  },
];
function fixture(): Library {
  const state = loadTimeline(
    {
      version: 2,
      timelines: [
        { id: "one", name: "Workout", blocks: structuredClone(blocks) },
      ],
      draft: emptyDraft(),
    },
    "one",
  );
  state.draft.name = "Today only";
  const first = state.draft.blocks[0];
  if (first.kind === "interval") first.seconds = 99;
  return state;
}
function libraryFile(file: TimelineFile) {
  if (file.kind !== "library") throw Error("Expected library file");
  return file.timelines;
}
const file = (timelines: unknown) =>
  JSON.stringify({ format: "tempo-library", version: 1, timelines });
describe("library file export", () => {
  it("exports only saved versions with the versioned public file shape", () => {
    const state = fixture();
    const json = JSON.parse(exportTimelines(state.timelines));
    expect(json).toEqual({
      format: "tempo-library",
      version: 1,
      timelines: [{ name: "Workout", blocks }],
    });
    expect(JSON.parse(exportTimeline(state.draft))).toMatchObject({
      name: "Today only",
      blocks: [{ seconds: 99 }, {}],
    });
    expect(json.timelines[0].blocks[0].seconds).toBe(10);
  });
  it("round trips intervals, repeated series, and empty saved timelines", () => {
    const state = fixture();
    state.timelines.push({ id: "empty", name: "Empty", blocks: [] });
    const imported = libraryFile(
      readTimelineFile(exportTimelines(state.timelines), []),
    );
    expect(imported.map((t) => t.name)).toEqual(["Workout", "Empty"]);
    expect(imported[0].blocks[0]).toMatchObject({
      name: "Warm up",
      seconds: 10,
    });
    expect(imported[0].blocks[1]).toMatchObject({
      name: "Circuit",
      repeats: 3,
    });
    expect(imported[1].blocks).toEqual([]);
  });
  it("exports an empty library as a valid no-op import", () => {
    const state = fixture();
    const imported = libraryFile(
      readTimelineFile(exportTimelines([]), state.timelines),
    );
    expect(imported).toEqual([]);
    expect(mergeTimelines(state, imported)).toBe(state);
  });
});
describe("library file import", () => {
  it("adds imported copies while retaining the draft, selection, and existing entries", () => {
    const state = fixture();
    const before = structuredClone(state);
    const imported = libraryFile(
      readTimelineFile(exportTimelines(state.timelines), state.timelines),
    );
    const merged = mergeTimelines(state, imported);
    expect(merged.timelines).toHaveLength(2);
    expect(merged.timelines[0]).toEqual(before.timelines[0]);
    expect(merged.timelines[1].name).toBe("Workout (2)");
    expect(merged.draft).toBe(state.draft);
    expect(merged.draft).toEqual(before.draft);
    expect(isDirty(merged)).toBe(true);
    expect(state).toEqual(before);
  });
  it("resolves name conflicts against existing entries and earlier entries in the same file", () => {
    const state = fixture();
    const imported = libraryFile(
      readTimelineFile(
        file([
          { name: "Workout", blocks },
          { name: "workout", blocks },
          { name: "Workout (2)", blocks },
        ]),
        state.timelines,
      ),
    );
    const merged = mergeTimelines(state, imported);
    expect(merged.timelines.map((t) => t.name)).toEqual([
      "Workout",
      "Workout (2)",
      "workout (3)",
      "Workout (2) (2)",
    ]);
  });
  it("regenerates timeline and nested item IDs even across repeated imports", () => {
    const text = file([
      { name: "Workout", blocks },
      { name: "Copy", blocks },
    ]);
    const first = libraryFile(readTimelineFile(text, []));
    const second = libraryFile(readTimelineFile(text, []));
    const all = [...first, ...second];
    const ids = all.flatMap((t) => [
      t.id,
      ...t.blocks.flatMap((b) => [
        b.id,
        ...(b.kind === "series" ? b.intervals.map((i) => i.id) : []),
      ]),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("warm");
    expect(ids).not.toContain("series");
    expect(ids).not.toContain("work");
  });
  it("validates the whole batch and rejects an invalid later entry without changing data", () => {
    const state = fixture();
    const before = structuredClone(state);
    expect(() =>
      readTimelineFile(
        file([
          { name: "Valid", blocks },
          { name: "Broken", blocks: [{ ...blocks[0], seconds: -1 }] },
        ]),
        state.timelines,
      ),
    ).toThrow();
    expect(state).toEqual(before);
  });
  it.each([
    { format: "tempo-library", version: 2, timelines: [] },
    { format: "tempo-library", version: 1, timelines: {} },
    { format: "tempo-library", version: 1, timelines: [null] },
    {
      format: "tempo-library",
      version: 1,
      timelines: [{ name: " ", blocks: [] }],
    },
    {
      format: "tempo-library",
      version: 1,
      timelines: [{ name: "Bad", blocks: [blocks[0], blocks[0]] }],
    },
    {
      format: "tempo-library",
      version: 1,
      timelines: [{ name: "Bad", blocks: [{ ...blocks[1], repeats: 100 }] }],
    },
  ])("rejects malformed entries or unsupported library versions", (value) => {
    expect(() => readTimelineFile(JSON.stringify(value), [])).toThrow();
  });
  it("keeps single-timeline files compatible and opens them as unsaved drafts", () => {
    const result = readTimelineFile(exportTimeline(fixture().draft), []);
    expect(result.kind).toBe("timeline");
    if (result.kind === "timeline") {
      expect(result.draft.sourceId).toBeNull();
      expect(result.draft.name).toBe("Today only");
      expect(result.draft.blocks[0]).toMatchObject({ seconds: 99 });
    }
  });
  it("supports library files above 1 MB while preserving the single-file and 10 MB limits", () => {
    const padding = " ".repeat(MAX_IMPORT_BYTES);
    expect(
      readTimelineFile(
        JSON.stringify({
          format: "tempo-library",
          version: 1,
          timelines: [],
          padding,
        }),
        [],
      ).kind,
    ).toBe("library");
    expect(() =>
      readTimelineFile(
        JSON.stringify({
          format: "tempo-timeline",
          version: 1,
          name: "Big",
          blocks: [],
          padding,
        }),
        [],
      ),
    ).toThrow("1 MB");
    expect(() =>
      readTimelineFile(" ".repeat(MAX_LIBRARY_IMPORT_BYTES + 1), []),
    ).toThrow("10 MB");
  });
});
describe("timeline chooser", () => {
  it("lists the current source and New timeline with accessible menu semantics", () => {
    const html = renderToStaticMarkup(
      <TimelineChooser
        timelines={fixture().timelines}
        sourceId="one"
        open
        disabled={false}
        onOpenChange={() => {}}
        onChoose={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Choose timeline"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('role="menu"');
    expect(html).toContain('role="menuitemradio"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("New timeline");
    expect(html).not.toContain("<select");
  });
  it("supports an empty library and a draft without a saved source", () => {
    const html = renderToStaticMarkup(
      <TimelineChooser
        timelines={[]}
        sourceId={null}
        open
        disabled={false}
        onOpenChange={() => {}}
        onChoose={() => {}}
      />,
    );
    expect(html).toContain("No saved timelines");
    expect(html).toContain("New timeline");
    expect(html).not.toContain('aria-checked="true"');
  });
});
