import type { ThemeContextService } from '../app-types';

function cleanOwner(owner?: string | null): string | undefined {
  const value = String(owner || '').trim();
  return value && value !== '__ALL__' ? value : undefined;
}

export function createThemeContextService(win: Window): ThemeContextService {
  const apply = (context: Record<string, unknown>) => {
    const runtime = win.darlingTheme as any;
    if (runtime?.applyAppContext) {
      runtime.applyAppContext(context);
      return;
    }
    const root = win.document.documentElement;
    root.dataset.accentTheme = String(context.accentKind || 'league');
    root.dataset.seasonMode = String(context.seasonMode || 'regular');
  };
  return {
    owner(owner, seasonMode = 'regular') {
      const selected = cleanOwner(owner);
      apply({ accentKind: selected ? 'owner' : 'league', owner: selected, seasonMode });
    },
    rivalry(ownerA, ownerB, seasonMode = 'regular') {
      const a = cleanOwner(ownerA);
      const b = cleanOwner(ownerB);
      apply({ accentKind: a && b ? 'rivalry' : a || b ? 'owner' : 'league', owner: a || b, rivalryA: a, rivalryB: b, seasonMode });
    },
    league(seasonMode = 'regular') {
      apply({ accentKind: 'league', seasonMode });
    },
  };
}
