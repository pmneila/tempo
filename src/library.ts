import { loadRoutine, parseBlocks, uid, type Block } from "./model";

export type SavedTimeline = { id: string; name: string; blocks: Block[] };
export type Draft = { sourceId: string | null; name: string; blocks: Block[] };
export type Library = { version: 2; timelines: SavedTimeline[]; draft: Draft };
export const LIBRARY_KEY = "tempo.library.v2";
export const MAX_IMPORT_BYTES = 1024 * 1024;
const copy = <T>(value: T): T => structuredClone(value);
const freshBlocks = (blocks: Block[]): Block[] =>
  blocks.map((b) =>
    b.kind === "series"
      ? {
          ...b,
          id: uid(),
          intervals: b.intervals.map((i) => ({ ...i, id: uid() })),
        }
      : { ...b, id: uid() },
  );
const nameKey = (name: string) => name.trim().toLowerCase();
export function checkedName(
  name: string,
  timelines: SavedTimeline[],
  except?: string,
) {
  const trimmed = name.trim();
  if (!trimmed) throw Error("Enter a timeline name.");
  if (
    timelines.some(
      (t) => t.id !== except && nameKey(t.name) === nameKey(trimmed),
    )
  )
    throw Error(
      "A timeline with this name already exists. Choose another name.",
    );
  return trimmed;
}
export function uniqueName(base: string, timelines: SavedTimeline[]) {
  let name = base.trim() || "Untitled timeline";
  let count = 2;
  while (timelines.some((t) => nameKey(t.name) === nameKey(name)))
    name = `${base.trim() || "Untitled timeline"} (${count++})`;
  return name;
}
export function emptyDraft(): Draft {
  return { sourceId: null, name: "Untitled timeline", blocks: [] };
}
export function isDirty(library: Library) {
  const source = library.timelines.find((t) => t.id === library.draft.sourceId);
  return source
    ? source.name !== library.draft.name ||
        JSON.stringify(source.blocks) !== JSON.stringify(library.draft.blocks)
    : library.draft.blocks.length > 0 ||
        library.draft.name !== "Untitled timeline";
}
export function loadTimeline(library: Library, id: string): Library {
  const timeline = library.timelines.find((t) => t.id === id);
  if (!timeline) throw Error("This timeline could not be found.");
  return {
    ...library,
    draft: { sourceId: id, name: timeline.name, blocks: copy(timeline.blocks) },
  };
}
export function newTimeline(library: Library): Library {
  return { ...library, draft: emptyDraft() };
}
export function saveDraft(
  library: Library,
  name = library.draft.name,
  asNew = false,
): Library {
  const source =
    !asNew && library.timelines.find((t) => t.id === library.draft.sourceId);
  const cleanName = checkedName(
    name,
    library.timelines,
    source ? source.id : undefined,
  );
  const saved: SavedTimeline = {
    id: source ? source.id : uid(),
    name: cleanName,
    blocks: source
      ? copy(library.draft.blocks)
      : freshBlocks(library.draft.blocks),
  };
  const timelines = source
    ? library.timelines.map((t) => (t.id === source.id ? saved : t))
    : [...library.timelines, saved];
  return loadTimeline({ ...library, timelines }, saved.id);
}
export function renameDraft(library: Library, name: string): Library {
  return { ...library, draft: { ...library.draft, name } };
}
export function duplicateTimeline(library: Library): Library {
  const source = library.timelines.find((t) => t.id === library.draft.sourceId);
  if (!source) throw Error("Save this timeline before duplicating it.");
  const saved = {
    id: uid(),
    name: uniqueName(`${source.name} copy`, library.timelines),
    blocks: freshBlocks(source.blocks),
  };
  return loadTimeline(
    { ...library, timelines: [...library.timelines, saved] },
    saved.id,
  );
}
export function deleteTimeline(library: Library, id: string): Library {
  const timelines = library.timelines.filter((t) => t.id !== id);
  if (library.draft.sourceId !== id) return { ...library, timelines };
  return timelines.length
    ? loadTimeline({ ...library, timelines }, timelines[0].id)
    : newTimeline({ ...library, timelines });
}
export function exportTimeline(draft: Draft) {
  return JSON.stringify(
    {
      format: "tempo-timeline",
      version: 1,
      name: draft.name.trim() || "Untitled timeline",
      blocks: draft.blocks,
    },
    null,
    2,
  );
}
export function importTimeline(
  text: string,
  timelines: SavedTimeline[],
): Draft {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES)
    throw Error("Choose a timeline file smaller than 1 MB.");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error("This file is not valid JSON.");
  }
  if (value?.format !== "tempo-timeline" || value.version !== 1)
    throw Error("This file is not a supported Tempo timeline.");
  if (typeof value.name !== "string" || !value.name.trim())
    throw Error("The timeline needs a name.");
  return {
    sourceId: null,
    name: uniqueName(value.name, timelines),
    blocks: freshBlocks(parseBlocks(value.blocks)),
  };
}
export function parseLibrary(value: unknown): Library {
  if (!value || typeof value !== "object") throw Error();
  const data = value as Library;
  if (data.version !== 2 || !Array.isArray(data.timelines) || !data.draft)
    throw Error();
  const ids = new Set<string>();
  const timelines: SavedTimeline[] = [];
  for (const entry of data.timelines) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      !entry.id ||
      ids.has(entry.id) ||
      typeof entry.name !== "string"
    )
      throw Error();
    ids.add(entry.id);
    timelines.push({
      id: entry.id,
      name: checkedName(entry.name, timelines),
      blocks: parseBlocks(entry.blocks),
    });
  }
  const draft = data.draft;
  if (
    typeof draft.name !== "string" ||
    (draft.sourceId !== null &&
      (typeof draft.sourceId !== "string" || !ids.has(draft.sourceId)))
  )
    throw Error();
  return {
    version: 2,
    timelines,
    draft: {
      sourceId: draft.sourceId,
      name: draft.name,
      blocks: parseBlocks(draft.blocks),
    },
  };
}
export function loadLibrary(): { library: Library; error?: string } {
  const fallback: Library = { version: 2, timelines: [], draft: emptyDraft() };
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (raw !== null) return { library: parseLibrary(JSON.parse(raw)) };
    const old = loadRoutine();
    if (old.error) return { library: fallback, error: old.error };
    const saved: SavedTimeline = {
      id: uid(),
      name: "My timeline",
      blocks: copy(old.blocks),
    };
    return {
      library: loadTimeline({ ...fallback, timelines: [saved] }, saved.id),
    };
  } catch {
    return {
      library: fallback,
      error:
        "Could not load your timeline library. Stored data has been left untouched. You can create a new timeline below.",
    };
  }
}

