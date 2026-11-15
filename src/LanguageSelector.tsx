import { useEffect, useRef, useState } from "react";
import { Check, Globe } from "lucide-react";
import {
  selectLanguage,
  languageLabels,
  useTranslation,
  type Language,
} from "./i18n";
export default function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const locale = i18n.resolvedLanguage || "en";
  useEffect(() => {
    if (!open) return;
    menu.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus();
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function close() {
    setOpen(false);
    button.current?.focus();
  }
  async function choose(value: Language) {
    close();
    setFailed(!(await selectLanguage(value)));
  }
  return (
    <div ref={ref} className="language-selector">
      <button
        ref={button}
        className="language-trigger"
        type="button"
        aria-label={t("language")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Globe size={16} />
        <span>{locale.toUpperCase()}</span>
      </button>
      {open && (
        <div
          ref={menu}
          className="language-menu"
          role="menu"
          aria-label={t("language")}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            } else if (e.key === "Tab") close();
            else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
              e.preventDefault();
              const items = Array.from(
                menu.current!.querySelectorAll<HTMLButtonElement>("button"),
              );
              const index = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              items[
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? items.length - 1
                    : (index + (e.key === "ArrowUp" ? -1 : 1) + items.length) %
                      items.length
              ].focus();
            }
          }}
        >
          {(Object.entries(languageLabels) as [Language, string][]).map(
            ([code, label]) => (
              <button
                type="button"
                key={code}
                role="menuitemradio"
                aria-checked={locale === code}
                tabIndex={-1}
                onClick={() => void choose(code)}
                lang={code}
              >
                {label}
                {locale === code && <Check size={14} />}
              </button>
            ),
          )}
          {failed && <p role="status">{t("languageSaveFailure")}</p>}
        </div>
      )}
    </div>
  );
}
