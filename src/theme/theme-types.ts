export type ColorSchemePreference = 'system' | 'light' | 'dark';
export type ResolvedColorScheme = 'light' | 'dark';
export type AccentThemeKind = 'league' | 'owner' | 'rivalry';
export type SeasonMode = 'regular' | 'postseason' | 'saunders';

export interface OwnerTheme {
  owner: string;
  primary: string;
  secondary: string;
  softLight: string;
  softDark: string;
  textOnPrimary: string;
}

export interface ThemeContext {
  colorSchemePreference: ColorSchemePreference;
  resolvedColorScheme: ResolvedColorScheme;
  accentKind: AccentThemeKind;
  owner?: string;
  rivalryA?: string;
  rivalryB?: string;
  seasonMode: SeasonMode;
}

export type AppThemeContext = Partial<Pick<
  ThemeContext,
  'accentKind' | 'owner' | 'rivalryA' | 'rivalryB' | 'seasonMode'
>>;