export function persistLibrary(
  library: Library,
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  storage.setItem(LIBRARY_KEY, JSON.stringify(library));
}

export const MAX_LIBRARY_IMPORT_BYTES = 10 * 1024 * 1024;
export type TimelineFile =
  | { kind: "timeline"; draft: Draft }
  | { kind: "library"; timelines: SavedTimeline[] };

export function exportTimelines(timelines: SavedTimeline[]) {
  return JSON.stringify(
    {
      format: "tempo-library",
      version: 1,
      timelines: timelines.map(({ name, blocks }) => ({ name, blocks })),
    },
    null,
    2,
  );
}

// Validate every entry before returning anything that can be merged into storage.
export function readTimelineFile(
  text: string,
  existing: SavedTimeline[],
): TimelineFile {
  if (new TextEncoder().encode(text).length > MAX_LIBRARY_IMPORT_BYTES)
    throw Error("Choose a library file smaller than 10 MB.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error("This file is not valid JSON.");
  }
  if (data?.format !== "tempo-library")
    return { kind: "timeline", draft: importTimeline(text, existing) };
  if (data.version !== 1 || !Array.isArray(data.timelines))
    throw Error("This file is not a supported Tempo library.");
  const validated = data.timelines.map((entry: unknown) => {
    if (!entry || typeof entry !== "object")
      throw Error("Invalid timeline in library file.");
    const item = entry as Record<string, unknown>;
    if (typeof item.name !== "string" || !item.name.trim())
      throw Error("Each timeline in the library needs a name.");
    return { name: item.name.trim(), blocks: parseBlocks(item.blocks) };
  });
  return {
    kind: "library",
    timelines: validated.map((entry: { name: string; blocks: Block[] }) => ({
      id: uid(),
      name: entry.name,
      blocks: freshBlocks(entry.blocks),
    })),
  };
}

export function mergeTimelines(
  library: Library,
  imported: SavedTimeline[],
): Library {
  if (!imported.length) return library;
  const timelines = [...library.timelines];
  for (const entry of imported)
    timelines.push({
      ...entry,
      name: uniqueName(entry.name, timelines),
      blocks: copy(entry.blocks),
    });
  return { ...library, timelines };
}
