/**
 * Supported translation languages.
 */
export const SUPPORTED_LANGS = ["ru", "uk", "en"] as const;

export type Lang = (typeof SUPPORTED_LANGS)[number];

/**
 * Normalize input language.
 */
export function pickLang(
  value: unknown,
  fallback: Lang = "ru"
): Lang {
  const normalized = String(value ?? "").toLowerCase();

  return (SUPPORTED_LANGS as readonly string[]).includes(
    normalized
  )
    ? (normalized as Lang)
    : fallback;
}