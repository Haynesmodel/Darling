import type { AccentThemeKind, AppThemeContext, SeasonMode } from './theme-types';

export const ALL_TEAMS_VALUE = '__ALL__';

function cleanValue(value: unknown): string {
  return String(value || '').trim();
}

export function ownerOrUndefined(owner: unknown, allTeams = ALL_TEAMS_VALUE): string | undefined {
  const value = cleanValue(owner);
  return value && value !== allTeams ? value : undefined;
}

export function seasonModeFromLabels(labels: Iterable<unknown> = []): SeasonMode {
  let sawPostseason = false;
  for (const label of labels) {
    const value = cleanValue(label).toLowerCase();
    if (!value || value === 'regular') continue;
    if (value.includes('saunders')) return 'saunders';
    if (
      value.includes('playoff') ||
      value.includes('championship') ||
      value.includes('wild card') ||
      value.includes('semi final') ||
      value.includes('final')
    ) {
      sawPostseason = true;
    }
  }
  return sawPostseason ? 'postseason' : 'regular';
}

export function seasonModeFromCurrentWeek(opts: {
  week?: number | string | null;
  regularSeasonMaxWeek?: number | string | null;
  gameTypes?: Iterable<unknown>;
  rounds?: Iterable<unknown>;
} = {}): SeasonMode {
  const labelMode = seasonModeFromLabels([...(opts.gameTypes || []), ...(opts.rounds || [])]);
  if (labelMode !== 'regular') return labelMode === 'saunders' ? 'postseason' : labelMode;

  const week = Number(opts.week);
  const regularSeasonMaxWeek = Number(opts.regularSeasonMaxWeek);
  return Number.isFinite(week) && Number.isFinite(regularSeasonMaxWeek) && week > regularSeasonMaxWeek
    ? 'postseason'
    : 'regular';
}

export function buildOwnerThemeContext(owner: unknown, allTeams = ALL_TEAMS_VALUE): AppThemeContext {
  const normalizedOwner = ownerOrUndefined(owner, allTeams);
  return normalizedOwner
    ? { accentKind: 'owner', owner: normalizedOwner, seasonMode: 'regular' }
    : { accentKind: 'league', seasonMode: 'regular' };
}

export function buildRivalryThemeContext(ownerA: unknown, ownerB: unknown): AppThemeContext {
  const rivalryA = cleanValue(ownerA);
  const rivalryB = cleanValue(ownerB);
  if (!rivalryA || !rivalryB || rivalryA === rivalryB) {
    return buildOwnerThemeContext(rivalryA || rivalryB);
  }
  return { accentKind: 'rivalry', rivalryA, rivalryB, seasonMode: 'regular' };
}

export function buildThemeContextFromAppState(opts: {
  accentKind?: AccentThemeKind;
  owner?: unknown;
  rivalryA?: unknown;
  rivalryB?: unknown;
  seasonMode?: SeasonMode;
  allTeams?: string;
}): AppThemeContext {
  const allTeams = opts.allTeams || ALL_TEAMS_VALUE;
  const seasonMode = opts.seasonMode || 'regular';
  if (opts.accentKind === 'rivalry') {
    return {
      ...buildRivalryThemeContext(opts.rivalryA, opts.rivalryB),
      seasonMode,
    };
  }
  if (opts.accentKind === 'owner') {
    return {
      ...buildOwnerThemeContext(opts.owner, allTeams),
      seasonMode,
    };
  }
  return { accentKind: 'league', seasonMode };
}
