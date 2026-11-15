import type { Snapshot } from "./engine";
import type { Step } from "./model";

export type TimelineSegment = {
  key: string;
  step: Step;
  index: number;
  start: number;
  end: number;
  boundary: "block" | "round" | "interval";
};
export type TimelineBlock = {
  key: string;
  name: string;
  start: number;
  end: number;
};

// Positions are fractions of the full duration; resizing never changes proportions.
export function timelineLayout(steps: Step[]) {
  const duration = steps.reduce((sum, step) => sum + step.seconds, 0);
  const segments: TimelineSegment[] = [];
  const blocks: TimelineBlock[] = [];
  let elapsed = 0;
  if (duration <= 0) return { duration: 0, segments, blocks };
  steps.forEach((step, index) => {
    const previous = steps[index - 1];
    const start = elapsed / duration;
    elapsed += step.seconds;
    const end = elapsed / duration;
    const boundary =
      !previous || previous.blockId !== step.blockId
        ? "block"
        : previous.round !== step.round
          ? "round"
          : "interval";
    segments.push({
      key: `${step.id}:${index}`,
      step,
      index,
      start,
      end,
      boundary,
    });
    if (boundary === "block")
      blocks.push({
        key: step.blockId,
        name: step.seriesName ?? step.name,
        start,
        end,
      });
    else blocks[blocks.length - 1].end = end;
  });
  return { duration, segments, blocks };
}

export function timelinePosition(
  segments: TimelineSegment[],
  snapshot: Snapshot,
) {
  if (!segments.length) return 0;
  if (snapshot.status === "complete") return 1;
  const segment =
    segments[Math.max(0, Math.min(snapshot.index, segments.length - 1))];
  const fraction = Math.max(
    0,
    Math.min(1, 1 - snapshot.remaining / (segment.step.seconds * 1000)),
  );
  return segment.start + (segment.end - segment.start) * fraction;
}

export function timelineLabel(name: string, width: number) {
  if (width < 48) return "";
  const capacity = Math.max(1, Math.floor((width - 10) / 6));
  return name.length > capacity ? `${name.slice(0, capacity - 1)}…` : name;
}
