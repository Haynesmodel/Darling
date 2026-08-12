// Named, data-level exception for lowest-score recognition only. The source game
// remains canonical and its scores must remain available to every aggregate.
const LOW_SCORE_OUTLIER = Object.freeze({
  season: 2022,
  date: '2022-12-24',
  type: 'saunders',
  teams: Object.freeze(['Joel', 'Plot']),
});

function isLowestScoreEligible(game, side) {
  const team = typeof side === 'string' ? side : side?.team;
  if (!game || !team) return true;

  const teams = [game.teamA, game.teamB].slice().sort();
  const outlierTeams = LOW_SCORE_OUTLIER.teams.slice().sort();
  const isOutlierGame = Number(game.season) === LOW_SCORE_OUTLIER.season
    && String(game.date) === LOW_SCORE_OUTLIER.date
    && String(game.type || '').trim().toLowerCase() === LOW_SCORE_OUTLIER.type
    && teams.length === outlierTeams.length
    && teams.every((value, index) => value === outlierTeams[index]);

  return !(isOutlierGame && LOW_SCORE_OUTLIER.teams.includes(team));
}

export { LOW_SCORE_OUTLIER, isLowestScoreEligible };
