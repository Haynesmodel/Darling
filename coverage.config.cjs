const reviewedBaseline = thresholds => ({
  thresholds,
  reason: 'Reviewed against full CI coverage on 2026-10-25; this file remains below the standard per-file gate. Ratchet with behavior-focused tests.',
  owner: '@Haynesmodel',
  expires: '2026-11-25',
});

module.exports = {
  global: { lines: 75, statements: 75, functions: 65, branches: 60 },
  perFile: { lines: 60, statements: 60, functions: 50, branches: 50 },
  changedFiles: { lines: 80, statements: 80, functions: 75, branches: 70 },
  overrides: {
    'src/app/services/feature-status.ts': reviewedBaseline({ lines: 64.15, statements: 59.67, functions: 90.9, branches: 48.14 }),
    'src/app/services/league-selectors.ts': reviewedBaseline({ lines: 62.5, statements: 61.11, functions: 50, branches: 40 }),
    'src/components/tables/SavedViewsMenu.tsx': reviewedBaseline({ lines: 56.09, statements: 54.34, functions: 50, branches: 45.45 }),
    'src/tables/rows/rivalry-season-rows.ts': reviewedBaseline({ lines: 100, statements: 100, functions: 100, branches: 37.93 }),
    'src/tables/table-filter-functions.ts': reviewedBaseline({ lines: 63.33, statements: 55.26, functions: 54.54, branches: 45 }),
    'src/tables/table-quick-filters.ts': reviewedBaseline({ lines: 44.44, statements: 52.94, functions: 50, branches: 28.57 }),
    'src/tables/table-registry.ts': reviewedBaseline({ lines: 46.55, statements: 54.41, functions: 46.55, branches: 43.13 }),
    'src/features/draft-spot/DraftSpotControls.tsx': reviewedBaseline({ lines: 61.9, statements: 57.44, functions: 45.83, branches: 31.25 }),
  },
};
