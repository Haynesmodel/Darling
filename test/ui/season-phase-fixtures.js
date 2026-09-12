function scheduled2026(current) {
  current.season = 2026;
  current.generated_at = '2026-08-20T12:00:00Z';
  current.current_week = 1;
  current.weeks_fetched = [1];
  current.games = current.games.filter(game => game.week === 1).map(game => ({
    ...game,
    season: 2026,
    date: game.date.replace('2025', '2026'),
    status: 'scheduled',
    scoreA: null,
    scoreB: null,
  }));
}

function regularSeason2026(current, live) {
  current.season = 2026;
  current.generated_at = '2026-09-15T12:00:00Z';
  current.current_week = live ? 2 : 1;
  current.weeks_fetched = [1, 2];
  current.games = current.games.filter(game => game.week <= 2).map(game => ({
    ...game,
    season: 2026,
    date: game.date.replace('2025', '2026'),
    status: game.week === 1 ? 'final' : live ? 'live' : 'scheduled',
    scoreA: game.week === 1 || live ? game.scoreA : null,
    scoreB: game.week === 1 || live ? game.scoreB : null,
  }));
}

function postseason2026(current) {
  current.season = 2026;
  current.generated_at = '2026-12-20T12:00:00Z';
  current.current_week = 16;
  current.weeks_fetched = [16];
  current.games = current.games.filter(game => game.week === 16).map(game => ({
    ...game,
    season: 2026,
    date: game.date.replace('2025', '2026'),
    status: 'live',
  }));
}

function finalizing2026(current) {
  current.season = 2026;
  current.generated_at = '2026-12-30T12:00:00Z';
  current.games = current.games.map(game => ({
    ...game,
    season: 2026,
    date: game.date.replace('2025', '2026'),
    status: 'final',
  }));
}

export {
  finalizing2026,
  postseason2026,
  regularSeason2026,
  scheduled2026,
};
