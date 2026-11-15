import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Snapshot } from "./engine";
import { format, type Step } from "./model";
import { timelineLabel, timelineLayout, timelinePosition } from "./timeline";

type Props = { steps: Step[]; snapshot: Snapshot };
export default function WorkoutTimeline({ steps, snapshot }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const clipPrefix = useId();
  const [width, setWidth] = useState(300);
  const layout = useMemo(() => timelineLayout(steps), [steps]);
  const position = timelinePosition(layout.segments, snapshot);
  const complete = snapshot.status === "complete";
  const current = steps[snapshot.index];
  const currentText = complete
    ? "Workout complete"
    : current
      ? `${snapshot.status === "paused" ? "Paused. " : ""}Interval ${snapshot.index + 1} of ${steps.length}: ${current.name || "Untitled interval"}${current.seriesName ? `, ${current.seriesName}` : ""}${current.rounds && current.rounds > 1 ? `, round ${current.round} of ${current.rounds}` : ""}`
      : "No intervals";
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(1, entry.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Leave room for the marker at both ends without affecting time proportions.
  const usable = Math.max(1, width - 8);
  const x = (fraction: number) => 4 + fraction * usable;
  const marker = x(position);
  return (
    <div
      ref={ref}
      className="workout-timeline"
      role="progressbar"
      aria-label="Workout timeline"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position * 100)}
      aria-valuetext={`${Math.round(position * 100)}% through routine. ${currentText}`}
    >
      <svg
        width="100%"
        height="58"
        viewBox={`0 0 ${width} 58`}
        aria-hidden="true"
      >
        {layout.blocks.map((block, index) => {
          const span = (block.end - block.start) * usable;
          const label = timelineLabel(block.name || "Untitled", span);
          const clipId = `${clipPrefix}-block-${index}`;
          return (
            <g key={block.key} className="timeline-block">
              {label && (
                <>
                  <defs>
                    <clipPath id={clipId}>
                      <rect
                        x={x(block.start) + 4}
                        y="0"
                        width={Math.max(0, span - 8)}
                        height="16"
                      />
                    </clipPath>
                  </defs>
                  <text
                    x={x(block.start) + span / 2}
                    y="11"
                    textAnchor="middle"
                    clipPath={`url(#${clipId})`}
                  >
                    {label}
                    <title>{block.name || "Untitled"}</title>
                  </text>
                </>
              )}
              {span >= 8 && (
                <path
                  d={`M${x(block.start) + 1} 23 V20 H${x(block.end) - 1} V23`}
                />
              )}
            </g>
          );
        })}
        {layout.segments.map((segment) => {
          const start = x(segment.start);
          const span = (segment.end - segment.start) * usable;
          const active = !complete && segment.index === snapshot.index;
          const passed = complete || segment.index < snapshot.index;
          const filled = Math.max(0, Math.min(span, marker - start));
          return (
            <g
              key={segment.key}
              className={`timeline-segment ${passed ? "passed" : active ? "current" : "upcoming"}`}
            >
              <title>{`${segment.step.name || "Untitled interval"} · ${format(segment.step.seconds)}${segment.step.seriesName ? ` · ${segment.step.seriesName}` : ""}${segment.step.rounds && segment.step.rounds > 1 ? ` · Round ${segment.step.round} of ${segment.step.rounds}` : ""}`}</title>
              <rect
                x={start}
                y="30"
                width={span}
                height="18"
                className="segment-base"
              />
              {active && (
                <rect
                  x={start}
                  y="30"
                  width={filled}
                  height="18"
                  className="segment-fill"
                />
              )}
              {active && span >= 1 && (
                <rect
                  x={start + 0.5}
                  y="30.5"
                  width={Math.max(0, span - 1)}
                  height="17"
                  className="segment-outline"
                />
              )}
            </g>
          );
        })}
        {layout.segments.slice(1).map((segment) => (
          <line
            key={segment.key}
            x1={x(segment.start)}
            x2={x(segment.start)}
            y1={segment.boundary === "block" ? 27 : 30}
            y2={segment.boundary === "block" ? 51 : 48}
            className={`timeline-divider ${segment.boundary}`}
            opacity={
              segment.boundary === "interval"
                ? Math.min(1, ((segment.end - segment.start) * usable) / 3)
                : 1
            }
          />
        ))}
        {layout.segments.length > 0 && (
          <g className="timeline-marker">
            <path d={`M${marker - 3} 24 H${marker + 3} L${marker} 28 Z`} />
            <line x1={marker} x2={marker} y1="29" y2="53" />
          </g>
        )}
      </svg>
    </div>
  );
}
