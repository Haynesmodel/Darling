import { getOwnerTheme } from './owner-themes';
import {
  readColorSchemePreference,
  resolveColorSchemePreference,
  watchSystemColorScheme,
  writeColorSchemePreference,
} from './theme-state';
import type {
  AccentThemeKind,
  AppThemeContext,
  ColorSchemePreference,
  OwnerTheme,
  SeasonMode,
  ThemeContext,
} from './theme-types';

const DEFAULT_APP_CONTEXT: Required<AppThemeContext> = {
  accentKind: 'league',
  owner: '',
  rivalryA: '',
  rivalryB: '',
  seasonMode: 'regular',
};

type ThemeListener = (context: ThemeContext) => void;

interface ThemeStyleDeclaration {
  setProperty(name: string, value: string): void;
  removeProperty(name: string): void;
}

interface ThemeDocument {
  documentElement: {
    dataset: Record<string, string | undefined>;
    style: ThemeStyleDeclaration;
  };
}

interface ThemeWindow {
  localStorage?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  matchMedia?: (query: string) => {
    matches: boolean;
    addEventListener?: (type: 'change', listener: () => void) => void;
    removeEventListener?: (type: 'change', listener: () => void) => void;
    addListener?: (listener: () => void) => void;
    removeListener?: (listener: () => void) => void;
  };
}

export interface DarlingThemeRuntime {
  getSnapshot(): ThemeContext;
  setColorSchemePreference(preference: ColorSchemePreference): void;
  applyAppContext(context: AppThemeContext): void;
  subscribe(listener: ThemeListener): () => void;
  destroy(): void;
}

function normalizeSeasonMode(mode: unknown): SeasonMode {
  return mode === 'postseason' || mode === 'saunders' ? mode : 'regular';
}

function normalizeAccentKind(kind: unknown): AccentThemeKind {
  return kind === 'owner' || kind === 'rivalry' ? kind : 'league';
}

function cleanOwner(owner: unknown): string | undefined {
  const value = String(owner || '').trim();
  return value ? value : undefined;
}

function setDatasetValue(dataset: Record<string, string | undefined>, key: string, value: string | undefined): void {
  if (value) dataset[key] = value;
  else delete dataset[key];
}

function setThemeVars(style: ThemeStyleDeclaration, prefix: string, theme: OwnerTheme | null, colorScheme: 'light' | 'dark'): void {
  const names = ['primary', 'secondary', 'soft', 'ring', 'text'];
  if (!theme) {
    names.forEach(name => style.removeProperty(`--${prefix}-${name}`));
    return;
  }
  style.setProperty(`--${prefix}-primary`, theme.primary);
  style.setProperty(`--${prefix}-secondary`, theme.secondary);
  style.setProperty(`--${prefix}-soft`, colorScheme === 'dark' ? theme.softDark : theme.softLight);
  style.setProperty(`--${prefix}-ring`, `${theme.primary}59`);
  style.setProperty(`--${prefix}-text`, theme.textOnPrimary);
}

export function normalizeThemeContext(context: ThemeContext): ThemeContext {
  let accentKind = normalizeAccentKind(context.accentKind);
  const owner = cleanOwner(context.owner);
  const rivalryA = cleanOwner(context.rivalryA);
  const rivalryB = cleanOwner(context.rivalryB);

  if (accentKind === 'owner' && !getOwnerTheme(owner)) {
    accentKind = 'league';
  }
  if (accentKind === 'rivalry' && (!getOwnerTheme(rivalryA) || !getOwnerTheme(rivalryB) || rivalryA === rivalryB)) {
    accentKind = getOwnerTheme(rivalryA) ? 'owner' : 'league';
  }

  return {
    colorSchemePreference: context.colorSchemePreference,
    resolvedColorScheme: context.resolvedColorScheme,
    accentKind,
    owner: accentKind === 'owner' ? (owner || rivalryA) : undefined,
    rivalryA: accentKind === 'rivalry' ? rivalryA : undefined,
    rivalryB: accentKind === 'rivalry' ? rivalryB : undefined,
    seasonMode: normalizeSeasonMode(context.seasonMode),
  };
}

