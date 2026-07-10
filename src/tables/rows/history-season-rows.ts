import type { DarlingTableRow, TableContext } from '../table-types';

export function adaptHistorySeasonRows(rows: unknown[], context: TableContext = {}): DarlingTableRow[] {
  return rows.map((input, index) => {
    const row = input as Record<string, any>;
    const wins = Number(row.wins) || 0;
    const losses = Number(row.losses) || 0;
    const ties = Number(row.ties) || 0;
    const games = wins + losses + ties;
    const winPct = games ? (wins + ties * 0.5) / games : 0;
    const pf = Number(row.points_for);
    const pa = Number(row.points_against);
    return {
      ...row,
      id: `${context.owner || row.owner}:${row.season}:${index}`,
      draftPick: Number.isFinite(Number(row.draft_pick)) ? Number(row.draft_pick) : null,
      draftPickLabel: Number.isFinite(Number(row.draft_pick)) ? `#${row.draft_pick}` : '—',
      record: `${wins}-${losses}-${ties}`,
      winPct,
      finish: Number.isFinite(Number(row.finish)) ? Number(row.finish) : null,
      outcome: String(row.outcome || (row.champion ? 'Champion' : row.saunders ? 'Saunders' : '—')),
      details: [
        { label: 'Outcome', value: String(row.outcome || '—') },
        { label: 'PF / PA', value: Number.isFinite(pf) && Number.isFinite(pa) ? `${pf.toFixed(1)} / ${pa.toFixed(1)}` : '—' },
        { label: 'Point differential', value: Number.isFinite(pf) && Number.isFinite(pa) ? `${pf - pa >= 0 ? '+' : ''}${(pf - pa).toFixed(1)}` : '—' },
        { label: 'Draft slot', value: Number.isFinite(Number(row.draft_pick)) ? `#${row.draft_pick}` : '—' },
      ],
    };
  });
}
