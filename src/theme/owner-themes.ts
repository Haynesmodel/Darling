import type { OwnerTheme } from './theme-types';

export const OWNER_THEMES: OwnerTheme[] = [
  {
    owner: 'Connor',
    primary: '#047857',
    secondary: '#34d399',
    softLight: '#ecfdf5',
    softDark: 'rgba(52,211,153,.16)',
    textOnPrimary: '#ffffff',
  },
  {
    owner: 'Joe',
    primary: '#2563eb',
    secondary: '#60a5fa',
    softLight: '#eff6ff',
    softDark: 'rgba(96,165,250,.16)',
    textOnPrimary: '#ffffff',
  },
  {
    owner: 'Joel',
    primary: '#b45309',
    secondary: '#f59e0b',
    softLight: '#fffbeb',
    softDark: 'rgba(245,158,11,.18)',
    textOnPrimary: '#ffffff',
  },
  {
    owner: 'Nuss',
    primary: '#7c3aed',
    secondary: '#a78bfa',
    softLight: '#f5f3ff',
    softDark: 'rgba(167,139,250,.18)',
    textOnPrimary: '#ffffff',
  },
  {
    owner: 'Plot',
    primary: '#be123c',
    secondary: '#fb7185',
    softLight: '#fff1f2',
    softDark: 'rgba(251,113,133,.16)',
    textOnPrimary: '#ffffff',
  },
  {
    owner: 'Rishi',
    primary: '#0f766e',
    secondary: '#2dd4bf',
    softLight: '#f0fdfa',
    softDark: 'rgba(45,212,191,.16)',
    textOnPrimary: '#ffffff',
  },
  {
    owner: 'Shap',
    primary: '#0891b2',
    secondary: '#67e8f9',
    softLight: '#ecfeff',
    softDark: 'rgba(103,232,249,.14)',
    textOnPrimary: '#ffffff',
  },
  {
    owner: 'Shemer',
    primary: '#4f46e5',
    secondary: '#818cf8',
    softLight: '#eef2ff',
    softDark: 'rgba(129,140,248,.17)',
    textOnPrimary: '#ffffff',
  },
  {
    owner: 'Singer',
    primary: '#4d7c0f',
    secondary: '#a3e635',
    softLight: '#f7fee7',
    softDark: 'rgba(163,230,53,.14)',
    textOnPrimary: '#ffffff',
  },
  {
    owner: 'Snare',
    primary: '#c2410c',
    secondary: '#fb923c',
    softLight: '#fff7ed',
    softDark: 'rgba(251,146,60,.16)',
    textOnPrimary: '#ffffff',
  },
  {
    owner: 'Zook',
    primary: '#c026d3',
    secondary: '#f0abfc',
    softLight: '#fdf4ff',
    softDark: 'rgba(240,171,252,.16)',
    textOnPrimary: '#ffffff',
  },
  {
    owner: 'Zubs',
    primary: '#dc2626',
    secondary: '#f87171',
    softLight: '#fef2f2',
    softDark: 'rgba(248,113,113,.16)',
    textOnPrimary: '#ffffff',
  },
];

const OWNER_THEME_MAP = new Map(OWNER_THEMES.map(theme => [theme.owner.toLowerCase(), theme]));

export function getOwnerTheme(owner: string | null | undefined): OwnerTheme | null {
  if (!owner) return null;
  return OWNER_THEME_MAP.get(String(owner).trim().toLowerCase()) || null;
}

export function ownerThemeNames(): string[] {
  return OWNER_THEMES.map(theme => theme.owner);
}