function globalDocument(): ThemeDocument | null {
  return (globalThis as unknown as { document?: ThemeDocument }).document || null;
}

function globalWindow(): ThemeWindow | null {
  return (globalThis as unknown as { window?: ThemeWindow }).window || null;
}

export function applyThemeToDocument(context: ThemeContext, doc: ThemeDocument = globalDocument() as ThemeDocument): ThemeContext {
  const normalized = normalizeThemeContext(context);
  const root = doc.documentElement;
  const { dataset, style } = root;

  dataset.colorScheme = normalized.resolvedColorScheme;
  dataset.colorSchemePreference = normalized.colorSchemePreference;
  dataset.accentTheme = normalized.accentKind;
  dataset.seasonMode = normalized.seasonMode;
  setDatasetValue(dataset, 'ownerTheme', normalized.owner);
  setDatasetValue(dataset, 'rivalryA', normalized.rivalryA);
  setDatasetValue(dataset, 'rivalryB', normalized.rivalryB);

  const ownerTheme = getOwnerTheme(normalized.owner);
  const rivalryATheme = getOwnerTheme(normalized.rivalryA);
  const rivalryBTheme = getOwnerTheme(normalized.rivalryB);

  setThemeVars(style, 'owner', ownerTheme, normalized.resolvedColorScheme);
  setThemeVars(style, 'owner-a', rivalryATheme, normalized.resolvedColorScheme);
  setThemeVars(style, 'owner-b', rivalryBTheme, normalized.resolvedColorScheme);

  return normalized;
}

export function createDarlingThemeRuntime(options: {
  document?: ThemeDocument | null;
  window?: ThemeWindow | null;
  initialContext?: AppThemeContext;
} = {}): DarlingThemeRuntime {
  const doc = options.document || globalDocument();
  const win = options.window || globalWindow();
  let colorSchemePreference = readColorSchemePreference(win);
  let appContext: Required<AppThemeContext> = {
    ...DEFAULT_APP_CONTEXT,
    ...(options.initialContext || {}),
  };
  const listeners = new Set<ThemeListener>();

  const snapshot = (): ThemeContext => ({
    colorSchemePreference,
    resolvedColorScheme: resolveColorSchemePreference(colorSchemePreference, win),
    accentKind: normalizeAccentKind(appContext.accentKind),
    owner: cleanOwner(appContext.owner),
    rivalryA: cleanOwner(appContext.rivalryA),
    rivalryB: cleanOwner(appContext.rivalryB),
    seasonMode: normalizeSeasonMode(appContext.seasonMode),
  });

  const publish = () => {
    const applied = doc ? applyThemeToDocument(snapshot(), doc) : normalizeThemeContext(snapshot());
    listeners.forEach(listener => listener(applied));
  };

  const unwatchSystem = watchSystemColorScheme(win, () => {
    if (colorSchemePreference === 'system') publish();
  });

  const runtime: DarlingThemeRuntime = {
    getSnapshot() {
      return normalizeThemeContext(snapshot());
    },
    setColorSchemePreference(preference) {
      colorSchemePreference = preference;
      writeColorSchemePreference(preference, win);
      publish();
    },
    applyAppContext(context) {
      appContext = {
        ...appContext,
        ...context,
        seasonMode: normalizeSeasonMode(context.seasonMode ?? appContext.seasonMode),
        accentKind: normalizeAccentKind(context.accentKind ?? appContext.accentKind),
      };
      publish();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(runtime.getSnapshot());
      return () => listeners.delete(listener);
    },
    destroy() {
      listeners.clear();
      unwatchSystem();
    },
  };

  publish();
  return runtime;
}
