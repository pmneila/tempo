import { AppError, message, type Message } from "./messages";
import { englishNames, type DefaultNames } from "./defaultNames";
import en from "./locales/en.json";
export type Interval = {
  id: string;
  kind: "interval";
  name: string;
  seconds: number;
};
export type Series = {
  id: string;
  kind: "series";
  name: string;
  intervals: Interval[];
  repeats?: number; // Total rounds; older saved series default to one.
};
export type Block = Interval | Series;
export type Step = Interval & {
  blockId: string;
  seriesName?: string;
  round?: number;
  rounds?: number;
};
export const validRepeats = (value: number) =>
  Number.isInteger(value) && value >= 1 && value <= 99;
export const uid = () => crypto.randomUUID();
export const interval = (name = en.newInterval, seconds = 30): Interval => ({
  id: uid(),
  kind: "interval",
  name,
  seconds,
});
export const flatten = (blocks: Block[]): Step[] =>
  blocks.flatMap((b) =>
    b.kind === "series"
      ? Array.from(
          { length: validRepeats(b.repeats ?? 1) ? (b.repeats ?? 1) : 0 },
          (_, round) =>
            b.intervals.map((i) => ({
              ...i,
              blockId: b.id,
              seriesName: b.name,
              round: round + 1,
              rounds: b.repeats ?? 1,
            })),
        ).flat()
      : [{ ...b, blockId: b.id }],
  );
export const total = (blocks: Block[]) =>
  flatten(blocks).reduce((n, i) => n + i.seconds, 0);
export const format = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
export const valid = (blocks: Block[]) =>
  blocks.length > 0 &&
  blocks.every((b) =>
    b.kind === "interval"
      ? Number.isInteger(b.seconds) && b.seconds > 0
      : validRepeats(b.repeats ?? 1) &&
        b.intervals.length > 0 &&
        b.intervals.every((i) => Number.isInteger(i.seconds) && i.seconds > 0),
  );
export function duplicate(
  b: Block,
  name = en.copyName.replace("{{name}}", b.name),
): Block {
  return b.kind === "interval"
    ? { ...b, id: uid(), name }
    : {
        ...b,
        id: uid(),
        name,
        intervals: b.intervals.map((i) => ({ ...i, id: uid() })),
      };
}
export function moveItem(
  blocks: Block[],
  id: string,
  target: string,
  position: "before" | "after" = "before",
): Block[] {
  if (id === target) return blocks;
  const item =
    blocks.find((b) => b.id === id) ??
    blocks
      .flatMap((b) => (b.kind === "series" ? b.intervals : []))
      .find((i) => i.id === id);
  if (
    !item ||
    (item.kind === "series" && item.intervals.some((i) => i.id === target))
  )
    return blocks;
  const removed = blocks
    .filter((b) => b.id !== id)
    .map((b) =>
      b.kind === "series"
        ? { ...b, intervals: b.intervals.filter((i) => i.id !== id) }
        : b,
    );
  if (target === "root-end") return [...removed, item];
  const destination = removed.find((b) => b.id === target);
  if (destination?.kind === "series" && item.kind === "interval")
    return removed.map((b) =>
      b.id === target && b.kind === "series"
        ? { ...b, intervals: [...b.intervals, item] }
        : b,
    );
  const rootIndex = removed.findIndex((b) => b.id === target);
  if (rootIndex >= 0) {
    const next = [...removed];
    next.splice(rootIndex + (position === "after" ? 1 : 0), 0, item);
    return next;
  }
  if (item.kind === "series") return blocks;
  return removed.map((b) => {
    if (b.kind !== "series") return b;
    const index = b.intervals.findIndex((i) => i.id === target);
    if (index < 0) return b;
    const intervals = [...b.intervals];
    intervals.splice(index + (position === "after" ? 1 : 0), 0, item);
    return { ...b, intervals };
  });
}
export const starter = (names: DefaultNames = englishNames): Block[] => [
  interval(names.preparation, 60),
  {
    id: uid(),
    kind: "series",
    name: names.mainSequence,
    intervals: [
      interval(names.step1, 40),
      interval(names.breakName, 20),
      interval(names.step2, 40),
      interval(names.breakName, 20),
    ],
  },
  interval(names.finish, 60),
];
export const STORAGE_KEY = "tempo.routine.v1";
export function loadRoutine(names: DefaultNames = englishNames): {
  blocks: Block[];
  error?: Message;
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { blocks: starter(names) };
    const data = JSON.parse(raw);
    if (data.version !== 1) throw Error();
    return { blocks: parseBlocks(data.blocks) };
  } catch {
    return {
      blocks: [],
      error: message("loadRoutineFailure"),
    };
  }
}

// Shared validation for browser storage and imported files. Rebuild objects so
// only supported fields become part of the editable routine.
export function parseBlocks(value: unknown): Block[] {
  if (!Array.isArray(value)) throw new AppError("invalidBlocks");
  const ids = new Set<string>();
  const base = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object") throw new AppError("invalidItem");
    const item = value as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      !item.id ||
      ids.has(item.id) ||
      typeof item.name !== "string"
    )
      throw new AppError("duplicateItem");
    ids.add(item.id);
    return item;
  };
  const readInterval = (value: unknown): Interval => {
    const item = base(value);
    if (
      item.kind !== "interval" ||
      typeof item.seconds !== "number" ||
      !Number.isSafeInteger(item.seconds) ||
      item.seconds < 0
    )
      throw new AppError("invalidDuration");
    return {
      id: item.id as string,
      kind: "interval",
      name: item.name as string,
      seconds: item.seconds,
    };
  };
  return value.map((value) => {
    if (value?.kind !== "series") return readInterval(value);
    const item = base(value);
    if (
      !Array.isArray(item.intervals) ||
      !validRepeats(item.repeats === undefined ? 1 : (item.repeats as number))
    )
      throw new AppError("invalidRounds");
    return {
      id: item.id as string,
      kind: "series",
      name: item.name as string,
      intervals: item.intervals.map(readInterval),
      ...(item.repeats === undefined
        ? {}
        : { repeats: item.repeats as number }),
    };
  });
}
