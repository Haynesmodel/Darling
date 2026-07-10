import { parseScore } from '../table-filter-functions';
import type { DarlingTableRow, TableContext } from '../table-types';

export function adaptTrophySeasonRows(rows: unknown[], context: TableContext = {}): DarlingTableRow[] {
  return rows.map((input, index) => {
    const row = input as Record<string, any>;
    const notes = Array.isArray(row.notes) ? row.notes : [];
    return {
      ...row,
      id: `${context.owner}:${row.season}:${index}`,
      finishValue: Number.isFinite(Number(row.finish)) ? Number(row.finish) : null,
      pfValue: parseScore(row.pf),
      paValue: parseScore(row.pa),
      diffValue: parseScore(row.diff),
      notesLabel: notes.join(' • '),
      details: [
        { label: 'Season result', value: notes.length ? notes.join(' • ') : 'No special notes' },
        { label: 'Point differential', value: String(row.diff || '—') },
      ],
    };
  });
}
