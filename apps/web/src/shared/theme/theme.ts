export type ThemePreference = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "schedlane-theme-preference";
export const THEME_COLOR_LIGHT = "#f7f8f8";
export const THEME_COLOR_DARK = "#0f1212";

export function parseThemePreference(value: unknown): ThemePreference | null {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return null;
}

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined" || !window.localStorage) {
    return "system";
  }
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return parseThemePreference(raw) ?? "system";
  } catch {
    return "system";
  }
}

export function setStoredThemePreference(preference: ThemePreference): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Local storage might be disabled or full; silently ignore
  }
}

export function getSystemTheme(): EffectiveTheme {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveEffectiveTheme(
  preference: ThemePreference,
  systemTheme: EffectiveTheme = getSystemTheme(),
): EffectiveTheme {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return systemTheme;
}

export function applyThemeToDocument(effectiveTheme: EffectiveTheme): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.setAttribute("data-theme", effectiveTheme);
  root.style.colorScheme = effectiveTheme;

  const themeColor =
    effectiveTheme === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;
  let meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = themeColor;
}
