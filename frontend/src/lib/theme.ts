import { createContext, useContext } from "react"

export type Theme = "light" | "dark" | "system"

/** Same key the pre-paint script in index.html reads. */
export const THEME_STORAGE_KEY = "mizan-theme"

export interface ThemeState {
  theme: Theme
  resolvedTheme: "light" | "dark"
  setTheme: (t: Theme) => void
}

export const ThemeContext = createContext<ThemeState>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
})

export function useTheme(): ThemeState {
  return useContext(ThemeContext)
}

export function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    return v === "light" || v === "dark" || v === "system" ? v : "system"
  } catch {
    return "system" // storage blocked (private mode, sandboxed preview)
  }
}

export function storeTheme(t: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, t)
  } catch {
    /* storage blocked: the choice lasts for this page view only */
  }
}
