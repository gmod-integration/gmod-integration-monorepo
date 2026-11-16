import { createSignal } from 'solid-js'

/**
 * Theme preference: `auto` follows the OS/browser `prefers-color-scheme` and switches live when it changes.
 * The resolved theme is written to `<html data-theme>`, which daisyUI reads.
 *
 * index.html applies the same logic in an inline script before the first paint (no flash of the wrong
 * theme): keep the storage key and values in sync with it.
 */
export type ThemeMode = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'theme'
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

const parseMode = (value: string | null): ThemeMode =>
  value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto'

const readStoredMode = (): ThemeMode => {
  try {
    return parseMode(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'auto'
  }
}

const [themeMode, setThemeModeSignal] = createSignal<ThemeMode>(readStoredMode())
const [systemPrefersDark, setSystemPrefersDark] = createSignal(darkQuery.matches)

export { themeMode }

export const resolvedTheme = (): 'light' | 'dark' => {
  const mode = themeMode()
  if (mode !== 'auto') return mode
  return systemPrefersDark() ? 'dark' : 'light'
}

const applyTheme = () => {
  document.documentElement.setAttribute('data-theme', resolvedTheme())
}

export const setThemeMode = (mode: ThemeMode) => {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Storage blocked (private mode…): the choice still applies for this page.
  }
  setThemeModeSignal(mode)
  applyTheme()
}

// Desktop preference changed (e.g. the OS switched to dark at sunset): only visible in `auto` mode.
darkQuery.addEventListener('change', (event) => {
  setSystemPrefersDark(event.matches)
  applyTheme()
})

// Theme changed in another tab.
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return
  setThemeModeSignal(parseMode(event.newValue))
  applyTheme()
})

applyTheme()
