import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"

import { readStoredTheme, storeTheme, ThemeContext, type Theme } from "@/lib/theme"

const QUERY = "(prefers-color-scheme: dark)"

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}

/** Light / dark / system, persisted in localStorage; toggles the `dark` class on <html>. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)
  const systemDark = useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches)
  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark")
  }, [resolvedTheme])

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme: (t: Theme) => {
        storeTheme(t)
        setThemeState(t)
      },
    }),
    [theme, resolvedTheme]
  ) as { theme: Theme; resolvedTheme: "light" | "dark"; setTheme: (t: Theme) => void }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
