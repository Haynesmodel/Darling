import { parseScore } from '../table-filter-functions';
import type { DarlingTableRow, TableContext } from '../table-types';

export function adaptTrophySeasonRows(rows: unknown[], context: TableContext = {}): DarlingTableRow[] {
  return rows.map((input, index) => {
    const row = input as Record<string, any>;
    const notes = Array.isArray(row.notes) ? row.notes : [];
    const games = Array.isArray(row.games) ? row.games : [];
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
        { label: 'Game log', value: games.length ? `${games.length} game${games.length === 1 ? '' : 's'}` : 'No games recorded' },
        ...games.map(game => ({
          label: `${String(game.date || '—')} · Week ${String(game.week || '—')}`,
          value: `Opponent: ${String(game.opponent || '—')} · Score: ${String(game.scoreline || '—')} · Result: ${String(game.result || '—')} · Type: ${String(game.type || '—')} · Round: ${String(game.round || '—')}`,
        })),
      ],
    };
  });
}
