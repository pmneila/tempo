import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  GripVertical,
  Layers,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  duplicate,
  flatten,
  format,
  interval,
  moveItem,
  total,
  uid,
  valid,
  type Block,
  type Interval,
} from "./model";
import { Beeper, TimerEngine, type Snapshot } from "./engine";
import WorkoutTimeline from "./WorkoutTimeline";
import LibraryToolbar from "./LibraryToolbar";
import { loadLibrary, persistLibrary } from "./library";
const loaded = loadLibrary();
function IconButton({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}
function Duration({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className={`duration ${value === 0 ? "invalid" : ""}`}>
      <label>
        <input
          aria-label="Minutes"
          type="number"
          min="0"
          max="999"
          value={Math.floor(value / 60)}
          onChange={(e) =>
            onChange(
              Math.max(0, Math.min(999, Math.floor(Number(e.target.value)))) *
                60 +
                (value % 60),
            )
          }
        />
        <span>min</span>
      </label>
      <span className="colon">:</span>
      <label>
        <input
          aria-label="Seconds"
          type="number"
          min="0"
          max="59"
          value={value % 60}
          onChange={(e) =>
            onChange(
              Math.floor(value / 60) * 60 +
                Math.max(0, Math.min(59, Math.floor(Number(e.target.value)))),
            )
          }
        />
        <span>sec</span>
      </label>
    </div>
  );
}
function EndDrop() {
  const { setNodeRef, isOver } = useDroppable({ id: "root-end" });
  return (
    <div ref={setNodeRef} className={`end-drop ${isOver ? "over" : ""}`}>
      Drop here to place at the end of the timeline
    </div>
  );
}
function SortableCard({
  item,
  children,
  controls,
  nested = false,
  body,
}: {
  item: Block;
  children: React.ReactNode;
  controls: React.ReactNode;
  nested?: boolean;
  body?: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setDroppableNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`item ${item.kind} ${nested ? "nested" : ""} ${isDragging ? "dragging" : ""}`}
    >
      <div className="item-row" ref={setDroppableNodeRef}>
        <button
          type="button"
          className="drag-handle"
          aria-label={`Drag ${item.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={18} />
        </button>
        {children}
        {controls}
      </div>
      {body}
    </div>
  );
}
export default function App() {
  const [library, setLibrary] = useState(loaded.library);
  const blocks = library.draft.blocks;
  const setBlocks: React.Dispatch<React.SetStateAction<Block[]>> = (change) =>
    setLibrary((old) => ({
      ...old,
      draft: {
        ...old.draft,
        blocks:
          typeof change === "function" ? change(old.draft.blocks) : change,
      },
    }));
  const [storageError, setStorageError] = useState("");
  const [notice, setNotice] = useState(loaded.error ?? "");
  const [view, setView] = useState<"edit" | "workout">("edit");
  const [menu, setMenu] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [soundError, setSoundError] = useState("");
  const beeper = useRef(new Beeper());
  const engine = useRef<TimerEngine | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    index: 0,
    remaining: 0,
    status: "paused",
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  useEffect(() => {
    if (loaded.error && library === loaded.library) return;
    try {
      persistLibrary(library);
      setStorageError("");
    } catch {
      setStorageError(
        "Could not store your timelines or working draft in this browser. Keep this page open to preserve your edits, or export the draft as a backup.",
      );
    }
  }, [library]);
  useEffect(() => {
    if (view !== "workout") return;
    const timer = window.setInterval(() => {
      engine.current?.tick();
      if (engine.current) setSnapshot(engine.current.snapshot());
    }, 30);
    return () => clearInterval(timer);
  }, [view]);
  useEffect(() => {
    if (view !== "workout" || snapshot.status !== "running") return;
    let lock: WakeLockSentinel | undefined;
    let active = true;
    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await navigator.wakeLock?.request("screen");
        if (!active) await next?.release();
        else lock = next;
      } catch {}
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      active = false;
      void lock?.release();
      document.removeEventListener("visibilitychange", acquire);
    };
  }, [view, snapshot.status]);
  useEffect(
    () => () => {
      beeper.current.cancel();
    },
    [],
  );
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);
  const editorSteps = useMemo(() => flatten(blocks), [blocks]);
  const steps =
    view === "workout" && engine.current ? engine.current.steps : editorSteps;
  const duration = useMemo(
    () => steps.reduce((sum, step) => sum + step.seconds, 0),
    [steps],
  );
  const seriesCount = blocks.filter((b) => b.kind === "series").length;
  const canStart = valid(blocks);
  function update(
    id: string,
    patch: Partial<Interval> | { name?: string; repeats: number },
  ) {
    setBlocks((old) =>
      old.map((b) =>
        b.id === id
          ? ({ ...b, ...patch } as Block)
          : b.kind === "series"
            ? {
                ...b,
                intervals: b.intervals.map((i) =>
                  i.id === id ? ({ ...i, ...patch } as Interval) : i,
                ),
              }
            : b,
      ),
    );
  }
  function remove(id: string) {
    setBlocks((old) =>
      old
        .filter((b) => b.id !== id)
        .map((b) =>
          b.kind === "series"
            ? { ...b, intervals: b.intervals.filter((i) => i.id !== id) }
            : b,
        ),
    );
    setMenu(null);
  }
  function copy(id: string) {
    setBlocks((old) =>
      old.flatMap((b) =>
        b.id === id
          ? [b, duplicate(b)]
          : b.kind === "series"
            ? [
                {
                  ...b,
                  intervals: b.intervals.flatMap((i) =>
                    i.id === id ? [i, duplicate(i) as Interval] : [i],
                  ),
                },
              ]
            : [b],
      ),
    );
    setMenu(null);
  }
  function move(id: string, direction: -1 | 1) {
    const parent = blocks.find(
      (b) => b.kind === "series" && b.intervals.some((i) => i.id === id),
    );
    const siblings = parent?.kind === "series" ? parent.intervals : blocks;
    const index = siblings.findIndex((b) => b.id === id);
    const target = siblings[index + direction];
    if (target) {
      const reordered = [...siblings];
      [reordered[index], reordered[index + direction]] = [
        reordered[index + direction],
        reordered[index],
      ];
      setBlocks((old) =>
        parent
          ? old.map((b) =>
              b.id === parent.id && b.kind === "series"
                ? { ...b, intervals: reordered as Interval[] }
                : b,
            )
          : (reordered as Block[]),
      );
    }
  }
  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const all = [
      ...blocks,
      ...blocks.flatMap((b) => (b.kind === "series" ? b.intervals : [])),
    ];
    const sourceIndex = all.findIndex((b) => b.id === active.id);
    const targetIndex = all.findIndex((b) => b.id === over.id);
    setBlocks((old) =>
      moveItem(
        old,
        String(active.id),
        String(over.id),
        sourceIndex < targetIndex ? "after" : "before",
      ),
    );
  }
  async function audio() {
    try {
      await beeper.current.initialize();
      setSoundError("");
    } catch {
      setSoundError(
        "Sound could not be enabled. Check your browser audio settings and try Preview sound.",
      );
    }
  }
  async function start() {
    if (!canStart) return;
    await audio();
    engine.current = new TimerEngine(
      flatten(blocks),
      undefined,
      (end) => beeper.current.play(end),
      () => beeper.current.cancel(),
    );
    engine.current.resume();
    setSnapshot(engine.current.snapshot());
    setView("workout");
    setMenu(null);
  }
  function control(action: (e: TimerEngine) => void) {
    if (engine.current) {
      action(engine.current);
      setSnapshot(engine.current.snapshot());
    }
  }
  function leave() {
    control((e) => e.reset());
    setView("edit");
  }
  function controls(
    item: Block,
    index: number,
    count: number,
    parent?: string,
  ) {
    return (
      <div className="item-actions">
        <IconButton
          label={`Move ${item.name} up`}
          disabled={index === 0}
          onClick={() => move(item.id, -1)}
        >
          <ArrowUp size={16} />
        </IconButton>
        <IconButton
          label={`Move ${item.name} down`}
          disabled={index === count - 1}
          onClick={() => move(item.id, 1)}
        >
          <ArrowDown size={16} />
        </IconButton>
        <div className="menu-wrap">
          <IconButton
            label={`Options for ${item.name}`}
            aria-expanded={menu === item.id}
            onClick={() => setMenu(menu === item.id ? null : item.id)}
          >
            <MoreHorizontal size={20} />
          </IconButton>
          {menu === item.id && (
            <div className="item-menu">
              <button onClick={() => copy(item.id)}>
                <Copy size={15} /> Duplicate
              </button>
              {item.kind === "interval" && (
                <>
                  <label className="move-label">
                    Move to
                    <select
                      aria-label={`Move ${item.name} to`}
                      value={parent ?? "root-end"}
                      onChange={(e) => {
                        setBlocks((old) =>
                          moveItem(old, item.id, e.target.value),
                        );
                        setMenu(null);
                      }}
                    >
                      <option value="root-end">Timeline (end)</option>
                      {blocks
                        .filter((b) => b.kind === "series")
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name || "Untitled series"}
                          </option>
                        ))}
                    </select>
                  </label>
                  {parent && (
                    <button
                      onClick={() => {
                        setBlocks((old) => moveItem(old, item.id, "root-end"));
                        setMenu(null);
                      }}
                    >
                      <ArrowRight size={15} /> Move out of series
                    </button>
                  )}
                </>
              )}
              <button className="delete" onClick={() => remove(item.id)}>
                <Trash2 size={15} /> Delete {item.kind}
              </button>
              <button onClick={() => setMenu(null)}>Close menu</button>
            </div>
          )}
        </div>
      </div>
    );
  }
  const current = steps[snapshot.index];
  const next = steps[snapshot.index + 1];
  const completed = snapshot.status === "complete";
  const elapsed =
    steps.slice(0, snapshot.index).reduce((n, i) => n + i.seconds, 0) +
    (current ? current.seconds - snapshot.remaining / 1000 : 0);
  const progress = completed ? 100 : duration ? (elapsed / duration) * 100 : 0;
  return (
    <div className="app">
      <header className="site-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (view === "workout") leave();
          }}
          aria-label="Tempo routine editor"
        >
          <span className="brand-icon">
            <Activity size={23} />
          </span>
          tempo<span className="brand-dot">.</span>
        </a>
        <button
          className="sound-toggle"
          onClick={() => {
            beeper.current.cancel();
            beeper.current.muted = !muted;
            setMuted(!muted);
          }}
          aria-pressed={muted}
          aria-label={muted ? "Unmute sounds" : "Mute sounds"}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          <span>Sound {muted ? "off" : "on"}</span>
        </button>
      </header>
      {notice && (
        <div className="notice" role="alert">
          {notice}
          <button onClick={() => setNotice("")}>Dismiss</button>
        </div>
      )}
      {storageError && (
        <div className="notice" role="alert">
          {storageError}
          <button onClick={() => setLibrary((old) => ({ ...old }))}>
            Retry
          </button>
        </div>
      )}
      {soundError && (
        <div className="notice" role="alert">
          {soundError}
        </div>
      )}
      {view === "edit" ? (
        <main className="editor">
          <LibraryToolbar library={library} onChange={setLibrary} />
          <div className="workspace">
            <section className="timeline" aria-label="Routine timeline">
              <DndContext
                sensors={sensors}
                collisionDetection={(args) =>
                  closestCenter({
                    ...args,
                    droppableContainers: blocks.some(
                      (b) => b.id === args.active.id && b.kind === "series",
                    )
                      ? args.droppableContainers.filter(
                          (c) =>
                            c.id === "root-end" ||
                            blocks.some((b) => b.id === c.id),
                        )
                      : args.droppableContainers,
                  })
                }
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={blocks.map((b) => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="blocks">
                    {blocks.map((block, index) => (
                      <div key={block.id} className="block-wrap">
                        <SortableCard
                          item={block}
                          controls={controls(block, index, blocks.length)}
                          body={
                            block.kind === "series" && (
                              <div className="series-body">
                                <SortableContext
                                  items={block.intervals.map((i) => i.id)}
                                  strategy={verticalListSortingStrategy}
                                >
                                  {block.intervals.map((item, n) => (
                                    <SortableCard
                                      key={item.id}
                                      item={item}
                                      nested
                                      controls={controls(
                                        item,
                                        n,
                                        block.intervals.length,
                                        block.id,
                                      )}
                                    >
                                      <div className="item-details">
                                        <input
                                          className="name-input"
                                          aria-label="Interval name"
                                          placeholder="Untitled interval"
                                          value={item.name}
                                          onChange={(e) =>
                                            update(item.id, {
                                              name: e.target.value,
                                            })
                                          }
                                        />
                                        {item.seconds === 0 && (
                                          <small className="field-error">
                                            Set a duration above zero
                                          </small>
                                        )}
                                      </div>
                                      <Duration
                                        value={item.seconds}
                                        onChange={(seconds) =>
                                          update(item.id, { seconds })
                                        }
                                      />
                                    </SortableCard>
                                  ))}
                                </SortableContext>
                                {!block.intervals.length && (
                                  <p className="empty-series">
                                    Add an interval or move one into this
                                    series.
                                  </p>
                                )}
                                <button
                                  className="add-inside"
                                  onClick={() =>
                                    setBlocks((old) =>
                                      old.map((b) =>
                                        b.id === block.id && b.kind === "series"
                                          ? {
                                              ...b,
                                              intervals: [
                                                ...b.intervals,
                                                interval(),
                                              ],
                                            }
                                          : b,
                                      ),
                                    )
                                  }
                                >
                                  <Plus size={16} /> Add interval to series
                                </button>
                              </div>
                            )
                          }
                        >
                          <div className="item-details">
                            <span className="type-label">
                              {block.kind === "series" ? "SERIES" : "INTERVAL"}
                            </span>
                            <input
                              className="name-input"
                              aria-label={
                                block.kind === "series"
                                  ? "Series name"
                                  : "Interval name"
                              }
                              placeholder={
                                block.kind === "series"
                                  ? "Untitled series"
                                  : "Untitled interval"
                              }
                              value={block.name}
                              onChange={(e) =>
                                update(block.id, { name: e.target.value })
                              }
                            />
                            {block.kind === "series" && (
                              <label className="repeat-control">
                                Rounds
                                <input
                                  type="number"
                                  min="1"
                                  max="99"
                                  step="1"
                                  aria-label={`Rounds for ${block.name || "Untitled series"}`}
                                  value={block.repeats ?? 1}
                                  onChange={(e) =>
                                    update(block.id, {
                                      repeats: Math.max(
                                        1,
                                        Math.min(
                                          99,
                                          Math.floor(Number(e.target.value)) ||
                                            1,
                                        ),
                                      ),
                                    })
                                  }
                                />
                              </label>
                            )}
                          </div>
                          {block.kind === "interval" ? (
                            <Duration
                              value={block.seconds}
                              onChange={(seconds) =>
                                update(block.id, { seconds })
                              }
                            />
                          ) : (
                            <span className="series-duration">
                              {format(total([block]))}
                              <small>
                                {block.intervals.length} intervals ×{" "}
                                {block.repeats ?? 1}
                              </small>
                            </span>
                          )}
                        </SortableCard>
                        {block.kind === "interval" && block.seconds === 0 && (
                          <p className="field-error standalone-error">
                            Set a duration above zero.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </SortableContext>
                {blocks.length > 0 && <EndDrop />}
              </DndContext>
              {!blocks.length && (
                <div className="empty-state">
                  <Activity size={36} />
                  <h3>Empty routine</h3>
                  <p>Add an interval or a series to build your routine.</p>
                </div>
              )}
              <div className="add-buttons">
                <button
                  onClick={() => setBlocks((old) => [...old, interval()])}
                >
                  <Plus size={18} /> Add interval
                </button>
                <button
                  onClick={() =>
                    setBlocks((old) => [
                      ...old,
                      {
                        id: uid(),
                        kind: "series",
                        name: "New series",
                        intervals: [interval()],
                      },
                    ])
                  }
                >
                  <Layers size={18} /> Add series
                </button>
              </div>
              <p className="editor-hint">
                <GripVertical size={14} /> Drag to reorder, or use the arrows
                and item options.
              </p>
            </section>
            <aside className="sidebar">
              <div className="summary-card">
                <h2>Routine summary</h2>
                <div className="total-time">
                  {format(duration)}
                  <span>TOTAL DURATION</span>
                </div>
                <div className="stats">
                  <div>
                    <strong>{steps.length}</strong>
                    <span>Intervals</span>
                  </div>
                  <div>
                    <strong>{seriesCount}</strong>
                    <span>Series</span>
                  </div>
                </div>
                <button
                  className="primary start-button"
                  disabled={!canStart}
                  onClick={() => void start()}
                >
                  <Play size={19} fill="currentColor" /> Start workout
                </button>
                {!canStart && (
                  <p className="validation">
                    {!blocks.length
                      ? "Add an interval to get started."
                      : "Give every interval a duration and every series at least one interval."}
                  </p>
                )}
              </div>
              <button
                className="sound-preview"
                onClick={async () => {
                  await audio();
                  if (!beeper.current.muted) beeper.current.play(true);
                  else
                    setSoundError(
                      "Sound is muted. Turn sound on to preview the interval sound.",
                    );
                }}
              >
                <Volume2 size={16} /> Preview sound
              </button>
            </aside>
          </div>
        </main>
      ) : (
        <main className="workout">
          <div className="workout-top">
            <button className="text-button" onClick={leave}>
              <ArrowLeft size={17} /> Back to editor
            </button>
            <span className={`status-pill ${snapshot.status}`}>
              {completed
                ? "WORKOUT COMPLETE"
                : snapshot.status === "running"
                  ? "RUNNING"
                  : "PAUSED"}
            </span>
          </div>
          <div className="player-card">
            <div className="eyebrow">
              {completed ? "WORKOUT" : current?.seriesName || "WORKOUT"}
            </div>
            <h1>
              {completed
                ? "Workout complete"
                : current?.name || "Untitled interval"}
            </h1>
            <p className="interval-position">
              {completed
                ? `${steps.length} intervals completed`
                : `Interval ${snapshot.index + 1} of ${steps.length}${current?.rounds && current.rounds > 1 ? ` · Round ${current.round} of ${current.rounds}` : ""}`}
            </p>
            <div
              className={`countdown ${!completed && snapshot.remaining <= 3000 ? "countdown-ending" : ""}`}
              role="timer"
              aria-label="Time remaining"
            >
              {completed ? (
                <span className="completion-icon">
                  <Check size={90} />
                </span>
              ) : (
                format(Math.ceil(snapshot.remaining / 1000))
              )}
            </div>
            <WorkoutTimeline steps={steps} snapshot={snapshot} />
            <div className="progress-label">
              <span>{Math.round(progress)}% complete</span>
              <span>
                {format(Math.ceil(Math.max(0, duration - elapsed)))} remaining
              </span>
            </div>
            <div className="playback-controls">
              <IconButton
                label="Previous series"
                disabled={
                  completed || (engine.current?.seriesTarget(-1) ?? -1) < 0
                }
                onClick={() => control((e) => e.jump(e.seriesTarget(-1)))}
              >
                <SkipBack size={23} />
                <span aria-hidden="true">Series</span>
              </IconButton>
              <IconButton
                label="Previous interval"
                disabled={completed || snapshot.index === 0}
                onClick={() => control((e) => e.jump(e.index - 1))}
              >
                <ArrowLeft size={24} />
                <span aria-hidden="true">Interval</span>
              </IconButton>
              <button
                className="primary play-pause"
                onClick={async () => {
                  await audio();
                  control((e) => {
                    if (e.status === "complete") {
                      e.reset();
                      e.resume();
                    } else if (e.status === "running") e.pause();
                    else e.resume();
                  });
                }}
              >
                {completed ? (
                  <RotateCcw size={24} />
                ) : snapshot.status === "running" ? (
                  <Pause size={25} fill="currentColor" />
                ) : (
                  <Play size={25} fill="currentColor" />
                )}
                <span>
                  {completed
                    ? "Play again"
                    : snapshot.status === "running"
                      ? "Pause"
                      : "Resume"}
                </span>
              </button>
              <IconButton
                label="Next interval"
                disabled={completed || snapshot.index >= steps.length - 1}
                onClick={() => control((e) => e.jump(e.index + 1))}
              >
                <ArrowRight size={24} />
                <span aria-hidden="true">Interval</span>
              </IconButton>
              <IconButton
                label="Next series"
                disabled={
                  completed || (engine.current?.seriesTarget(1) ?? -1) < 0
                }
                onClick={() => control((e) => e.jump(e.seriesTarget(1)))}
              >
                <SkipForward size={23} />
                <span aria-hidden="true">Series</span>
              </IconButton>
            </div>
            <button
              className="text-button reset-button"
              onClick={() => control((e) => e.reset())}
            >
              <RotateCcw size={15} /> Stop & reset
            </button>
          </div>
          <div className="up-next">
            <span className="eyebrow">
              {completed ? "TOTAL DURATION" : "UP NEXT"}
            </span>
            <strong>
              {completed
                ? "Workout complete"
                : next?.name || "Workout complete"}
            </strong>
            <span>
              {!completed && next ? format(next.seconds) : format(duration)}
            </span>
          </div>
        </main>
      )}
    </div>
  );
}
