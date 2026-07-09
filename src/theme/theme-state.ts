import type { ColorSchemePreference, ResolvedColorScheme } from './theme-types';

export const COLOR_SCHEME_STORAGE_KEY = 'darling.colorScheme';
const COLOR_SCHEME_VALUES = new Set<ColorSchemePreference>(['system', 'light', 'dark']);

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface MatchMediaLike {
  matches: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
}

interface WindowLike {
  localStorage?: StorageLike;
  matchMedia?: (query: string) => MatchMediaLike;
}

function globalWindow(): WindowLike | null {
  return (globalThis as unknown as { window?: WindowLike }).window || null;
}

function safeStorage(win: WindowLike | null | undefined): StorageLike | null {
  try {
    return win?.localStorage || null;
  } catch {
    return null;
  }
}

export function coerceColorSchemePreference(value: unknown): ColorSchemePreference {
  return COLOR_SCHEME_VALUES.has(value as ColorSchemePreference)
    ? value as ColorSchemePreference
    : 'system';
}

export function readColorSchemePreference(win: WindowLike | null | undefined = globalWindow()): ColorSchemePreference {
  const storage = safeStorage(win);
  if (!storage) return 'system';
  try {
    return coerceColorSchemePreference(storage.getItem(COLOR_SCHEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function writeColorSchemePreference(
  preference: ColorSchemePreference,
  win: WindowLike | null | undefined = globalWindow(),
): void {
  const storage = safeStorage(win);
  if (!storage) return;
  try {
    storage.setItem(COLOR_SCHEME_STORAGE_KEY, coerceColorSchemePreference(preference));
  } catch {
    // Storage can be disabled in private browsing or embedded previews.
  }
}

export function resolveColorSchemePreference(
  preference: ColorSchemePreference,
  win: WindowLike | null | undefined = globalWindow(),
): ResolvedColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  try {
    return win?.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function watchSystemColorScheme(
  win: WindowLike | null | undefined,
  onChange: () => void,
): () => void {
  let media: MatchMediaLike | null = null;
  try {
    media = win?.matchMedia?.('(prefers-color-scheme: dark)') || null;
  } catch {
    media = null;
  }
  if (!media) return () => {};
  if (media.addEventListener) {
    media.addEventListener('change', onChange);
    return () => media?.removeEventListener?.('change', onChange);
  }
  if (media.addListener) {
    media.addListener(onChange);
    return () => media?.removeListener?.(onChange);
  }
  return () => {};
}
