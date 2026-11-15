import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  Copy,
  Download,
  MoreHorizontal,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import {
  deleteTimeline,
  duplicateTimeline,
  exportTimeline,
  exportTimelines,
  readTimelineFile,
  mergeTimelines,
  renameDraft,
  isDirty,
  loadTimeline,
  MAX_LIBRARY_IMPORT_BYTES,
  newTimeline,
  saveDraft,
  uniqueName,
  type Draft,
  type Library,
} from "./library";

import TimelineChooser from "./TimelineChooser";

type Action =
  | { type: "load"; id: string }
  | { type: "new" }
  | { type: "duplicate" }
  | { type: "delete" }
  | { type: "import"; draft: Draft };
type ModalState =
  | { type: "unsaved"; action: Action }
  | { type: "name" }
  | { type: "delete"; id: string; name: string };
function Modal({
  children,
  onCancel,
}: {
  children: ReactNode;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="library-dialog"
      aria-labelledby="library-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      {children}
    </dialog>
  );
}
export default function LibraryToolbar({
  library,
  onChange,
}: {
  library: Library;
  onChange: Dispatch<SetStateAction<Library>>;
}) {
  const [options, setOptions] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const changeChooser = useCallback((open: boolean) => {
    setChooser(open);
    if (open) setOptions(false);
  }, []);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const latest = useRef(library);
  latest.current = library;
  const dirty = isDirty(library);
  const source = library.timelines.find((t) => t.id === library.draft.sourceId);
  useEffect(() => {
    if (!options) return;
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOptions(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOptions(false);
        menuRef.current
          ?.querySelector<HTMLButtonElement>(".library-more")
          ?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [options]);
  function execute(action: Action, state = latest.current) {
    try {
      setOptions(false);
      if (action.type === "delete") {
        const source = state.timelines.find(
          (t) => t.id === state.draft.sourceId,
        );
        if (source)
          setModal({ type: "delete", id: source.id, name: source.name });
        return;
      }
      const next =
        action.type === "load"
          ? loadTimeline(state, action.id)
          : action.type === "new"
            ? newTimeline(state)
            : action.type === "duplicate"
              ? duplicateTimeline(state)
              : {
                  ...state,
                  draft: {
                    ...action.draft,
                    name: uniqueName(action.draft.name, state.timelines),
                  },
                };
      onChange(next);
      setModal(null);
    } catch (e) {
      setModal(null);
      setError((e as Error).message);
    }
  }
  function request(action: Action) {
    setOptions(false);
    setChooser(false);
    setError("");
    setImportMessage("");
    if (isDirty(latest.current)) setModal({ type: "unsaved", action });
    else execute(action);
  }
  function openSaveAs() {
    setOptions(false);
    setChooser(false);
    setImportMessage("");
    setNameError("");
    setName(
      uniqueName(
        `${latest.current.draft.name.trim() || "Untitled timeline"} copy`,
        latest.current.timelines,
      ),
    );
    setModal({ type: "name" });
  }
  function save(after?: Action) {
    try {
      const next = saveDraft(latest.current);
      onChange(next);
      if (after) execute(after, next);
      else setModal(null);
    } catch (e) {
      setModal(null);
      setError((e as Error).message);
    }
  }
  async function readFile(file?: File) {
    if (!file) return;
    setOptions(false);
    setError("");
    setImportMessage("");
    setReading(true);
    try {
      if (file.size > MAX_LIBRARY_IMPORT_BYTES)
        throw Error("Choose a library file smaller than 10 MB.");
      const text = await file.text();
      const result = readTimelineFile(text, latest.current.timelines);
      if (result.kind === "library") {
        onChange((old) => mergeTimelines(old, result.timelines));
        const count = result.timelines.length;
        setImportMessage(
          count
            ? `Imported ${count} ${count === 1 ? "timeline" : "timelines"}.`
            : "No timelines to import.",
        );
      } else request({ type: "import", draft: result.draft });
    } catch (e) {
      setError((e as Error).message || "Could not read this file.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function download(all = false) {
    setOptions(false);
    try {
      const url = URL.createObjectURL(
        new Blob(
          [
            all
              ? exportTimelines(latest.current.timelines)
              : exportTimeline(latest.current.draft),
          ],
          {
            type: "application/json",
          },
        ),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = all
        ? "tempo-timelines.json"
        : `${
            latest.current.draft.name
              .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
              .slice(0, 180)
              .trim() || "timeline"
          }.tempo.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Could not export this timeline. Try again.");
    }
  }
  return (
    <section className="library-toolbar" aria-label="Timeline library">
      <div className="library-row">
        <div className="timeline-title-group">
          <h2 aria-label="Timeline" className="timeline-title">
            <span aria-hidden="true" className="timeline-name-size">
              {library.draft.name || "Untitled timeline"}
            </span>
            <input
              className="name-input timeline-name"
              aria-label="Timeline name"
              placeholder="Untitled timeline"
              value={library.draft.name}
              onChange={(event) =>
                onChange((old) => renameDraft(old, event.target.value))
              }
              aria-invalid={!library.draft.name.trim()}
              aria-describedby={
                !library.draft.name.trim() ? "draft-name-error" : undefined
              }
            />
          </h2>
          <TimelineChooser
            timelines={library.timelines}
            sourceId={library.draft.sourceId}
            open={chooser}
            disabled={reading}
            onOpenChange={changeChooser}
            onChoose={(id) =>
              request(id === null ? { type: "new" } : { type: "load", id })
            }
          />
        </div>
        <div className="library-buttons">
          {(reading || dirty) && (
            <p className="draft-status" role="status">
              {reading ? "Reading timeline…" : "Unsaved changes"}
            </p>
          )}
          <button
            className="primary library-save"
            onClick={() => save()}
            disabled={
              reading || !library.draft.name.trim() || (!!source && !dirty)
            }
          >
            <Save size={16} /> Save
          </button>
          <button
            className="library-secondary"
            onClick={openSaveAs}
            disabled={reading}
          >
            Save as new
          </button>
          <div className="library-menu-wrap" ref={menuRef}>
            <button
              className="icon-button library-more"
              aria-label="Timeline options"
              aria-expanded={options}
              onClick={() => {
                setChooser(false);
                setOptions(!options);
                setImportMessage("");
              }}
              disabled={reading}
            >
              <MoreHorizontal size={20} />
            </button>
            {options && (
              <div className="library-options">
                <button
                  onClick={() => request({ type: "duplicate" })}
                  disabled={!source}
                >
                  <Copy size={15} /> Duplicate
                </button>
                <button onClick={() => fileRef.current?.click()}>
                  <Upload size={15} /> Import…
                </button>
                <button onClick={() => download()}>
                  <Download size={15} /> Export
                </button>
                <button
                  onClick={() => download(true)}
                  disabled={!library.timelines.length}
                >
                  <Download size={15} /> Export all timelines
                </button>
                <button
                  className="delete"
                  onClick={() => request({ type: "delete" })}
                  disabled={!source}
                >
                  <Trash2 size={15} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {!library.draft.name.trim() && (
        <p className="field-error" id="draft-name-error">
          Enter a timeline name before saving.
        </p>
      )}
      {importMessage && (
        <p className="import-status" role="status">
          {importMessage}
        </p>
      )}
      {error && (
        <div className="library-error" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Import timeline file"
        onChange={(event) => void readFile(event.target.files?.[0])}
      />
      {modal && (
        <Modal onCancel={() => setModal(null)}>
          {modal.type === "unsaved" && (
            <>
              <h2 id="library-dialog-title">Unsaved changes</h2>
              <p>Save changes to “{library.draft.name}” before continuing?</p>
              <div className="dialog-actions">
                <button
                  className="library-secondary"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  className="library-secondary"
                  onClick={() => execute(modal.action)}
                >
                  Discard changes
                </button>
                <button className="primary" onClick={() => save(modal.action)}>
                  Save
                </button>
              </div>
            </>
          )}
          {modal.type === "name" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  const next = saveDraft(latest.current, name, true);
                  onChange(next);
                  setModal(null);
                } catch (e) {
                  setNameError((e as Error).message);
                }
              }}
            >
              <h2 id="library-dialog-title">Save as new timeline</h2>
              <label className="dialog-name">
                Name
                <input
                  value={name}
                  autoFocus
                  required
                  onChange={(event) => {
                    setName(event.target.value);
                    setNameError("");
                  }}
                  aria-invalid={!!nameError}
                  aria-describedby={
                    nameError ? "timeline-name-error" : undefined
                  }
                />
              </label>
              {nameError && (
                <p
                  id="timeline-name-error"
                  className="field-error"
                  role="alert"
                >
                  {nameError}
                </p>
              )}
              <div className="dialog-actions">
                <button
                  type="button"
                  className="library-secondary"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Save
                </button>
              </div>
            </form>
          )}
          {modal.type === "delete" && (
            <>
              <h2 id="library-dialog-title">Delete timeline?</h2>
              <p>
                Delete “{modal.name}” from your saved timelines? This cannot be
                undone.
              </p>
              <div className="dialog-actions">
                <button
                  className="library-secondary"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  className="library-danger"
                  onClick={() => {
                    onChange(deleteTimeline(latest.current, modal.id));
                    setModal(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
