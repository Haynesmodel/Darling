import type { DarlingTableRow, TableContext } from '../table-types';

export function adaptHistoryOpponentRows(rows: unknown[], context: TableContext = {}): DarlingTableRow[] {
  const owner = String(context.owner || '');
  const games = Array.isArray(context.games) ? context.games as Array<Record<string, any>> : [];
  return rows.map((input, index) => {
    const row = input as Record<string, any>;
    const opponent = String(row.opp || row.label || row.team || '');
    const meetings = games.filter(game =>
      owner && opponent && ((game.teamA === owner && game.teamB === opponent) || (game.teamA === opponent && game.teamB === owner)),
    );
    const postseasonGames = meetings.filter(game => String(game.type || 'Regular') !== 'Regular');
    const playoffWins = postseasonGames.filter(game => {
      const ownerScore = game.teamA === owner ? Number(game.scoreA) : Number(game.scoreB);
      const opponentScore = game.teamA === owner ? Number(game.scoreB) : Number(game.scoreA);
      return ownerScore > opponentScore;
    }).length;
    return {
      ...row,
      id: `${owner || 'league'}:${opponent}:${index}`,
      opponent,
      record: `${row.w || 0}-${row.l || 0}-${row.t || 0}`,
      winPct: Number(row.pct) || 0,
      ppg: Number(row.ppg) || 0,
      oppg: Number(row.oppg) || 0,
      games: Number(row.n) || 0,
      playoffGames: postseasonGames.length,
      details: [
        { label: 'Point differential per game', value: `${Number(row.ppg) - Number(row.oppg) >= 0 ? '+' : ''}${(Number(row.ppg) - Number(row.oppg)).toFixed(2)}` },
        { label: 'Postseason record', value: postseasonGames.length ? `${playoffWins}-${postseasonGames.length - playoffWins}` : 'No postseason meetings' },
        { label: 'Most recent meeting', value: meetings.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.date || '—' },
      ],
      links: owner && opponent ? [{
        label: 'Head to head',
        href: `?tab=rivalry&rivalryTeamA=${encodeURIComponent(owner)}&rivalryTeamB=${encodeURIComponent(opponent)}`,
      }] : [],
    };
  });
}
