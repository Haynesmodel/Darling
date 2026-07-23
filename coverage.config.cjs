const correctedBaseline = thresholds => ({
  thresholds,
  reason: 'Authored-coordinate baseline captured 2026-07-23 after TSX source-map proof; ratchet with behavior-focused tests.',
  owner: '@Haynesmodel',
  expires: '2026-10-22',
});

module.exports = {
  global: { lines: 75, statements: 75, functions: 65, branches: 60 },
  perFile: { lines: 60, statements: 60, functions: 50, branches: 50 },
  changedFiles: { lines: 80, statements: 80, functions: 75, branches: 70 },
  overrides: {
    // Legacy chart/helper code.
    'js/charting/chart-runtime.js': correctedBaseline({ lines: 50.9, statements: 32.67, functions: 33.33, branches: 66.66 }),
    'js/easter-eggs.js': correctedBaseline({ lines: 28.84, statements: 25, functions: 20, branches: 13.79 }),
    'js/rivalry-controls.js': correctedBaseline({ lines: 80.32, statements: 75.36, functions: 69.23, branches: 41.55 }),
    // Build and generated-data validation.
    'scripts/check_generated_assets.cjs': correctedBaseline({ lines: 84.61, statements: 84.61, functions: 100, branches: 42.85 }),
    'scripts/data/constants.cjs': correctedBaseline({ lines: 93.87, statements: 93.87, functions: 0, branches: 100 }),
    // Shell/accessibility and shared application services.
    'src/accessibility/focus.ts': correctedBaseline({ lines: 65.21, statements: 57.14, functions: 42.85, branches: 25 }),
    'src/app/app-controller.ts': correctedBaseline({ lines: 81.52, statements: 78.09, functions: 47.36, branches: 74.5 }),
    'src/app/services/feature-status.ts': correctedBaseline({ lines: 64.15, statements: 59.67, functions: 90.9, branches: 48.14 }),
    'src/app/services/league-selectors.ts': correctedBaseline({ lines: 62.5, statements: 61.11, functions: 50, branches: 40 }),
    'src/theme/theme-state.ts': correctedBaseline({ lines: 71.87, statements: 63.15, functions: 54.54, branches: 48.14 }),
    // Search.
    'src/components/search/CommandPalette.tsx': correctedBaseline({ lines: 58.1, statements: 60.86, functions: 66.66, branches: 51.66 }),
    // Tables.
    'src/components/tables/ColumnFilterMenu.tsx': correctedBaseline({ lines: 63.63, statements: 55.55, functions: 23.07, branches: 58.33 }),
    'src/components/tables/SavedViewsMenu.tsx': correctedBaseline({ lines: 56.09, statements: 54.34, functions: 50, branches: 45.45 }),
    'src/components/tables/TableToolbar.tsx': correctedBaseline({ lines: 61.53, statements: 53.84, functions: 40, branches: 50 }),
    'src/tables/rows/rivalry-season-rows.ts': correctedBaseline({ lines: 100, statements: 100, functions: 100, branches: 37.93 }),
    'src/tables/rows/trophy-season-rows.ts': correctedBaseline({ lines: 100, statements: 100, functions: 100, branches: 44.44 }),
    'src/tables/table-filter-functions.ts': correctedBaseline({ lines: 63.33, statements: 55.26, functions: 54.54, branches: 45 }),
    'src/tables/table-quick-filters.ts': correctedBaseline({ lines: 44.44, statements: 52.94, functions: 50, branches: 28.57 }),
    'src/tables/table-registry.ts': correctedBaseline({ lines: 46.55, statements: 54.41, functions: 46.55, branches: 43.13 }),
    // Draft Spot.
    'src/features/draft-spot/DraftSpotControls.tsx': correctedBaseline({ lines: 61.9, statements: 57.44, functions: 45.83, branches: 31.25 }),
    'src/features/draft-spot/DraftSpotPage.tsx': correctedBaseline({ lines: 82.14, statements: 84.44, functions: 66.66, branches: 0 }),
  },
};
