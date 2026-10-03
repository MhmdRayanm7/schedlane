import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyThemeToDocument,
  getStoredThemePreference,
  getSystemTheme,
  parseThemePreference,
  resolveEffectiveTheme,
  setStoredThemePreference,
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
  THEME_STORAGE_KEY,
} from "../src/shared/theme/theme";

describe("theme logic", () => {
  describe("parseThemePreference", () => {
    it("parses valid preferences", () => {
      expect(parseThemePreference("light")).toBe("light");
      expect(parseThemePreference("dark")).toBe("dark");
      expect(parseThemePreference("system")).toBe("system");
    });

    it("returns null for invalid values", () => {
      expect(parseThemePreference("auto")).toBeNull();
      expect(parseThemePreference("")).toBeNull();
      expect(parseThemePreference(123)).toBeNull();
      expect(parseThemePreference(null)).toBeNull();
      expect(parseThemePreference(undefined)).toBeNull();
    });
  });

  describe("resolveEffectiveTheme", () => {
    it("returns light when preference is explicitly light, regardless of OS", () => {
      expect(resolveEffectiveTheme("light", "dark")).toBe("light");
      expect(resolveEffectiveTheme("light", "light")).toBe("light");
    });

    it("returns dark when preference is explicitly dark, regardless of OS", () => {
      expect(resolveEffectiveTheme("dark", "light")).toBe("dark");
      expect(resolveEffectiveTheme("dark", "dark")).toBe("dark");
    });

    it("follows system theme when preference is system", () => {
      expect(resolveEffectiveTheme("system", "dark")).toBe("dark");
      expect(resolveEffectiveTheme("system", "light")).toBe("light");
    });
  });

  describe("storage and environment fallbacks", () => {
    let mockStorage: Record<string, string> = {};

    beforeEach(() => {
      mockStorage = {};
      const fakeLocalStorage = {
        getItem: vi.fn((key: string) => mockStorage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
        clear: vi.fn(() => {
          mockStorage = {};
        }),
        length: 0,
        key: vi.fn(),
      };

      vi.stubGlobal("window", {
        localStorage: fakeLocalStorage,
        matchMedia: vi.fn((query: string) => ({
          matches: query.includes("dark"),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("defaults to system when no preference is stored", () => {
      expect(getStoredThemePreference()).toBe("system");
    });

    it("restores valid stored preference", () => {
      mockStorage[THEME_STORAGE_KEY] = "dark";
      expect(getStoredThemePreference()).toBe("dark");

      mockStorage[THEME_STORAGE_KEY] = "light";
      expect(getStoredThemePreference()).toBe("light");
    });

    it("falls back safely to system when stored value is invalid", () => {
      mockStorage[THEME_STORAGE_KEY] = "invalid-theme-value";
      expect(getStoredThemePreference()).toBe("system");
    });

    it("persists theme preference to local storage", () => {
      setStoredThemePreference("dark");
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        THEME_STORAGE_KEY,
        "dark",
      );
      expect(mockStorage[THEME_STORAGE_KEY]).toBe("dark");
    });

    it("detects system theme correctly using matchMedia", () => {
      expect(getSystemTheme()).toBe("dark");

      vi.stubGlobal("window", {
        matchMedia: vi.fn(() => ({
          matches: false,
        })),
      });
      expect(getSystemTheme()).toBe("light");
    });
  });

  describe("applyThemeToDocument", () => {
    let mockMeta: { name: string; content: string };
    let mockRoot: {
      attributes: Record<string, string>;
      setAttribute: (k: string, v: string) => void;
      getAttribute: (k: string) => string | undefined;
      style: { colorScheme: string };
    };

    beforeEach(() => {
      mockMeta = { name: "theme-color", content: "" };
      mockRoot = {
        attributes: {},
        setAttribute(k: string, v: string) {
          this.attributes[k] = v;
        },
        getAttribute(k: string) {
          return this.attributes[k];
        },
        style: { colorScheme: "" },
      };

      vi.stubGlobal("document", {
        documentElement: mockRoot,
        querySelector: vi.fn((selector: string) => {
          if (selector === 'meta[name="theme-color"]') return mockMeta;
          return null;
        }),
        createElement: vi.fn(() => ({ name: "", content: "" })),
        head: { appendChild: vi.fn() },
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("applies dark theme data-theme, colorScheme and meta theme-color", () => {
      applyThemeToDocument("dark");
      expect(mockRoot.getAttribute("data-theme")).toBe("dark");
      expect(mockRoot.style.colorScheme).toBe("dark");
      expect(mockMeta.content).toBe(THEME_COLOR_DARK);
    });

    it("applies light theme data-theme, colorScheme and meta theme-color", () => {
      applyThemeToDocument("light");
      expect(mockRoot.getAttribute("data-theme")).toBe("light");
      expect(mockRoot.style.colorScheme).toBe("light");
      expect(mockMeta.content).toBe(THEME_COLOR_LIGHT);
    });
  });

  describe("ThemeToggle component", () => {
    it("renders segmented controls for Light, Dark, and System", async () => {
      const { renderToStaticMarkup } = await import("react-dom/server");
      const { ThemeProvider } = await import(
        "../src/shared/theme/theme-context"
      );
      const { ThemeToggle } = await import("../src/shared/theme/theme-toggle");

      const html = renderToStaticMarkup(
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>,
      );

      expect(html).toContain('aria-label="Theme preference"');
      expect(html).toContain('aria-label="Light theme"');
      expect(html).toContain('aria-label="Dark theme"');
      expect(html).toContain('aria-label="System theme"');
      expect(html).toContain('aria-pressed="true"');
    });
  });
});
