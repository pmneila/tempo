import { afterEach, describe, expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import en from "./locales/en.json";
import es from "./locales/es.json";
import {
  detectLanguage,
  i18n,
  initialLanguage,
  initializeLanguage,
  LANGUAGE_KEY,
  resources,
  selectLanguage,
} from "./i18n";
import { defaultNames } from "./defaultNames";
import { AppError, errorMessage, message, translateMessage } from "./messages";
import {
  emptyDraft,
  exportTimeline,
  exportTimelines,
  isDirty,
  LIBRARY_KEY,
  loadLibrary,
  loadTimeline,
  newTimeline,
  parseLibrary,
  renameDraft,
  saveDraft,
  type Library,
} from "./library";
import { flatten, interval, starter, STORAGE_KEY } from "./model";
import { TimerEngine } from "./engine";
import App from "./App";
import TimelineChooser from "./TimelineChooser";
import WorkoutTimeline from "./WorkoutTimeline";
afterEach(async () => {
  vi.unstubAllGlobals();
  await i18n.changeLanguage("en");
});
const params = (text: string) =>
  [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
describe("translation catalogs", () => {
  it("provides matching keys and interpolation parameters in both languages", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(es[key].trim()).not.toBe("");
      expect(params(es[key]), key).toEqual(params(en[key]));
    }
  });
  it("handles zero, singular and plural counts", () => {
    const english = i18n.getFixedT("en");
    const spanish = i18n.getFixedT("es");
    expect(english("intervalCount", { count: 0 })).toBe("0 intervals");
    expect(english("intervalCount", { count: 1 })).toBe("1 interval");
    expect(spanish("intervalCount", { count: 1 })).toBe("1 intervalo");
    expect(spanish("intervalCount", { count: 2 })).toBe("2 intervalos");
    expect(spanish("imported", { count: 1 })).toBe(
      "Se ha importado 1 secuencia.",
    );
    expect(spanish("imported", { count: 2 })).toBe(
      "Se han importado 2 secuencias.",
    );
    expect(spanish("roundPosition", { current: 2, total: 3 })).toBe(
      "Ronda 2 de 3",
    );
  });
  it("falls back to English for a missing translation", async () => {
    const instance = createInstance();
    await instance.init({
      resources: { en: resources.en, es: { translation: {} } },
      lng: "es",
      fallbackLng: "en",
      initAsync: false,
    });
    expect(instance.t("start")).toBe("Start");
  });
  it("uses stable error codes and renders existing messages in the selected language", () => {
    const error = new AppError("nameRequired");
    const descriptor = errorMessage(error);
    expect(error.code).toBe("nameRequired");
    expect(translateMessage(descriptor, i18n.getFixedT("en"))).toBe(
      "Enter a timeline name.",
    );
    expect(translateMessage(descriptor, i18n.getFixedT("es"))).toBe(
      "Introduce un nombre para la secuencia.",
    );
    expect(
      errorMessage(Error("Internal implementation detail"), "fileReadFailure"),
    ).toEqual(message("fileReadFailure"));
  });
});
describe("language selection", () => {
  it("prefers an explicit saved choice and otherwise matches browser regions in order", () => {
    expect(detectLanguage("en", ["es-ES"])).toBe("en");
    expect(detectLanguage("es", ["en-US"])).toBe("es");
    expect(detectLanguage(null, ["de-CH", "es-MX", "en-US"])).toBe("es");
    expect(detectLanguage("invalid", ["en-GB", "es-ES"])).toBe("en");
    expect(detectLanguage(null, ["fr-FR"])).toBe("en");
    expect(detectLanguage(null, [])).toBe("en");
  });
  it("initializes from browser preferences without persisting an automatic choice", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: () => null, setItem });
    vi.stubGlobal("navigator", { languages: ["es-AR"], language: "es-AR" });
    await initializeLanguage();
    expect(i18n.resolvedLanguage).toBe("es");
    expect(setItem).not.toHaveBeenCalled();
  });
  it("persists manual selections separately and restores them on startup", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: () => "es", setItem });
    vi.stubGlobal("navigator", { languages: ["en-US"] });
    expect(initialLanguage()).toBe("es");
    expect(await selectLanguage("es")).toBe(true);
    expect(setItem).toHaveBeenCalledExactlyOnceWith(LANGUAGE_KEY, "es");
  });
  it("keeps a session choice working when preference storage is blocked", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw Error();
      },
      setItem: () => {
        throw Error();
      },
    });
    vi.stubGlobal("navigator", { languages: ["es-ES"] });
    expect(initialLanguage()).toBe("es");
    expect(await selectLanguage("es")).toBe(false);
    expect(i18n.resolvedLanguage).toBe("es");
  });
  it("updates document language, title and description", async () => {
    const setAttribute = vi.fn();
    const document = {
      documentElement: { lang: "en" },
      title: "",
      querySelector: () => ({ setAttribute }),
    };
    vi.stubGlobal("document", document);
    await i18n.changeLanguage("es");
    expect(document.documentElement.lang).toBe("es");
    expect(document.title).toBe(es.pageTitle);
    expect(setAttribute).toHaveBeenCalledWith("content", es.pageDescription);
  });
});
describe("localized creation and preserved content", () => {
  it("creates the Spanish first-time example and a clean saved baseline", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const state = loadLibrary(defaultNames(i18n.getFixedT("es"))).library;
    expect(state.draft.name).toBe("Mi secuencia");
    expect(flatten(state.draft.blocks).map((i) => i.name)).toEqual([
      "Preparación",
      "Paso 1",
      "Descanso",
      "Paso 2",
      "Descanso",
      "Fin",
    ]);
    expect(isDirty(state)).toBe(false);
  });
  it("uses an original generated name to keep new localized drafts clean across reloads", () => {
    const state = newTimeline(
      { version: 2, timelines: [], draft: emptyDraft() },
      "Secuencia sin título",
    );
    expect(isDirty(state)).toBe(false);
    const restored = parseLibrary(JSON.parse(JSON.stringify(state)));
    expect(isDirty(restored)).toBe(false);
    expect(isDirty(renameDraft(restored, "Otra"))).toBe(true);
    expect(
      isDirty(
        parseLibrary({
          version: 2,
          timelines: [],
          draft: { sourceId: null, name: "Untitled timeline", blocks: [] },
        }),
      ),
    ).toBe(false);
  });
  it("preserves legacy content and existing saved names when another language is selected", () => {
    const blocks = [interval("My custom name", 10)];
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === STORAGE_KEY ? JSON.stringify({ version: 1, blocks }) : null,
    });
    const migrated = loadLibrary(defaultNames(i18n.getFixedT("es"))).library;
    expect(migrated.draft.blocks[0].name).toBe("My custom name");
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === LIBRARY_KEY ? JSON.stringify(migrated) : null,
    });
    expect(loadLibrary(defaultNames(i18n.getFixedT("en"))).library).toEqual(
      migrated,
    );
  });
  it("keeps language preferences and draft bookkeeping out of exported files", () => {
    const state = newTimeline(
      { version: 2, timelines: [], draft: emptyDraft() },
      "Secuencia sin título",
    );
    const saved = saveDraft(state);
    const file = JSON.parse(exportTimeline(state.draft));
    expect(Object.keys(file).sort()).toEqual([
      "blocks",
      "format",
      "name",
      "version",
    ]);
    expect(file.name).toBe("Secuencia sin título");
    expect(exportTimelines(saved.timelines)).not.toContain("initialName");
    expect(exportTimelines(saved.timelines)).not.toContain(LANGUAGE_KEY);
  });
  it("does not change timer state when translations change", async () => {
    let now = 0;
    const timer = new TimerEngine(flatten(starter()), () => now);
    timer.resume();
    now = 1234;
    timer.tick();
    const before = timer.snapshot();
    await i18n.changeLanguage("es");
    expect(timer.snapshot()).toEqual(before);
    timer.pause();
    const paused = timer.snapshot();
    await i18n.changeLanguage("en");
    expect(timer.snapshot()).toEqual(paused);
  });
});
describe("translated rendering", () => {
  it("renders a complete Spanish first-time editor with localized default names", async () => {
    await i18n.changeLanguage("es");
    vi.stubGlobal("localStorage", { getItem: () => null });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('value="Mi secuencia"');
    expect(html).toContain('value="Preparación"');
    expect(html).toContain("Guardar como nueva");
    expect(html).toContain("Añadir intervalo");
    expect(html).toContain("Iniciar");
    expect(html).toContain("Arrastrar Preparación");
  });
  it("translates chooser controls but preserves saved names and duration", async () => {
    await i18n.changeLanguage("es");
    const state = loadTimeline(
      {
        version: 2,
        timelines: [
          { id: "saved", name: "My saved timeline", blocks: starter() },
        ],
        draft: emptyDraft(),
      },
      "saved",
    );
    const html = renderToStaticMarkup(
      <TimelineChooser
        timelines={state.timelines}
        sourceId="saved"
        open
        disabled={false}
        onOpenChange={() => {}}
        onChoose={() => {}}
      />,
    );
    expect(html).toContain("Elegir secuencia");
    expect(html).toContain("Nueva secuencia");
    expect(html).toContain("My saved timeline");
    expect(html).toContain("04:00");
  });
  it("translates SVG descriptions and completion messages", async () => {
    await i18n.changeLanguage("es");
    const steps = flatten([
      {
        id: "s",
        name: "User series",
        kind: "series",
        repeats: 2,
        intervals: [interval("User interval", 5)],
      },
    ]);
    const html = renderToStaticMarkup(
      <WorkoutTimeline
        steps={steps}
        snapshot={{ index: 1, remaining: 5000, status: "paused" }}
      />,
    );
    expect(html).toContain(
      "En pausa. Intervalo 2 de 2: User interval, User series, ronda 2 de 2",
    );
    expect(html).toContain("User series · Ronda 2/2 · User interval · 00:05");
    expect(
      renderToStaticMarkup(
        <WorkoutTimeline
          steps={steps}
          snapshot={{ index: 1, remaining: 0, status: "complete" }}
        />,
      ),
    ).toContain("Secuencia completada");
  });
});
