import type { DarlingTableRow, TableContext } from '../table-types';

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function adaptHistoryGameRows(rows: unknown[], context: TableContext = {}): DarlingTableRow[] {
  return rows.map((input, index) => {
    const row = input as Record<string, any>;
    const score = number(row.score);
    const opponentScore = number(row.opponentScore);
    const margin = number(row.margin ?? score - opponentScore);
    const type = String(row.type || 'Regular');
    const team = String(row.team || context.owner || '');
    const opponent = String(row.opponent || '');
    const source = row.sourceGame || {};
    const rivalryHref = `?tab=rivalry&rivalryTeamA=${encodeURIComponent(team)}&rivalryTeamB=${encodeURIComponent(opponent)}`;
    const gameHref = `?tab=history&team=${encodeURIComponent(team)}&seasons=${encodeURIComponent(row.season)}&focus=games`;
    return {
      ...row,
      id: row.gameId
        ? `${row.gameId}:${team}`
        : `${row.season}:${row.date}:${team}:${opponent}:${index}`,
      team,
      opponent,
      score,
      opponentScore,
      scoreLabel: `${score.toFixed(2)} - ${opponentScore.toFixed(2)}`,
      margin,
      combinedScore: number(row.combinedScore ?? score + opponentScore),
      type,
      round: String(row.round || ''),
      rowClass: `${row.result === 'W' ? 'result-win' : row.result === 'L' ? 'result-loss' : 'result-tie'}${type !== 'Regular' ? ' postseason' : ''}`,
      details: [
        { label: 'Matchup', value: `${team} ${score.toFixed(2)} - ${opponent} ${opponentScore.toFixed(2)}` },
        { label: 'Margin', value: `${margin >= 0 ? '+' : ''}${margin.toFixed(2)}` },
        { label: 'Combined score', value: (score + opponentScore).toFixed(2) },
        { label: 'Week', value: String(row.week || source.week || '—') },
        { label: 'Context', value: [type, row.round].filter(Boolean).join(' · ') || 'Regular season' },
      ],
      links: [
        { label: 'Head to head', href: rivalryHref },
        { label: 'Game link', href: gameHref },
      ],
    };
  });
}
