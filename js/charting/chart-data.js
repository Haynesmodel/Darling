import { histogramBins } from '../gauntlet-simulator.js';

function toFinite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dynastyTrendRows(chart = {}, opts = {}) {
  const hiddenSet = new Set([
    ...(Array.isArray(chart.hiddenOwners) ? chart.hiddenOwners : []),
    ...(Array.isArray(opts.hiddenOwners) ? opts.hiddenOwners : []),
  ].filter(Boolean));
  return (chart.series || [])
    .map(series => ({ ...series, hidden: hiddenSet.has(series.owner) || series.hidden === true }))
    .flatMap(series => (series.points || []).map((point, index) => ({
      owner: series.owner,
      season: toFinite(point.season, point.season),
      seasonIndex: index,
      seasonScore: toFinite(point.seasonScore, 0),
      cumulativeScore: toFinite(point.cumulativeScore, 0),
      finalScore: toFinite(series.finalScore, 0),
      color: series.color,
      hidden: series.hidden,
      profile: point.profile || null,
      title: `${series.owner}: ${toFinite(point.cumulativeScore, 0).toFixed(1)} through ${point.season}`,
    })))
    .filter(row => opts.includeHidden || !row.hidden);
}

function gauntletHistogramRows(result, teamSeasonA, teamSeasonB, opts = {}) {
  if (!result || !teamSeasonA || !teamSeasonB) {
    return { rows: [], means: [], domain: [0, 1], maxCount: 0 };
  }
  const scoresA = Array.isArray(result.scoresA) ? result.scoresA.filter(Number.isFinite) : [];
  const scoresB = Array.isArray(result.scoresB) ? result.scoresB.filter(Number.isFinite) : [];
  const combined = scoresA.concat(scoresB);
  if (!combined.length) return { rows: [], means: [], domain: [0, 1], maxCount: 0 };

  const min = Number.isFinite(opts.min) ? opts.min : Math.min(...combined);
  const max = Number.isFinite(opts.max) ? opts.max : Math.max(...combined);
  const binCount = Number.isFinite(opts.bins) ? opts.bins : 18;
  const teams = [
    { key: 'A', teamSeason: teamSeasonA, scores: scoresA },
    { key: 'B', teamSeason: teamSeasonB, scores: scoresB },
  ];
  const rows = teams.flatMap(team => histogramBins(team.scores, { bins: binCount, min, max }).map((bin, index) => ({
    key: team.key,
    owner: team.teamSeason.owner,
    season: team.teamSeason.season,
    label: `${team.teamSeason.owner} ${team.teamSeason.season}`,
    binIndex: index,
    start: bin.start,
    end: bin.end,
    center: (bin.start + bin.end) / 2,
    count: bin.count,
    rangeLabel: `${bin.start.toFixed(1)}-${bin.end.toFixed(1)}`,
    mean: team.teamSeason.mean,
    title: `${team.teamSeason.owner} ${team.teamSeason.season}: ${bin.count} simulations from ${bin.start.toFixed(1)} to ${bin.end.toFixed(1)}`,
  })));
  const maxCount = rows.reduce((acc, row) => Math.max(acc, row.count), 0);
  return {
    rows,
    means: teams.map(team => ({
      key: team.key,
      owner: team.teamSeason.owner,
      season: team.teamSeason.season,
      label: `${team.teamSeason.owner} ${team.teamSeason.season}`,
      mean: team.teamSeason.mean,
      title: `${team.teamSeason.owner} ${team.teamSeason.season} mean ${Number(team.teamSeason.mean).toFixed(1)}`,
    })),
    domain: [min, max],
    maxCount,
  };
}

function trophyCareerRows(view = {}) {
  const rows = Array.isArray(view.careerShape?.rows) ? view.careerShape.rows : [];
  return rows
    .map((row, index) => {
      const finish = toFinite(row.finish, null);
      const cutoff = toFinite(row.playoffCutoff, 6);
      const champion = row.tier === 'champion' || /champion/i.test(row.label || '');
      const saunders = row.tier === 'saunders' || /saunders/i.test(row.label || '');
      const madePlayoffs = finish !== null && finish <= cutoff;
      const tier = champion ? 'champion' : saunders ? 'saunders' : madePlayoffs ? 'playoff' : 'miss';
      return {
        ...row,
        index,
        finish: finish ?? cutoff,
        finishLabel: finish === null ? '-' : `${finish}`,
        playoffCutoff: cutoff,
        madePlayoffs,
        champion,
        saunders,
        tier,
        title: row.title || `${row.season}: Finish ${finish ?? '-'}`,
      };
    });
}

function rivalryLeadRows(view = {}, points = []) {
  return (points || []).map((point, index) => {
    const lead = toFinite(point.lead, 0);
    const spread = lead > 0
      ? `${view.teamA} + ${lead}`
      : lead < 0
        ? `${view.teamB} + ${Math.abs(lead)}`
        : 'Tied';
    return {
      ...point,
      index: index + 1,
      lead,
      spread,
      teamA: view.teamA,
      teamB: view.teamB,
      title: `${point.date} | ${point.winner} ${point.score} | Series spread: ${spread}`,
    };
  });
}

function currentSeedMovementRows(view = {}) {
  const selectedOwner = view.commandCenter?.selectedOwner || '';
  return (view.commandCenter?.liveMovement || []).map(row => ({
    owner: row.owner,
    previousSeed: toFinite(row.previousSeed, null),
    projectedSeed: toFinite(row.projectedSeed, null),
    seedChange: toFinite(row.seedChange, 0),
    projectedRecord: row.projectedRecord || '',
    isSelected: !!selectedOwner && row.owner === selectedOwner,
    title: `${row.owner}: seed ${row.previousSeed} to ${row.projectedSeed}; ${row.seedChange > 0 ? 'up' : row.seedChange < 0 ? 'down' : 'no change'} ${Math.abs(row.seedChange || 0)}`,
  }));
}

function currentProjectedSeedRows(view = {}) {
  const selectedOwner = view.commandCenter?.selectedOwner || '';
  return (view.commandCenter?.projectedStandings || []).map(row => ({
    owner: row.owner,
    projectedRank: toFinite(row.projectedRank, null),
    currentSeed: toFinite(row.currentSeed, null),
    seedChange: toFinite(row.seedChange, 0),
    projectedPointsFor: toFinite(row.projectedPointsFor, 0),
    projectedRecord: row.projectedRecord || '',
    currentRecord: row.currentRecord || '',
    isSelected: !!selectedOwner && row.owner === selectedOwner,
    title: `${row.owner}: projected seed ${row.projectedRank}, ${row.projectedRecord}, ${Number(row.projectedPointsFor || 0).toFixed(1)} PF`,
  }));
}

export {
  currentProjectedSeedRows,
  currentSeedMovementRows,
  dynastyTrendRows,
  gauntletHistogramRows,
  rivalryLeadRows,
  trophyCareerRows,
};
