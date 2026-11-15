import en from "./locales/en.json";
import type { TFunction } from "i18next";
type CatalogKey = keyof typeof en;
export type MessageKey =
  | CatalogKey
  | (CatalogKey extends infer K
      ? K extends `${infer Base}_one`
        ? Base
        : never
      : never);
export type Message = {
  key: MessageKey;
  values?: Record<string, string | number>;
};
export class AppError extends Error {
  constructor(
    public code: CatalogKey,
    public values?: Message["values"],
  ) {
    super(en[code]);
    this.name = "AppError";
  }
}
export const message = (
  key: MessageKey,
  values?: Message["values"],
): Message => ({ key, ...(values ? { values } : {}) });
export const errorMessage = (
  error: unknown,
  fallback: MessageKey = "unexpectedError",
): Message =>
  error instanceof AppError
    ? message(error.code, error.values)
    : message(fallback);
export const translateMessage = (
  value: Message | null | undefined,
  t: TFunction,
): string => (value ? t(value.key, value.values ?? {}) : "");
