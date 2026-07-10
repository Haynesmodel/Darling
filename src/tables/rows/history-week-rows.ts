import type { DarlingTableRow, TableContext } from '../table-types';

export function adaptHistoryWeekRows(rows: unknown[], context: TableContext = {}): DarlingTableRow[] {
  return rows.map((input, index) => {
    const row = input as Record<string, any>;
    const pf = Number(row.pf) || 0;
    const pa = Number(row.pa) || 0;
    const owner = String(context.owner || '');
    const opponent = String(row.opp || row.opponent || '');
    const type = String(row.type || 'Regular');
    return {
      ...row,
      id: `${row.season}:${row.week || row.date}:${owner}:${opponent}:${index}`,
      opponent,
      score: pf,
      opponentScore: pa,
      scoreLabel: `${pf.toFixed(2)} - ${pa.toFixed(2)}`,
      margin: pf - pa,
      type,
      crownLabel: row.isCrown ? ' 👑' : row.isTurd ? ' 💩' : '',
      rowClass: `${row.result === 'W' ? 'result-win' : row.result === 'L' ? 'result-loss' : 'result-tie'}${type !== 'Regular' ? ' postseason' : ''}`,
      details: [
        { label: 'League scoring mark', value: row.isCrown ? 'Highest score this week' : row.isTurd ? 'Lowest score this week' : 'Middle of the pack' },
        { label: 'Expected wins', value: row.xw === null || row.xw === undefined ? '—' : Number(row.xw).toFixed(2) },
        { label: 'Margin', value: `${pf - pa >= 0 ? '+' : ''}${(pf - pa).toFixed(2)}` },
        { label: 'Context', value: [type, row.round].filter(Boolean).join(' · ') || 'Regular season' },
      ],
      links: owner && opponent ? [{
        label: 'Open rivalry',
        href: `?tab=rivalry&rivalryTeamA=${encodeURIComponent(owner)}&rivalryTeamB=${encodeURIComponent(opponent)}`,
      }] : [],
    };
  });
}
