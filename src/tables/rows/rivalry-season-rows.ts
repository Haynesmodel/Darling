import type { DarlingTableRow, TableContext } from '../table-types';

export function adaptRivalrySeasonRows(rows: unknown[], context: TableContext = {}): DarlingTableRow[] {
  return rows.map((input, index) => {
    const row = input as Record<string, any>;
    const games = Number(row.games) || 0;
    return {
      ...row,
      id: `${context.rivalryA}:${context.rivalryB}:${row.season}:${index}`,
      record: String(row.recordText || `${row.w || 0}-${row.l || 0}-${row.t || 0}`),
      pf: Number(row.pf) || 0,
      pa: Number(row.pa) || 0,
      diff: Number(row.diff) || 0,
      notesLabel: Array.isArray(row.notes) ? row.notes.join(' • ') : String(row.notes || '—'),
      details: [
        { label: 'Average margin', value: games ? (Math.abs(Number(row.diff) || 0) / games).toFixed(2) : '—' },
        { label: 'Games', value: String(games) },
        { label: 'Season context', value: Array.isArray(row.notes) && row.notes.length ? row.notes.join(' • ') : 'No special notes' },
      ],
    };
  });
}
