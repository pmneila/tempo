import { useEffect, useId, useRef } from "react";
import { Check, ChevronDown, FilePlus2 } from "lucide-react";
import type { SavedTimeline } from "./library";

type Props = {
  timelines: SavedTimeline[];
  sourceId: string | null;
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (id: string | null) => void;
};
export default function TimelineChooser({
  timelines,
  sourceId,
  open,
  disabled,
  onOpenChange,
  onChoose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const focus = useRef<"first" | "last" | "current">("current");
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const items =
      menu.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]');
    if (items?.length) {
      const current = menu.current?.querySelector<HTMLButtonElement>(
        '[aria-checked="true"]',
      );
      (focus.current === "last"
        ? items[items.length - 1]
        : focus.current === "first"
          ? items[0]
          : (current ?? items[0])
      ).focus();
    }
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, onOpenChange]);
  function close() {
    onOpenChange(false);
    trigger.current?.focus();
  }
  function choose(id: string | null) {
    close();
    onChoose(id);
  }
  return (
    <div ref={ref} className="timeline-chooser">
      <button
        ref={trigger}
        type="button"
        className="icon-button timeline-chooser-trigger"
        aria-label="Choose timeline"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => {
          focus.current = "current";
          onOpenChange(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            focus.current = event.key === "ArrowDown" ? "first" : "last";
            onOpenChange(true);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            close();
          }
        }}
      >
        <ChevronDown size={19} />
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label="Saved timelines"
          className="timeline-chooser-menu"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
              return;
            }
            if (event.key === "Tab") {
              close();
              return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const items = Array.from(
              menu.current?.querySelectorAll<HTMLButtonElement>(
                '[role^="menuitem"]',
              ) ?? [],
            );
            if (!items.length) return;
            const current = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (current +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      items.length) %
                    items.length;
            items[next].focus();
            items[next].scrollIntoView({ block: "nearest" });
          }}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="chooser-new"
            onClick={() => choose(null)}
          >
            <FilePlus2 size={16} /> New timeline
          </button>
          <div role="separator" className="chooser-separator" />
          {timelines.length ? (
            <div className="chooser-list">
              {timelines.map((t) => (
                <button
                  type="button"
                  role="menuitemradio"
                  tabIndex={-1}
                  aria-checked={t.id === sourceId}
                  key={t.id}
                  onClick={() => choose(t.id)}
                  title={t.name}
                >
                  <span className="chooser-name">{t.name}</span>
                  {t.id === sourceId && <Check size={15} />}
                </button>
              ))}
            </div>
          ) : (
            <p className="chooser-empty">No saved timelines</p>
          )}
        </div>
      )}
    </div>
  );
}
