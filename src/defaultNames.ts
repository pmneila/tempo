import en from "./locales/en.json";
import type { TFunction } from "i18next";
export const englishNames = {
  untitledTimeline: en.untitledTimeline,
  myTimeline: en.myTimeline,
  preparation: en.preparation,
  mainSequence: en.mainSequence,
  step1: en.step1,
  step2: en.step2,
  breakName: en.breakName,
  finish: en.finish,
};
export type DefaultNames = typeof englishNames;
export function defaultNames(t: TFunction): DefaultNames {
  return Object.fromEntries(
    Object.keys(englishNames).map((key) => [key, t(key as keyof DefaultNames)]),
  ) as DefaultNames;
}
