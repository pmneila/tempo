import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Snapshot } from "./engine";
import { format, type Step } from "./model";
import { timelineLabel, timelineLayout, timelinePosition } from "./timeline";

import { useTranslation } from "./i18n";

type Props = {
  steps: Step[];
  snapshot: Snapshot;
  onSelect?: (index: number) => void;
};
export default function WorkoutTimeline({ steps, snapshot, onSelect }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const clipPrefix = useId();
  const [width, setWidth] = useState(300);
  const layout = useMemo(() => timelineLayout(steps), [steps]);
  const position = timelinePosition(layout.segments, snapshot);
  const complete = snapshot.status === "complete";
  const current = steps[snapshot.index];
  const currentText = complete
    ? t("complete")
    : current
      ? `${snapshot.status === "paused" ? `${t("pausedSentence")} ` : ""}${t("intervalDescription", { current: snapshot.index + 1, total: steps.length, name: current.name || t("untitledInterval") })}${current.seriesName ? `, ${current.seriesName}` : ""}${current.rounds && current.rounds > 1 ? `, ${t("roundPositionLower", { current: current.round, total: current.rounds })}` : ""}`
      : t("noIntervals");
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
  const segmentTitle = (step: Step) =>
    [
      step.seriesName,
      step.rounds && step.rounds > 1
        ? t("roundCompact", { current: step.round, total: step.rounds })
        : null,
      step.name || t("untitledInterval"),
      format(step.seconds),
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <div ref={ref} className="workout-timeline">
      <div
        role="progressbar"
        aria-label={t("timelineOverview")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position * 100)}
        aria-valuetext={t("progressDescription", {
          percent: Math.round(position * 100),
          description: currentText,
        })}
      >
        <svg
          width="100%"
          height="58"
          viewBox={`0 0 ${width} 58`}
          aria-hidden="true"
        >
          {layout.blocks.map((block, index) => {
            const span = (block.end - block.start) * usable;
            const label = timelineLabel(block.name || t("untitled"), span);
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
                      <title>{block.name || t("untitled")}</title>
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
                <title>{segmentTitle(segment.step)}</title>
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
      {onSelect && layout.segments.length > 0 && (
        <div
          className="timeline-targets"
          role="group"
          aria-label={t("timelineNavigation")}
        >
          {layout.segments.map((segment) => (
            <button
              key={segment.key}
              type="button"
              className="timeline-target"
              style={{
                left: `${segment.start * 100}%`,
                width: `${(segment.end - segment.start) * 100}%`,
              }}
              aria-label={`${t("intervalPosition", { current: segment.index + 1, total: steps.length })} · ${t("jumpToInterval", { interval: segmentTitle(segment.step) })}`}
              aria-current={
                !complete && segment.index === snapshot.index
                  ? "step"
                  : undefined
              }
              title={segmentTitle(segment.step)}
              disabled={complete}
              onClick={() => onSelect(segment.index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
