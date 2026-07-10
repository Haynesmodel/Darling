import type { DarlingTableRow, TableContext } from '../table-types';

export function adaptRivalryGameRows(rows: unknown[], context: TableContext = {}): DarlingTableRow[] {
  const chronological = rows.slice().sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
  const running = new Map<string, string>();
  let wins = 0;
  let losses = 0;
  let ties = 0;
  chronological.forEach((input: any) => {
    if (input.result === 'W') wins += 1;
    else if (input.result === 'L') losses += 1;
    else ties += 1;
    running.set(`${input.date}:${input.season}:${input.week ?? ''}`, `${wins}-${losses}-${ties}`);
  });
  return rows.map((input, index) => {
    const row = input as Record<string, any>;
    const key = `${row.date}:${row.season}:${row.week ?? ''}`;
    return {
      ...row,
      id: `${context.rivalryA}:${context.rivalryB}:${key}:${index}`,
      margin: Number(row.margin) || 0,
      recencyIndex: index,
      scoreLabel: String(row.score || ''),
      rowClass: `${row.rowClass || ''} ${row.postseasonClass || ''}`.trim(),
      details: [
        { label: 'Running series record', value: `${context.rivalryA || 'Team A'} ${running.get(key) || '—'}` },
        { label: 'Winner', value: String(row.winner || 'Tie') },
        { label: 'Context', value: [row.type, row.round].filter(Boolean).join(' · ') || 'Regular season' },
      ],
    };
  });
}
