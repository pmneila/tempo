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
  RotateCcw,
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
import { useTranslation } from "./i18n";
import {
  AppError,
  errorMessage,
  message,
  translateMessage,
  type Message,
} from "./messages";

type Action =
  | { type: "load"; id: string }
  | { type: "new" }
  | { type: "duplicate" }
  | { type: "delete" }
  | { type: "import"; draft: Draft };
type ModalState =
  | { type: "unsaved"; action: Action }
  | { type: "discard"; id: string; name: string }
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
  const { t } = useTranslation();
  const [options, setOptions] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [importMessage, setImportMessage] = useState<Message | null>(null);
  const changeChooser = useCallback((open: boolean) => {
    setChooser(open);
    if (open) setOptions(false);
  }, []);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<Message | null>(null);
  const [error, setError] = useState<Message | null>(null);
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
            ? newTimeline(state, t("untitledTimeline"))
            : action.type === "duplicate"
              ? duplicateTimeline(
                  state,
                  t("copyName", {
                    name:
                      state.timelines.find(
                        (entry) => entry.id === state.draft.sourceId,
                      )?.name || t("untitledTimeline"),
                  }),
                )
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
      setError(errorMessage(e));
    }
  }
  function request(action: Action) {
    setOptions(false);
    setChooser(false);
    setError(null);
    setImportMessage(null);
    if (isDirty(latest.current)) setModal({ type: "unsaved", action });
    else execute(action);
  }
  function openSaveAs() {
    setOptions(false);
    setChooser(false);
    setImportMessage(null);
    setNameError(null);
    setName(
      uniqueName(
        t("copyName", {
          name: latest.current.draft.name.trim() || t("untitledTimeline"),
        }),
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
      setError(errorMessage(e));
    }
  }
  async function readFile(file?: File) {
    if (!file) return;
    setOptions(false);
    setError(null);
    setImportMessage(null);
    setReading(true);
    try {
      if (file.size > MAX_LIBRARY_IMPORT_BYTES)
        throw new AppError("libraryFileSize");
      const text = await file.text();
      const result = readTimelineFile(text, latest.current.timelines);
      if (result.kind === "library") {
        onChange((old) => mergeTimelines(old, result.timelines));
        const count = result.timelines.length;
        setImportMessage(
          count ? message("imported", { count }) : message("nothingToImport"),
        );
      } else request({ type: "import", draft: result.draft });
    } catch (e) {
      setError(errorMessage(e, "fileReadFailure"));
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
              : exportTimeline(latest.current.draft, t("untitledTimeline")),
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
      setError(message("exportFailure"));
    }
  }
  return (
    <section className="library-toolbar" aria-label={t("library")}>
      <div className="library-row">
        <div className="timeline-title-group">
          <h2 aria-label={t("timeline")} className="timeline-title">
            <span aria-hidden="true" className="timeline-name-size">
              {library.draft.name || t("untitledTimeline")}
            </span>
            <input
              className="name-input timeline-name"
              aria-label={t("timelineName")}
              placeholder={t("untitledTimeline")}
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
              {t(reading ? "reading" : "unsaved")}
            </p>
          )}
          <button
            className="primary library-save"
            onClick={() => save()}
            disabled={
              reading || !library.draft.name.trim() || (!!source && !dirty)
            }
          >
            <Save size={16} /> {t("save")}
          </button>
          <button
            className="library-secondary"
            onClick={openSaveAs}
            disabled={reading}
          >
            {t("saveAsNew")}
          </button>
          <div className="library-menu-wrap" ref={menuRef}>
            <button
              className="icon-button library-more"
              aria-label={t("timelineOptions")}
              aria-expanded={options}
              onClick={() => {
                setChooser(false);
                setOptions(!options);
                setImportMessage(null);
              }}
              disabled={reading}
            >
              <MoreHorizontal size={20} />
            </button>
            {options && (
              <div className="library-options">
                <button
                  disabled={!source || !dirty}
                  onClick={() => {
                    if (!source || !dirty) return;
                    setOptions(false);
                    setError(null);
                    setImportMessage(null);
                    setModal({
                      type: "discard",
                      id: source.id,
                      name: source.name,
                    });
                  }}
                >
                  <RotateCcw size={15} /> {t("discardOption")}
                </button>
                <button
                  onClick={() => request({ type: "duplicate" })}
                  disabled={!source}
                >
                  <Copy size={15} /> {t("duplicate")}
                </button>
                <button onClick={() => fileRef.current?.click()}>
                  <Upload size={15} /> {t("import")}
                </button>
                <button onClick={() => download()}>
                  <Download size={15} /> {t("export")}
                </button>
                <button
                  onClick={() => download(true)}
                  disabled={!library.timelines.length}
                >
                  <Download size={15} /> {t("exportAll")}
                </button>
                <button
                  className="delete"
                  onClick={() => request({ type: "delete" })}
                  disabled={!source}
                >
                  <Trash2 size={15} /> {t("delete")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {!library.draft.name.trim() && (
        <p className="field-error" id="draft-name-error">
          {t("nameBeforeSave")}
        </p>
      )}
      {importMessage && (
        <p className="import-status" role="status">
          {translateMessage(importMessage, t)}
        </p>
      )}
      {error && (
        <div className="library-error" role="alert">
          {translateMessage(error, t)}
          <button onClick={() => setError(null)}>{t("dismiss")}</button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label={t("importFile")}
        onChange={(event) => void readFile(event.target.files?.[0])}
      />
      {modal && (
        <Modal onCancel={() => setModal(null)}>
          {modal.type === "discard" && (
            <>
              <h2 id="library-dialog-title">{t("discardTitle")}</h2>
              <p>{t("discardConfirmation", { name: modal.name })}</p>
              <div className="dialog-actions">
                <button
                  className="library-secondary"
                  autoFocus
                  onClick={() => setModal(null)}
                >
                  {t("cancel")}
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    try {
                      onChange(loadTimeline(latest.current, modal.id));
                      setModal(null);
                    } catch (e) {
                      setModal(null);
                      setError(errorMessage(e));
                    }
                  }}
                >
                  {t("discard")}
                </button>
              </div>
            </>
          )}
          {modal.type === "unsaved" && (
            <>
              <h2 id="library-dialog-title">{t("unsaved")}</h2>
              <p>{t("saveBeforeContinue", { name: library.draft.name })}</p>
              <div className="dialog-actions">
                <button
                  className="library-secondary"
                  onClick={() => setModal(null)}
                >
                  {t("cancel")}
                </button>
                <button
                  className="library-secondary"
                  onClick={() => execute(modal.action)}
                >
                  {t("discard")}
                </button>
                <button className="primary" onClick={() => save(modal.action)}>
                  {t("save")}
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
                  setNameError(errorMessage(e));
                }
              }}
            >
              <h2 id="library-dialog-title">{t("saveAsTitle")}</h2>
              <label className="dialog-name">
                {t("name")}
                <input
                  value={name}
                  autoFocus
                  required
                  onChange={(event) => {
                    setName(event.target.value);
                    setNameError(null);
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
                  {translateMessage(nameError, t)}
                </p>
              )}
              <div className="dialog-actions">
                <button
                  type="button"
                  className="library-secondary"
                  onClick={() => setModal(null)}
                >
                  {t("cancel")}
                </button>
                <button type="submit" className="primary">
                  {t("save")}
                </button>
              </div>
            </form>
          )}
          {modal.type === "delete" && (
            <>
              <h2 id="library-dialog-title">{t("deleteTitle")}</h2>
              <p>{t("deleteConfirmation", { name: modal.name })}</p>
              <div className="dialog-actions">
                <button
                  className="library-secondary"
                  onClick={() => setModal(null)}
                >
                  {t("cancel")}
                </button>
                <button
                  className="library-danger"
                  onClick={() => {
                    onChange(
                      deleteTimeline(
                        latest.current,
                        modal.id,
                        t("untitledTimeline"),
                      ),
                    );
                    setModal(null);
                  }}
                >
                  {t("delete")}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
