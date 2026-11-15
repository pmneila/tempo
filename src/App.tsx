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
import { useTranslation } from "./i18n";
import LanguageSelector from "./LanguageSelector";
import { defaultNames } from "./defaultNames";
import { message, translateMessage, type Message } from "./messages";
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
  const { t } = useTranslation();
  return (
    <div className={`duration ${value === 0 ? "invalid" : ""}`}>
      <label>
        <input
          aria-label={t("minutes")}
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
        <span>{t("minuteUnit")}</span>
      </label>
      <span className="colon">:</span>
      <label>
        <input
          aria-label={t("seconds")}
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
        <span>{t("secondUnit")}</span>
      </label>
    </div>
  );
}
function EndDrop() {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: "root-end" });
  return (
    <div ref={setNodeRef} className={`end-drop ${isOver ? "over" : ""}`}>
      {t("dropEnd")}
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
  const { t } = useTranslation();
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
          aria-label={t("dragItem", { name: item.name })}
          {...attributes}
          aria-roledescription={t("sortable")}
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
  const { t } = useTranslation();
  const [loaded] = useState(() => loadLibrary(defaultNames(t)));
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
  const [storageError, setStorageError] = useState<Message | null>(null);
  const [notice, setNotice] = useState<Message | null>(loaded.error ?? null);
  const [view, setView] = useState<"edit" | "workout">("edit");
  const [menu, setMenu] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [soundError, setSoundError] = useState<Message | null>(null);
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
      setStorageError(null);
    } catch {
      setStorageError(message("storageFailure"));
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
          ? [b, duplicate(b, t("copyName", { name: b.name }))]
          : b.kind === "series"
            ? [
                {
                  ...b,
                  intervals: b.intervals.flatMap((i) =>
                    i.id === id
                      ? [
                          i,
                          duplicate(
                            i,
                            t("copyName", { name: i.name }),
                          ) as Interval,
                        ]
                      : [i],
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
  function dragName(id: string | number) {
    if (id === "root-end") return t("timelineEnd");
    const item = [
      ...blocks,
      ...blocks.flatMap((b) => (b.kind === "series" ? b.intervals : [])),
    ].find((b) => b.id === id);
    return item?.name || t("untitled");
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
      setSoundError(null);
    } catch {
      setSoundError(message("audioFailure"));
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
          label={t("moveUp", { name: item.name })}
          disabled={index === 0}
          onClick={() => move(item.id, -1)}
        >
          <ArrowUp size={16} />
        </IconButton>
        <IconButton
          label={t("moveDown", { name: item.name })}
          disabled={index === count - 1}
          onClick={() => move(item.id, 1)}
        >
          <ArrowDown size={16} />
        </IconButton>
        <div className="menu-wrap">
          <IconButton
            label={t("itemOptions", { name: item.name })}
            aria-expanded={menu === item.id}
            onClick={() => setMenu(menu === item.id ? null : item.id)}
          >
            <MoreHorizontal size={20} />
          </IconButton>
          {menu === item.id && (
            <div className="item-menu">
              <button onClick={() => copy(item.id)}>
                <Copy size={15} /> {t("duplicate")}
              </button>
              {item.kind === "interval" && (
                <>
                  <label className="move-label">
                    {t("moveTo")}
                    <select
                      aria-label={t("moveItemTo", { name: item.name })}
                      value={parent ?? "root-end"}
                      onChange={(e) => {
                        setBlocks((old) =>
                          moveItem(old, item.id, e.target.value),
                        );
                        setMenu(null);
                      }}
                    >
                      <option value="root-end">{t("timelineEnd")}</option>
                      {blocks
                        .filter((b) => b.kind === "series")
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name || t("untitledSeries")}
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
                      <ArrowRight size={15} /> {t("moveOut")}
                    </button>
                  )}
                </>
              )}
              <button className="delete" onClick={() => remove(item.id)}>
                <Trash2 size={15} />{" "}
                {t(
                  item.kind === "interval" ? "deleteInterval" : "deleteSeries",
                )}
              </button>
              <button onClick={() => setMenu(null)}>{t("closeMenu")}</button>
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
          aria-label={t("editorLabel")}
        >
          <span className="brand-icon">
            <Activity size={23} />
          </span>
          tempo<span className="brand-dot">.</span>
        </a>
        <div className="header-controls">
          <LanguageSelector />
          <button
            className="sound-toggle"
            onClick={() => {
              beeper.current.cancel();
              beeper.current.muted = !muted;
              setMuted(!muted);
            }}
            aria-pressed={muted}
            aria-label={t(muted ? "unmute" : "mute")}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            <span>{t(muted ? "soundOff" : "soundOn")}</span>
          </button>
        </div>
      </header>
      {notice && (
        <div className="notice" role="alert">
          {translateMessage(notice, t)}
          <button onClick={() => setNotice(null)}>{t("dismiss")}</button>
        </div>
      )}
      {storageError && (
        <div className="notice" role="alert">
          {translateMessage(storageError, t)}
          <button onClick={() => setLibrary((old) => ({ ...old }))}>
            {t("retry")}
          </button>
        </div>
      )}
      {soundError && (
        <div className="notice" role="alert">
          {translateMessage(soundError, t)}
        </div>
      )}
      {view === "edit" ? (
        <main className="editor">
          <LibraryToolbar library={library} onChange={setLibrary} />
          <div className="workspace">
            <section className="timeline" aria-label={t("routineTimeline")}>
              <DndContext
                sensors={sensors}
                accessibility={{
                  screenReaderInstructions: {
                    draggable: t("dragInstructions"),
                  },
                  announcements: {
                    onDragStart: ({ active }) =>
                      t("dragStarted", { name: dragName(active.id) }),
                    onDragOver: ({ active, over }) =>
                      over
                        ? t("dragOver", {
                            name: dragName(active.id),
                            target: dragName(over.id),
                          })
                        : t("dragOutside", { name: dragName(active.id) }),
                    onDragEnd: ({ active, over }) =>
                      over
                        ? t("dragEnded", {
                            name: dragName(active.id),
                            target: dragName(over.id),
                          })
                        : t("dragOutside", { name: dragName(active.id) }),
                    onDragCancel: ({ active }) =>
                      t("dragCancelled", { name: dragName(active.id) }),
                  },
                }}
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
                                          aria-label={t("intervalName")}
                                          placeholder={t("untitledInterval")}
                                          value={item.name}
                                          onChange={(e) =>
                                            update(item.id, {
                                              name: e.target.value,
                                            })
                                          }
                                        />
                                        {item.seconds === 0 && (
                                          <small className="field-error">
                                            {t("durationRequired")}
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
                                    {t("emptySeries")}
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
                                                interval(t("newInterval")),
                                              ],
                                            }
                                          : b,
                                      ),
                                    )
                                  }
                                >
                                  <Plus size={16} /> {t("addToSeries")}
                                </button>
                              </div>
                            )
                          }
                        >
                          <div className="item-details">
                            <span className="type-label">
                              {t(
                                block.kind === "series"
                                  ? "seriesType"
                                  : "intervalType",
                              )}
                            </span>
                            <input
                              className="name-input"
                              aria-label={
                                block.kind === "series"
                                  ? t("seriesName")
                                  : t("intervalName")
                              }
                              placeholder={
                                block.kind === "series"
                                  ? t("untitledSeries")
                                  : t("untitledInterval")
                              }
                              value={block.name}
                              onChange={(e) =>
                                update(block.id, { name: e.target.value })
                              }
                            />
                            {block.kind === "series" && (
                              <label className="repeat-control">
                                {t("rounds")}
                                <input
                                  type="number"
                                  min="1"
                                  max="99"
                                  step="1"
                                  aria-label={t("roundsFor", {
                                    name: block.name || t("untitledSeries"),
                                  })}
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
                                {t("intervalCount", {
                                  count: block.intervals.length,
                                })}{" "}
                                × {block.repeats ?? 1}
                              </small>
                            </span>
                          )}
                        </SortableCard>
                        {block.kind === "interval" && block.seconds === 0 && (
                          <p className="field-error standalone-error">
                            {t("durationRequired")}
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
                  <h3>{t("emptyRoutine")}</h3>
                  <p>{t("emptyRoutineHelp")}</p>
                </div>
              )}
              <div className="add-buttons">
                <button
                  onClick={() =>
                    setBlocks((old) => [...old, interval(t("newInterval"))])
                  }
                >
                  <Plus size={18} /> {t("addInterval")}
                </button>
                <button
                  onClick={() =>
                    setBlocks((old) => [
                      ...old,
                      {
                        id: uid(),
                        kind: "series",
                        name: t("newSeries"),
                        intervals: [interval(t("newInterval"))],
                      },
                    ])
                  }
                >
                  <Layers size={18} /> {t("addSeries")}
                </button>
              </div>
              <p className="editor-hint">
                <GripVertical size={14} /> {t("reorderHint")}
              </p>
            </section>
            <aside className="sidebar">
              <div className="summary-card">
                <h2>{t("summary")}</h2>
                <div className="total-time">
                  {format(duration)}
                  <span>{t("totalDuration")}</span>
                </div>
                <div className="stats">
                  <div>
                    <strong>{steps.length}</strong>
                    <span>{t("intervalLabel", { count: steps.length })}</span>
                  </div>
                  <div>
                    <strong>{seriesCount}</strong>
                    <span>{t("seriesLabel", { count: seriesCount })}</span>
                  </div>
                </div>
                <button
                  className="primary start-button"
                  disabled={!canStart}
                  onClick={() => void start()}
                >
                  <Play size={19} fill="currentColor" /> {t("start")}
                </button>
                {!canStart && (
                  <p className="validation">
                    {!blocks.length
                      ? t("addBeforeStart")
                      : t("validBeforeStart")}
                  </p>
                )}
              </div>
              <button
                className="sound-preview"
                onClick={async () => {
                  await audio();
                  if (!beeper.current.muted) beeper.current.play(true);
                  else setSoundError(message("audioMuted"));
                }}
              >
                <Volume2 size={16} /> {t("previewSound")}
              </button>
            </aside>
          </div>
        </main>
      ) : (
        <main className="workout">
          <div className="workout-top">
            <button className="text-button" onClick={leave}>
              <ArrowLeft size={17} /> {t("backToEditor")}
            </button>
            <span className={`status-pill ${snapshot.status}`}>
              {completed
                ? t("completeStatus")
                : snapshot.status === "running"
                  ? t("running")
                  : t("paused")}
            </span>
          </div>
          <div className="player-card">
            <div className="eyebrow">
              {completed
                ? t("timelineType")
                : current?.seriesName || t("timelineType")}
            </div>
            <h1>
              {completed
                ? t("complete")
                : current?.name || t("untitledInterval")}
            </h1>
            <p className="interval-position">
              {completed
                ? t("completedIntervals", { count: steps.length })
                : `${t("intervalPosition", { current: snapshot.index + 1, total: steps.length })}${current?.rounds && current.rounds > 1 ? ` · ${t("roundPosition", { current: current.round, total: current.rounds })}` : ""}`}
            </p>
            <div
              className={`countdown ${!completed && snapshot.remaining <= 3000 ? "countdown-ending" : ""}`}
              role="timer"
              aria-label={t("timeRemaining")}
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
              <span>
                {t("percentComplete", { percent: Math.round(progress) })}
              </span>
              <span>
                {t("remaining", {
                  time: format(Math.ceil(Math.max(0, duration - elapsed))),
                })}
              </span>
            </div>
            <div className="playback-controls">
              <IconButton
                label={t("previousSeries")}
                disabled={
                  completed || (engine.current?.seriesTarget(-1) ?? -1) < 0
                }
                onClick={() => control((e) => e.jump(e.seriesTarget(-1)))}
              >
                <SkipBack size={23} />
                <span aria-hidden="true">{t("seriesLabel", { count: 1 })}</span>
              </IconButton>
              <IconButton
                label={t("previousInterval")}
                disabled={completed || snapshot.index === 0}
                onClick={() => control((e) => e.jump(e.index - 1))}
              >
                <ArrowLeft size={24} />
                <span aria-hidden="true">
                  {t("intervalLabel", { count: 1 })}
                </span>
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
                    ? t("playAgain")
                    : snapshot.status === "running"
                      ? t("pause")
                      : t("resume")}
                </span>
              </button>
              <IconButton
                label={t("nextInterval")}
                disabled={completed || snapshot.index >= steps.length - 1}
                onClick={() => control((e) => e.jump(e.index + 1))}
              >
                <ArrowRight size={24} />
                <span aria-hidden="true">
                  {t("intervalLabel", { count: 1 })}
                </span>
              </IconButton>
              <IconButton
                label={t("nextSeries")}
                disabled={
                  completed || (engine.current?.seriesTarget(1) ?? -1) < 0
                }
                onClick={() => control((e) => e.jump(e.seriesTarget(1)))}
              >
                <SkipForward size={23} />
                <span aria-hidden="true">{t("seriesLabel", { count: 1 })}</span>
              </IconButton>
            </div>
            <button
              className="text-button reset-button"
              onClick={() => control((e) => e.reset())}
            >
              <RotateCcw size={15} /> {t("reset")}
            </button>
          </div>
          <div className="up-next">
            <span className="eyebrow">
              {completed ? t("totalDuration") : t("upNext")}
            </span>
            <strong>
              {completed ? t("complete") : next?.name || t("complete")}
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
