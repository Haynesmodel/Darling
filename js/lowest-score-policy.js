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
  return !game || !team
    || Number(game.season) !== 2022
    || String(game.date) !== '2022-12-24'
    || String(game.type || '').trim().toLowerCase() !== 'saunders'
    || !((game.teamA === 'Joel' && game.teamB === 'Plot') || (game.teamA === 'Plot' && game.teamB === 'Joel'))
    || !['Joel', 'Plot'].includes(team);
}

export { LOW_SCORE_OUTLIER, isLowestScoreEligible };
