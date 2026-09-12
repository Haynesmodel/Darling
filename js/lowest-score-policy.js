// Named, data-level exception for lowest-score recognition only. The source game
// remains canonical and its scores must remain available to every aggregate.
function isLowestScoreEligible(game, side) {
  const team = side?.team || side;
  return !game || !team
    || +game.season !== 2022
    || game.date !== '2022-12-24'
    || game.type?.trim().toLowerCase() !== 'saunders'
    || !((game.teamA === 'Joel' && game.teamB === 'Plot') || (game.teamA === 'Plot' && game.teamB === 'Joel'))
    || !['Joel', 'Plot'].includes(team);
}

export { isLowestScoreEligible };
