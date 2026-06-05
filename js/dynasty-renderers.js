import {
  escapeHtml,
  fmtTrimmed,
} from './render-helpers.js';
import {
  isPlayoffGame as isPlayoffGameFn,
  isSaundersGame as isSaundersGameFn,
  normRound as normRoundFn,
  roundOrder as roundOrderFn,
  sidesForTeam as sidesForTeamFn,
} from './core-helpers.js';
import { computeSeasonAggregatesAllTeams } from './stats-helpers.js';

const DYNASTY_WEIGHTS = {
  regularSeasonWin: 1,
  regularSeasonTie: 0.5,
  playoffWin: 6,
  playoffLoss: 0,
  saundersWin: 0.5,
  championship: 30,
  regularSeasonTitle: 15,
  topTwoBye: 8,
  wildCard: 4,
  pointsForRank1: 8,
  pointsForRank2: 5,
  pointsForRank3: 3,
  pointDiffRank1: 8,
  pointDiffRank2: 5,
  pointDiffRank3: 3,
  topHalfFinish: 3,
  bottomFinishPenalty: -5,
  saundersTitlePenalty: -18,
  saundersByePenalty: -6,
  negativeDiffPenalty: -3,
  multiTitleBonus: 8,
  cleanWindowBonus: 5,
};

function docOrDefault(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function isFiniteInput(value) {
  return value !== null && value !== '' && Number.isFinite(Number(value));
}

function n(value, digits = 1) {
  return Number.isFinite(+value) ? (+value).toFixed(digits) : '—';
}

function whole(value) {
  return Number.isFinite(+value) ? `${Math.round(+value)}` : '—';
}

function signed(value, digits = 1) {
  if (!Number.isFinite(+value)) return '—';
  const num = +value;
  return `${num >= 0 ? '+' : ''}${num.toFixed(digits)}`;
}

function pct(value) {
  return Number.isFinite(+value) ? `${(+value * 100).toFixed(1)}%` : '—';
}

function ordinal(value) {
  if (!Number.isFinite(+value)) return '—';
  const num = Math.round(+value);
  const mod100 = num % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${num}th`;
  switch (num % 10) {
    case 1: return `${num}st`;
    case 2: return `${num}nd`;
    case 3: return `${num}rd`;
    default: return `${num}th`;
  }
}

function joinYears(years) {
  if (!Array.isArray(years) || years.length === 0) return '—';
  return years.slice().sort((a, b) => a - b).join(', ');
}

function rangeLabel(startSeason, endSeason) {
  if (!isFiniteInput(startSeason) || !isFiniteInput(endSeason)) return 'No season range';
  return `${startSeason}-${endSeason}`;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function emptyScoreComponents() {
  return {
    regularSeason: 0,
    postseason: 0,
    hardware: 0,
    scoringDominance: 0,
    consistency: 0,
    penalties: 0,
  };
}

function addScoreComponents(base = emptyScoreComponents(), extra = emptyScoreComponents()) {
  const next = emptyScoreComponents();
  for (const key of Object.keys(next)) {
    next[key] = (+base[key] || 0) + (+extra[key] || 0);
  }
  return next;
}

function sumScoreComponents(components = emptyScoreComponents()) {
  return Object.values(components).reduce((total, value) => total + (+value || 0), 0);
}

function toNumber(value, fallback = null) {
  const num = +value;
  return Number.isFinite(num) ? num : fallback;
}

function profileSeasonLookupKey(owner, season) {
  return `${owner}|${season}`;
}

function rankByValue(rows, valueFn, { descending = true } = {}) {
  const sorted = rows.slice().sort((a, b) => {
    const av = valueFn(a);
    const bv = valueFn(b);
    const left = Number.isFinite(+av) ? +av : (descending ? -Infinity : Infinity);
    const right = Number.isFinite(+bv) ? +bv : (descending ? -Infinity : Infinity);
    if (left === right) return a.owner.localeCompare(b.owner);
    return descending ? right - left : left - right;
  });
  const rankMap = new Map();
  let rank = 0;
  let lastValue = null;
  for (const row of sorted) {
    const value = valueFn(row);
    const normalized = Number.isFinite(+value) ? +value : null;
    if (normalized !== lastValue) {
      rank += 1;
      lastValue = normalized;
    }
    rankMap.set(row.owner, rank);
  }
  return { sorted, rankMap };
}

function scoreOwnerSeason(profile, weights = DYNASTY_WEIGHTS, opts = {}) {
  const includeSaundersPenalty = opts.includeSaundersPenalty !== false;
  const components = emptyScoreComponents();
  const effectivePlayoffWins = +profile.playoffWins || 0;

  components.regularSeason += (+profile.wins || 0) * weights.regularSeasonWin;
  components.regularSeason += (+profile.ties || 0) * weights.regularSeasonTie;

  components.postseason += effectivePlayoffWins * weights.playoffWin;
  components.postseason += (+profile.saundersWins || 0) * weights.saundersWin;

  if (profile.champion) components.hardware += weights.championship;
  if (profile.regularSeasonTitle) components.hardware += weights.regularSeasonTitle;
  if (profile.bye) components.hardware += weights.topTwoBye;
  if (profile.wildCard) components.hardware += weights.wildCard;

  if (profile.pointsForRank === 1) components.scoringDominance += weights.pointsForRank1;
  else if (profile.pointsForRank === 2) components.scoringDominance += weights.pointsForRank2;
  else if (profile.pointsForRank === 3) components.scoringDominance += weights.pointsForRank3;

  if (profile.pointDiffRank === 1) components.scoringDominance += weights.pointDiffRank1;
  else if (profile.pointDiffRank === 2) components.scoringDominance += weights.pointDiffRank2;
  else if (profile.pointDiffRank === 3) components.scoringDominance += weights.pointDiffRank3;

  if (Number.isFinite(+profile.finish) && Number.isFinite(+profile.leagueSize)) {
    if (+profile.finish <= Math.ceil(+profile.leagueSize / 2)) {
      components.consistency += weights.topHalfFinish;
    }
    if (+profile.finish >= Math.max(9, +profile.leagueSize - 1)) {
      components.penalties += weights.bottomFinishPenalty;
    }
  }

  if ((+profile.pointDiff || 0) < 0) {
    components.penalties += weights.negativeDiffPenalty;
  }
  if (includeSaundersPenalty && profile.saunders) {
    components.penalties += weights.saundersTitlePenalty;
  }
  if (includeSaundersPenalty && profile.saundersBye) {
    components.penalties += weights.saundersByePenalty;
  }

  return {
    score: sumScoreComponents(components),
    components,
  };
}

function buildOwnerSeasonProfiles({
  seasonSummaries = [],
  seasonAggregates = [],
  weights = DYNASTY_WEIGHTS,
  includeSaundersPenalty = true,
} = {}) {
  const seasonRows = new Map();
  for (const row of seasonSummaries) {
    const season = +row.season;
    if (!seasonRows.has(season)) seasonRows.set(season, []);
    seasonRows.get(season).push(row);
  }

  const aggregateIndex = new Map(
    (Array.isArray(seasonAggregates) ? seasonAggregates : []).map(row => [profileSeasonLookupKey(row.team, row.season), row])
  );

  const profiles = [];
  for (const [season, rows] of [...seasonRows.entries()].sort((a, b) => a[0] - b[0])) {
    const leagueSize = rows.length;
    const winsRank = rankByValue(rows, row => +row.wins || 0, { descending: true }).rankMap;
    const pfRank = rankByValue(rows, row => +row.points_for || 0, { descending: true }).rankMap;
    const diffRank = rankByValue(rows, row => ((+row.points_for || 0) - (+row.points_against || 0)), { descending: true }).rankMap;
    for (const row of rows) {
      const aggregate = aggregateIndex.get(profileSeasonLookupKey(row.owner, season)) || null;
      const profile = {
        owner: row.owner,
        season,
        wins: +row.wins || 0,
        losses: +row.losses || 0,
        ties: +row.ties || 0,
        games: (+row.wins || 0) + (+row.losses || 0) + (+row.ties || 0),
        winPct: ((+row.wins || 0) + 0.5 * (+row.ties || 0)) / Math.max(1, ((+row.wins || 0) + (+row.losses || 0) + (+row.ties || 0))),
        finish: toNumber(row.finish),
        pointsFor: toNumber(row.points_for, aggregate?.pf ?? 0) || 0,
        pointsAgainst: toNumber(row.points_against, aggregate?.pa ?? 0) || 0,
        pointDiff: toNumber(row.points_for, aggregate?.pf ?? 0) - toNumber(row.points_against, aggregate?.pa ?? 0),
        playoffWins: +row.playoff_wins || 0,
        playoffLosses: +row.playoff_losses || 0,
        saundersWins: +row.saunders_wins || 0,
        saundersLosses: +row.saunders_losses || 0,
        champion: !!row.champion,
        saunders: !!row.saunders,
        bye: !!row.bye,
        wildCard: !!row.wild_card,
        saundersBye: !!row.saunders_bye,
        bagelsEarned: row.bagels_earned,
        leagueSize,
        regularSeasonTitle: winsRank.get(row.owner) === 1,
        pointsForRank: pfRank.get(row.owner) || null,
        pointDiffRank: diffRank.get(row.owner) || null,
      };
      const scored = scoreOwnerSeason(profile, weights, { includeSaundersPenalty });
      profiles.push({
        ...profile,
        seasonScore: scored.score,
        seasonComponents: scored.components,
      });
    }
  }

  return profiles.sort((a, b) => a.season - b.season || a.owner.localeCompare(b.owner));
}

function normalizePeriodBounds({
  startSeason = null,
  endSeason = null,
  requestedStartSeason = startSeason,
  requestedEndSeason = endSeason,
  availableSeasons = [],
} = {}) {
  const seasons = [...new Set(availableSeasons.map(value => +value).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!seasons.length) {
    return {
      requestedStartSeason: isFiniteInput(requestedStartSeason) ? +requestedStartSeason : null,
      requestedEndSeason: isFiniteInput(requestedEndSeason) ? +requestedEndSeason : null,
      startSeason: null,
      endSeason: null,
      availableSeasons: [],
    };
  }
  const minSeason = seasons[0];
  const maxSeason = seasons[seasons.length - 1];
  const latestStart = seasons[Math.max(0, seasons.length - 3)];
  const requestedStart = isFiniteInput(requestedStartSeason) ? +requestedStartSeason : (isFiniteInput(startSeason) ? +startSeason : latestStart);
  const requestedEnd = isFiniteInput(requestedEndSeason) ? +requestedEndSeason : (isFiniteInput(endSeason) ? +endSeason : maxSeason);
  const clampedStart = Math.min(maxSeason, Math.max(minSeason, requestedStart));
  const clampedEnd = Math.min(maxSeason, Math.max(minSeason, requestedEnd));
  return {
    requestedStartSeason: requestedStart,
    requestedEndSeason: requestedEnd,
    startSeason: Math.min(clampedStart, clampedEnd),
    endSeason: Math.max(clampedStart, clampedEnd),
    availableSeasons: seasons,
  };
}

function buildPeriodSeasons(owner, startSeason, endSeason, seasonProfiles) {
  return seasonProfiles
    .filter(row => row.owner === owner && row.season >= startSeason && row.season <= endSeason)
    .sort((a, b) => a.season - b.season);
}

function aggregateSeasonProfiles(seasons, {
  requestedStartSeason = null,
  requestedEndSeason = null,
  includeSaundersPenalty = true,
  weights = DYNASTY_WEIGHTS,
  comparisonScores = null,
} = {}) {
  const components = emptyScoreComponents();
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let games = 0;
  let playoffWins = 0;
  let playoffLosses = 0;
  let saundersWins = 0;
  let saundersLosses = 0;
  let championships = 0;
  let regularSeasonTitles = 0;
  let topHalfFinishes = 0;
  let bottomFinishes = 0;
  let saundersTitles = 0;
  let saundersByes = 0;
  let pointDiff = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  let finishTotal = 0;
  let finishCount = 0;
  let regularWins = 0;
  let regularTies = 0;

  for (const season of seasons) {
    const scored = scoreOwnerSeason(season, weights, { includeSaundersPenalty });
    Object.assign(components, addScoreComponents(components, scored.components));
    wins += season.wins;
    losses += season.losses;
    ties += season.ties;
    games += season.games;
    playoffWins += +season.playoffWins || 0;
    playoffLosses += season.playoffLosses;
    saundersWins += season.saundersWins;
    saundersLosses += season.saundersLosses;
    championships += season.champion ? 1 : 0;
    regularSeasonTitles += season.regularSeasonTitle ? 1 : 0;
    topHalfFinishes += isFiniteInput(season.finish) && isFiniteInput(season.leagueSize) && +season.finish <= Math.ceil(+season.leagueSize / 2) ? 1 : 0;
    bottomFinishes += isFiniteInput(season.finish) && isFiniteInput(season.leagueSize) && +season.finish >= Math.max(9, +season.leagueSize - 1) ? 1 : 0;
    saundersTitles += season.saunders ? 1 : 0;
    saundersByes += season.saundersBye ? 1 : 0;
    pointDiff += +season.pointDiff || 0;
    pointsFor += +season.pointsFor || 0;
    pointsAgainst += +season.pointsAgainst || 0;
    if (isFiniteInput(season.finish)) {
      finishTotal += +season.finish;
      finishCount += 1;
    }
    regularWins += +season.wins || 0;
    regularTies += +season.ties || 0;
  }

  const periodSeasonCount = seasons.length;
  const periodGames = games;
  const averageFinish = finishCount ? finishTotal / finishCount : null;
  const winPct = periodGames ? ((wins + 0.5 * ties) / periodGames) : 0;
  const requestedSeasonCount = isFiniteInput(requestedStartSeason) && isFiniteInput(requestedEndSeason)
    ? Math.max(0, (+requestedEndSeason - +requestedStartSeason) + 1)
    : periodSeasonCount;
  const coverageRatio = requestedSeasonCount ? periodSeasonCount / requestedSeasonCount : 0;
  const scoredStartSeason = seasons[0]?.season ?? null;
  const scoredEndSeason = seasons[seasons.length - 1]?.season ?? null;
  const baseScore = sumScoreComponents(components);
  const periodResult = {
    requestedStartSeason,
    requestedEndSeason,
    scoredStartSeason,
    scoredEndSeason,
    requestedSeasonCount,
    scoredSeasonCount: periodSeasonCount,
    coverageRatio,
    championships,
    regularSeasonTitles,
    playoffWins,
    playoffLosses,
    saundersWins,
    saundersLosses,
    topHalfFinishes,
    bottomFinishes,
    saundersTitles,
    saundersByes,
    wins,
    losses,
    ties,
    games: periodGames,
    winPct,
    pointDiff,
    pointsFor,
    pointsAgainst,
    averageFinish,
    components,
    score: baseScore,
    seasons,
    regularWins,
    regularTies,
  };

  const bonus = emptyScoreComponents();
  if (championships >= 2) {
    bonus.hardware += (championships - 1) * weights.multiTitleBonus;
  }
  if (seasons.length && seasons.every(season => !season.saunders && !season.saundersBye && !(isFiniteInput(season.finish) && isFiniteInput(season.leagueSize) && +season.finish >= Math.max(9, +season.leagueSize - 1)))) {
    bonus.consistency += weights.cleanWindowBonus;
  }

  periodResult.components = addScoreComponents(periodResult.components, bonus);
  periodResult.score = sumScoreComponents(periodResult.components);

  if (comparisonScores) {
    const ranked = rankDynastyScores(comparisonScores);
    const found = ranked.find(row => row.owner === seasons[0]?.owner && row.requestedStartSeason === requestedStartSeason && row.requestedEndSeason === requestedEndSeason);
    if (found) {
      periodResult.rankInPeriod = found.rankInPeriod;
      periodResult.percentileInPeriod = found.percentileInPeriod;
      periodResult.totalOwners = found.totalOwners;
      periodResult.playoffWinsRank = found.playoffWinsRank;
      periodResult.pointDiffRank = found.pointDiffRank;
      periodResult.winPctRank = found.winPctRank;
      periodResult.avgFinishRank = found.avgFinishRank;
    }
  }

  return periodResult;
}

function buildBasePeriodScore({
  owner,
  startSeason,
  endSeason,
  seasonProfiles,
  weights = DYNASTY_WEIGHTS,
  requestedStartSeason = startSeason,
  requestedEndSeason = endSeason,
  minSeasons = 1,
  includeSaundersPenalty = true,
} = {}) {
  const seasons = buildPeriodSeasons(owner, startSeason, endSeason, seasonProfiles);
  if (seasons.length < minSeasons) return null;
  const period = aggregateSeasonProfiles(seasons, {
    requestedStartSeason,
    requestedEndSeason,
    includeSaundersPenalty,
    weights,
  });
  return {
    owner,
    ...period,
  };
}

function buildComparisonCandidates({
  startSeason,
  endSeason,
  seasonProfiles,
  weights = DYNASTY_WEIGHTS,
  requestedStartSeason = startSeason,
  requestedEndSeason = endSeason,
  minSeasons = 1,
  includeSaundersPenalty = true,
} = {}) {
  const owners = [...new Set(seasonProfiles.map(row => row.owner))].sort((a, b) => a.localeCompare(b));
  const out = [];
  for (const owner of owners) {
    const score = buildBasePeriodScore({
      owner,
      startSeason,
      endSeason,
      seasonProfiles,
      weights,
      requestedStartSeason,
      requestedEndSeason,
      minSeasons,
      includeSaundersPenalty,
    });
    if (score) out.push(score);
  }
  return out;
}

function compareDynastyScores(a, b) {
  return (
    (+b.score || 0) - (+a.score || 0) ||
    (+b.championships || 0) - (+a.championships || 0) ||
    (+b.regularSeasonTitles || 0) - (+a.regularSeasonTitles || 0) ||
    (+b.playoffWins || 0) - (+a.playoffWins || 0) ||
    (+b.winPct || 0) - (+a.winPct || 0) ||
    (+b.pointDiff || 0) - (+a.pointDiff || 0) ||
    ((+a.averageFinish || Infinity) - (+b.averageFinish || Infinity)) ||
    (+b.coverageRatio || 0) - (+a.coverageRatio || 0) ||
    a.owner.localeCompare(b.owner)
  );
}

function rankDynastyScores(scores = []) {
  const ranked = scores.slice().sort(compareDynastyScores);
  const playoffWinsRank = rankByValue(ranked, row => row.playoffWins, { descending: true }).rankMap;
  const pointDiffRank = rankByValue(ranked, row => row.pointDiff, { descending: true }).rankMap;
  const winPctRank = rankByValue(ranked, row => row.winPct, { descending: true }).rankMap;
  const avgFinishRank = rankByValue(ranked, row => row.averageFinish, { descending: false }).rankMap;
  const totalOwners = ranked.length;
  return ranked.map((row, index) => {
    const rankInPeriod = index + 1;
    const scored = {
      ...row,
      rankInPeriod,
      percentileInPeriod: totalOwners > 1 ? 1 - ((rankInPeriod - 1) / (totalOwners - 1)) : 1,
      totalOwners,
      playoffWinsRank: playoffWinsRank.get(row.owner) || null,
      pointDiffRank: pointDiffRank.get(row.owner) || null,
      winPctRank: winPctRank.get(row.owner) || null,
      avgFinishRank: avgFinishRank.get(row.owner) || null,
    };
    scored.label = labelDynastyScore(scored);
    scored.explanation = buildDynastyExplanation(scored);
    return scored;
  });
}

function labelDynastyScore(score) {
  if (!score || !score.scoredSeasonCount) return 'No Data';
  if ((score.championships || 0) >= 2) return 'Dynasty Run';
  if ((score.championships || 0) >= 1 && (score.regularSeasonTitles || 0) >= 1) return 'Mini-Dynasty';
  if ((score.regularSeasonTitles || 0) >= 2 && (score.championships || 0) === 0) return 'Regular Season Machine';
  if ((score.playoffWinsRank || Infinity) <= 2 && (score.championships || 0) >= 1) return 'Playoff Peak';
  if ((score.pointDiffRank || Infinity) <= 2 && (score.championships || 0) === 0) return 'Snakebitten Era';
  if ((score.rankInPeriod || Infinity) >= Math.max(1, (score.totalOwners || 1) - 1)) return 'Dark Age';
  return 'Contender Stretch';
}

function buildDynastyExplanation(score) {
  const lines = [];
  if ((score.championships || 0) > 0) lines.push(`${score.championships} Darlings`);
  if ((score.regularSeasonTitles || 0) > 0) lines.push(`${score.regularSeasonTitles} regular-season title${score.regularSeasonTitles === 1 ? '' : 's'}`);
  if ((score.playoffWins || 0) > 0) lines.push(`${score.playoffWins} playoff win${score.playoffWins === 1 ? '' : 's'}`);
  if ((score.topHalfFinishes || 0) > 0) lines.push(`${score.topHalfFinishes} top-half finish${score.topHalfFinishes === 1 ? '' : 'es'}`);
  if (isFiniteInput(score.winPct)) lines.push(`${pct(score.winPct)} win pct`);
  if (isFiniteInput(score.pointDiff)) lines.push(`${signed(score.pointDiff, 1)} point differential`);
  if (isFiniteInput(score.rankInPeriod)) lines.push(`Ranked #${score.rankInPeriod} of ${score.totalOwners}`);
  return lines;
}

function calculateDynastyScore({
  owner,
  startSeason,
  endSeason,
  requestedStartSeason = startSeason,
  requestedEndSeason = endSeason,
  seasonProfiles = [],
  weights = DYNASTY_WEIGHTS,
  minSeasons = 1,
  includeSaundersPenalty = true,
  comparisonScores = null,
  skipRanking = false,
} = {}) {
  const base = buildBasePeriodScore({
    owner,
    startSeason,
    endSeason,
    seasonProfiles,
    weights,
    requestedStartSeason,
    requestedEndSeason,
    minSeasons,
    includeSaundersPenalty,
  });
  if (!base) {
    return {
      owner,
      requestedStartSeason,
      requestedEndSeason,
      startSeason,
      endSeason,
      scoredStartSeason: null,
      scoredEndSeason: null,
      requestedSeasonCount: isFiniteInput(requestedStartSeason) && isFiniteInput(requestedEndSeason) ? Math.max(0, (+requestedEndSeason - +requestedStartSeason) + 1) : 0,
      scoredSeasonCount: 0,
      coverageRatio: 0,
      score: 0,
      components: emptyScoreComponents(),
      seasons: [],
      championships: 0,
      regularSeasonTitles: 0,
      playoffWins: 0,
      playoffLosses: 0,
      saundersWins: 0,
      saundersLosses: 0,
      topHalfFinishes: 0,
      bottomFinishes: 0,
      saundersTitles: 0,
      saundersByes: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      games: 0,
      winPct: 0,
      pointDiff: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      averageFinish: null,
      label: 'No Data',
      explanation: ['No seasons available in requested range'],
    };
  }

  const result = {
    ...base,
  };

  if (!skipRanking) {
    let candidates = comparisonScores;
    if (!Array.isArray(candidates) && Array.isArray(seasonProfiles) && seasonProfiles.length) {
      candidates = buildComparisonCandidates({
        startSeason,
        endSeason,
        seasonProfiles,
        weights,
        requestedStartSeason,
        requestedEndSeason,
        minSeasons,
        includeSaundersPenalty,
      });
    }
    if (Array.isArray(candidates) && candidates.length) {
      const ranked = rankDynastyScores(candidates);
      const found = ranked.find(row => row.owner === owner);
      if (found) {
        result.rankInPeriod = found.rankInPeriod;
        result.percentileInPeriod = found.percentileInPeriod;
        result.totalOwners = found.totalOwners;
        result.playoffWinsRank = found.playoffWinsRank;
        result.pointDiffRank = found.pointDiffRank;
        result.winPctRank = found.winPctRank;
        result.avgFinishRank = found.avgFinishRank;
        result.label = found.label;
        result.explanation = found.explanation;
      } else {
        result.label = labelDynastyScore(result);
        result.explanation = buildDynastyExplanation(result);
      }
    } else {
      result.label = labelDynastyScore(result);
      result.explanation = buildDynastyExplanation(result);
    }
  } else {
    result.label = labelDynastyScore(result);
    result.explanation = buildDynastyExplanation(result);
  }

  return result;
}

function calculateDynastyScoresForPeriod({
  startSeason,
  endSeason,
  requestedStartSeason = startSeason,
  requestedEndSeason = endSeason,
  seasonProfiles = [],
  weights = DYNASTY_WEIGHTS,
  minSeasons = 1,
  includeSaundersPenalty = true,
} = {}) {
  const candidates = buildComparisonCandidates({
    startSeason,
    endSeason,
    seasonProfiles,
    weights,
    requestedStartSeason,
    requestedEndSeason,
    minSeasons,
    includeSaundersPenalty,
  });
  return rankDynastyScores(candidates);
}

function computeRollingDynastyWindows({
  windowSize = 3,
  seasonProfiles = [],
  startSeason = null,
  endSeason = null,
  minSeasons = 1,
  includeSaundersPenalty = true,
  weights = DYNASTY_WEIGHTS,
} = {}) {
  const seasons = [...new Set(seasonProfiles.map(row => row.season))].sort((a, b) => a - b);
  const filteredSeasons = seasons.filter(season => (startSeason === null || season >= startSeason) && (endSeason === null || season <= endSeason));
  const windows = [];
  if (filteredSeasons.length < windowSize) return windows;

  for (let index = 0; index <= filteredSeasons.length - windowSize; index++) {
    const windowStartSeason = filteredSeasons[index];
    const windowEndSeason = filteredSeasons[index + windowSize - 1];
    if (windowEndSeason - windowStartSeason + 1 !== windowSize) continue;
    const scores = calculateDynastyScoresForPeriod({
      startSeason: windowStartSeason,
      endSeason: windowEndSeason,
      requestedStartSeason: windowStartSeason,
      requestedEndSeason: windowEndSeason,
      seasonProfiles,
      weights,
      minSeasons,
      includeSaundersPenalty,
    });
    for (const score of scores) {
      windows.push({
        ...score,
        windowSize,
        windowStartSeason,
        windowEndSeason,
        windowLabel: `${windowStartSeason}-${windowEndSeason}`,
      });
    }
  }

  return windows;
}

function computeBestWindowsByOwner(rollingWindows = [], limit = 12) {
  const byOwner = new Map();
  for (const row of rollingWindows) {
    const current = byOwner.get(row.owner);
    if (!current || compareDynastyScores(row, current) < 0) {
      byOwner.set(row.owner, row);
    }
  }
  return [...byOwner.values()]
    .sort(compareDynastyScores)
    .slice(0, limit);
}

function computeSlumpWindows({
  rollingWindows = [],
  rollingThreeWindows = [],
  seasonProfiles = [],
  limit = 5,
  windowSize = 3,
} = {}) {
  const sourceWindows = Array.isArray(rollingWindows) && rollingWindows.length
    ? rollingWindows
    : Array.isArray(rollingThreeWindows)
      ? rollingThreeWindows
      : [];
  const lowestScores = sourceWindows
    .slice()
    .sort((a, b) => (+a.score || 0) - (+b.score || 0) || a.owner.localeCompare(b.owner))
    .slice(0, limit);

  const worstAverageFinish = sourceWindows
    .slice()
    .sort((a, b) => ((+b.averageFinish || -Infinity) - (+a.averageFinish || -Infinity)) || a.owner.localeCompare(b.owner))
    .slice(0, limit);

  const mostSaundersPain = sourceWindows
    .slice()
    .sort((a, b) => ((+b.saundersTitles || 0) + (+b.saundersByes || 0)) - ((+a.saundersTitles || 0) + (+a.saundersByes || 0)) || ((+b.score || 0) - (+a.score || 0)) || a.owner.localeCompare(b.owner))
    .slice(0, limit);

  const byOwner = new Map();
  for (const row of sourceWindows.slice().sort((a, b) => a.owner.localeCompare(b.owner) || (+a.windowStartSeason || 0) - (+b.windowStartSeason || 0))) {
    if (!byOwner.has(row.owner)) byOwner.set(row.owner, []);
    byOwner.get(row.owner).push(row);
  }
  const biggestDrops = [];
  const consecutiveGap = Math.max(1, (windowSize || 1) - 1);
  for (const [owner, rows] of byOwner.entries()) {
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const previous = rows[i];
        const current = rows[j];
        const startGap = (+current.windowStartSeason || 0) - (+previous.windowStartSeason || 0);
        if (startGap !== consecutiveGap) continue;
        const delta = (+current.score || 0) - (+previous.score || 0);
        if (delta < 0) {
          biggestDrops.push({
            owner,
            previousWindow: previous,
            currentWindow: current,
            delta,
          });
        }
      }
    }
  }
  biggestDrops.sort((a, b) => a.delta - b.delta || a.owner.localeCompare(b.owner));

  const worstFinishByOwner = new Map();
  for (const row of seasonProfiles) {
    if (!isFiniteInput(row.finish)) continue;
    const existing = worstFinishByOwner.get(row.owner);
    if (!existing || +row.finish > +existing.finish) {
      worstFinishByOwner.set(row.owner, row);
    }
  }

  return {
    windowSize,
    lowestScores,
    worstAverageFinish,
    mostSaundersPain,
    biggestDrops: biggestDrops.slice(0, limit),
    worstSingleSeasons: [...worstFinishByOwner.values()].sort((a, b) => (+b.finish || 0) - (+a.finish || 0) || a.owner.localeCompare(b.owner)).slice(0, limit),
  };
}

function heatmapSeasonScore(profile) {
  if (!profile) return null;
  return isFiniteInput(profile.seasonScore) ? +profile.seasonScore : null;
}

function lowerBound(sortedValues, value) {
  let low = 0;
  let high = sortedValues.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (sortedValues[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

function upperBound(sortedValues, value) {
  let low = 0;
  let high = sortedValues.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (sortedValues[mid] <= value) low = mid + 1;
    else high = mid;
  }
  return low;
}

function scorePercentile(sortedScores, value) {
  if (!sortedScores.length) return 0.5;
  if (!Number.isFinite(value)) return 0.5;
  if (sortedScores.length === 1) return 0.5;
  const start = lowerBound(sortedScores, value);
  const end = upperBound(sortedScores, value);
  const lowRank = Math.max(0, Math.min(sortedScores.length - 1, start));
  const highRank = Math.max(lowRank, Math.min(sortedScores.length - 1, end - 1));
  return ((lowRank + highRank) / 2) / (sortedScores.length - 1);
}

function buildHeatmapModel(seasonProfiles = [], seasons = []) {
  const ownerOrder = [...new Set(seasonProfiles.map(row => row.owner))].sort((a, b) => a.localeCompare(b));
  const seasonList = [...new Set(seasons.length ? seasons : seasonProfiles.map(row => row.season))].sort((a, b) => a - b);
  const scores = seasonProfiles.map(row => heatmapSeasonScore(row)).filter(Number.isFinite);
  const minScore = scores.length ? Math.min(...scores) : 0;
  const maxScore = scores.length ? Math.max(...scores) : 0;
  const rows = ownerOrder.map(owner => {
    const cells = seasonList.map(season => {
      const profile = seasonProfiles.find(row => row.owner === owner && row.season === season) || null;
      const score = heatmapSeasonScore(profile);
      return {
        season,
        profile,
        score,
        heat: score,
      };
    });
    return { owner, cells };
  });
  return {
    ownerOrder,
    seasonList,
    rows,
    minScore,
    maxScore,
  };
}

const DYNASTY_TREND_COLORS = [
  '#2563eb',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#0ea5e9',
  '#84cc16',
  '#ec4899',
  '#f97316',
  '#14b8a6',
  '#7c3aed',
  '#dc2626',
];

function buildDynastyTrendChartModel(seasonProfiles = [], hiddenOwners = []) {
  const ownerOrder = [...new Set(seasonProfiles.map(row => row.owner))].sort((a, b) => a.localeCompare(b));
  const seasonList = [...new Set(seasonProfiles.map(row => row.season))].sort((a, b) => a - b);
  const hiddenSet = new Set((Array.isArray(hiddenOwners) ? hiddenOwners : []).filter(Boolean));
  const profileIndex = new Map(seasonProfiles.map(row => [profileSeasonLookupKey(row.owner, row.season), row]));
  const series = ownerOrder.map((owner, index) => {
    let runningScore = 0;
    const points = seasonList.map(season => {
      const profile = profileIndex.get(profileSeasonLookupKey(owner, season)) || null;
      const seasonScore = heatmapSeasonScore(profile);
      if (Number.isFinite(seasonScore)) runningScore += seasonScore;
      return {
        season,
        profile,
        seasonScore,
        cumulativeScore: runningScore,
      };
    });
    return {
      owner,
      color: DYNASTY_TREND_COLORS[index % DYNASTY_TREND_COLORS.length],
      hidden: hiddenSet.has(owner),
      finalScore: runningScore,
      points,
    };
  });
  const allScores = series.flatMap(row => row.points.map(point => point.cumulativeScore));
  const minScore = allScores.length ? Math.min(...allScores) : 0;
  const maxScore = allScores.length ? Math.max(...allScores) : 1;
  const padding = Math.max(1, (maxScore - minScore) * 0.08);
  return {
    ownerOrder,
    seasonList,
    series,
    minScore: minScore - padding,
    maxScore: maxScore + padding,
    hiddenOwners: [...hiddenSet],
  };
}

function formatCoverage(score) {
  if (!score || !isFiniteInput(score.requestedSeasonCount) || !score.requestedSeasonCount) return null;
  const available = score.scoredSeasonCount;
  if (available === score.requestedSeasonCount) return null;
  return `Requested range: ${rangeLabel(score.requestedStartSeason, score.requestedEndSeason)} | Scored range: ${rangeLabel(score.scoredStartSeason, score.scoredEndSeason)} | ${available} of ${score.requestedSeasonCount} requested seasons available`;
}

function dynastyCalculatorHeroHtml(score, opts = {}) {
  const ownerLabel = score?.owner || opts.owner || 'Dynasty Rankings';
  const heroTitle = score?.owner ? `${escapeHtml(ownerLabel)} Dynasty Score` : 'Dynasty Rankings';
  const range = score ? rangeLabel(score.requestedStartSeason, score.requestedEndSeason) : '—';
  const rankText = score && isFiniteInput(score.rankInPeriod)
    ? `#${score.rankInPeriod} of ${score.totalOwners}`
    : 'Unranked';
  const label = score?.label || 'No Data';
  const coverage = formatCoverage(score);
  return `
    <div class="dynasty-calculator-hero">
      <div class="dynasty-calculator-hero-top">
        <div>
          <div class="dynasty-kicker">${escapeHtml(label)}</div>
          <h3>${heroTitle}</h3>
          <div class="dynasty-range">${escapeHtml(range)}</div>
        </div>
        <div class="dynasty-score">
          <div class="dynasty-score-rank">${escapeHtml(rankText)}</div>
          <div class="dynasty-score-value">${score ? fmtTrimmed(score.score) : '—'}</div>
          <div class="dynasty-score-sub">Dynasty score</div>
        </div>
      </div>
      ${score?.explanation?.length ? `<div class="dynasty-hero-summary">${score.explanation.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
      ${coverage ? `<div class="dynasty-coverage">${escapeHtml(coverage)}</div>` : ''}
    </div>
  `;
}

function dynastyScoreBreakdownHtml(score) {
  if (!score) return `<div class="dynasty-empty">Select a dynasty period to see the breakdown.</div>`;
  const entries = Object.entries(score.components || emptyScoreComponents());
  const maxValue = Math.max(1, ...entries.map(([, value]) => Math.abs(+value || 0)));
  const rows = entries.map(([label, value]) => {
    const pctWidth = Math.max(8, Math.round((Math.abs(+value || 0) / maxValue) * 100));
    const fillClass = (+value || 0) >= 0 ? 'positive' : 'negative';
    return `
      <div class="dynasty-breakdown-row">
        <div class="dynasty-breakdown-label">${escapeHtml(label)}</div>
        <div class="dynasty-component-bar">
          <div class="dynasty-component-fill ${fillClass}" style="width:${pctWidth}%"></div>
        </div>
        <div class="dynasty-breakdown-value">${signed(value, 1)}</div>
      </div>
    `;
  }).join('');

  const seasonRows = (score.seasons || []).map(row => `
    <li>
      <strong>${row.season}</strong>
      <span>${escapeHtml(`${whole(row.wins)}-${whole(row.losses)}-${whole(row.ties)} | ${whole(row.finish)}${row.champion ? ' | Champion' : row.saunders ? ' | Saunders' : ''}`)}</span>
    </li>
  `).join('');

  return `
    <div class="dynasty-score-breakdown">
      <div class="dynasty-breakdown-list">${rows}</div>
      <div class="dynasty-breakdown-meta">
        <div><span>Record</span><strong>${whole(score.wins)}-${whole(score.losses)}-${whole(score.ties)}</strong></div>
        <div><span>Playoffs</span><strong>${whole(score.playoffWins)}-${whole(score.playoffLosses)}</strong></div>
        <div><span>Point diff</span><strong>${signed(score.pointDiff, 1)}</strong></div>
        <div><span>Coverage</span><strong>${pct(score.coverageRatio)}</strong></div>
      </div>
      ${seasonRows ? `<ul class="dynasty-season-list">${seasonRows}</ul>` : ''}
    </div>
  `;
}

function dynastyPeriodLeaderboardHtml(scores = []) {
  return dynastyPeriodComparisonHtml(scores);
}

function buildDynastyWindowKey(window = {}) {
  return [
    window.owner || '',
    window.windowStartSeason || '',
    window.windowEndSeason || '',
    window.windowSize || '',
  ].join('|');
}

function seasonOutcomeLabel(season = {}) {
  if (season.champion) return 'Champion';
  if (season.saunders) return 'Saunders';
  if (season.saundersBye) return 'Saunders Bye';
  if (season.bye) return 'BYE';
  if (Number.isFinite(+season.finish) && Number.isFinite(+season.leagueSize) && +season.finish >= Math.max(9, +season.leagueSize - 1)) {
    return 'Missed playoffs';
  }
  return `Finish ${whole(season.finish)}`;
}

function seasonOutcomeNarrative(team, games, roundPrefix = '') {
  if (!games.length) return '';
  const ordered = games
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || roundOrderFn(a.round) - roundOrderFn(b.round));
  const narrative = [];
  for (const g of ordered) {
    const s = sidesForTeamFn(g, team);
    if (!s) continue;
    const opp = s.opp;
    let round = normRoundFn(g.round);
    if (!round) round = roundPrefix ? `${roundPrefix} Round` : 'Playoffs';
    else if (roundPrefix && !new RegExp(`^${roundPrefix}\\b`, 'i').test(round)) round = `${roundPrefix} ${round}`;
    if (s.result === 'W') narrative.push(`Defeated ${opp} in ${round}`);
    else if (s.result === 'L') narrative.push(`Lost to ${opp} in ${round}`);
    else narrative.push(`Tied ${opp} in ${round}`);
  }
  return narrative.join(', ');
}

function seasonModalOutcome(owner, seasonRow, allGames = [], kind = 'playoffs') {
  const season = +seasonRow.season;
  const seasonGames = Array.isArray(allGames)
    ? allGames.filter(g => +g.season === season && (g.teamA === owner || g.teamB === owner))
    : [];
  const playoffGames = seasonGames.filter(g => isPlayoffGameFn(g));
  const saundersGames = seasonGames.filter(g => isSaundersGameFn(g));
  const parts = [];
  if (kind === 'saunders') {
    if (seasonRow.saundersBye || seasonRow.bye) parts.push('BYE');
    if (saundersGames.length || seasonRow.saunders || seasonRow.saundersBye) parts.push('Saunders Bowl');
    const saundersNarr = seasonOutcomeNarrative(owner, saundersGames, 'Saunders');
    if (saundersNarr) parts.push(saundersNarr);
    else if (seasonRow.saundersBye) parts.push('Advanced by bye');
    else if (seasonRow.saunders) parts.push('Saunders appearance');
    else if (Number.isFinite(+seasonRow.finish)) parts.push(`Finish ${whole(seasonRow.finish)}`);
    return parts.join(' | ');
  }

  if (seasonRow.bye) parts.push('BYE');
  if (playoffGames.length || seasonRow.champion) parts.push('Playoffs');
  const playoffNarr = seasonOutcomeNarrative(owner, playoffGames);
  const saundersNarr = seasonOutcomeNarrative(owner, saundersGames, 'Saunders');
  if (playoffNarr) parts.push(playoffNarr);
  else if (saundersNarr) parts.push(saundersNarr);
  else if (seasonRow.champion) parts.push('Champion');
  else if (seasonRow.saunders) parts.push('Saunders');
  else if (seasonRow.saundersBye) parts.push('Saunders Bye');
  else if (seasonRow.bye) parts.push('Top-2 Seed');
  else if (Number.isFinite(+seasonRow.finish)) parts.push(`Finish ${whole(seasonRow.finish)}`);
  return parts.join(' | ');
}

function bestWindowCard(window) {
  if (!window) return '';
  const period = rangeLabel(window.windowStartSeason, window.windowEndSeason);
  const windowKey = buildDynastyWindowKey(window);
  return `
    <button
      type="button"
      class="dynasty-window-card"
      data-window-key="${escapeHtml(windowKey)}"
      aria-haspopup="dialog"
      aria-controls="dynastyWindowModal"
    >
      <div class="dynasty-window-card-top">
        <div>
          <div class="dynasty-window-label">${escapeHtml(window.owner)}</div>
          <h4>${escapeHtml(period)}</h4>
        </div>
        <div class="dynasty-score-value">${fmtTrimmed(window.score)}</div>
      </div>
      <div class="dynasty-window-meta">
        ${window.windowSize ? `<span>${escapeHtml(`${window.windowSize}-Year Window`)}</span>` : ''}
        <span>${escapeHtml(window.label)}</span>
      </div>
      <div class="dynasty-chip-row">
        <span class="dynasty-chip">${whole(window.championships)} Darlings</span>
        <span class="dynasty-chip">${whole(window.regularSeasonTitles)} RS titles</span>
        <span class="dynasty-chip">${pct(window.winPct)} win pct</span>
      </div>
    </button>
  `;
}

function dynastyWindowModalHtml(window = null, opts = {}) {
  if (!window) return '';
  const kind = opts.kind || 'playoffs';
  const seasons = Array.isArray(window.seasons) ? window.seasons.slice().sort((a, b) => a.season - b.season) : [];
  const allGames = Array.isArray(opts.allGames) ? opts.allGames : [];
  const playoffAppearances = seasons.filter(season =>
    ((+season.playoffWins || 0) + (+season.playoffLosses || 0) > 0) || season.bye || season.wildCard || season.champion
  ).length;
  const saundersAppearances = seasons.filter(season =>
    ((+season.saundersWins || 0) + (+season.saundersLosses || 0) > 0) || season.saundersBye || season.saunders
  ).length;
  const playoffWins = seasons.reduce((total, season) => total + (+season.playoffWins || 0), 0);
  const playoffLosses = seasons.reduce((total, season) => total + (+season.playoffLosses || 0), 0);
  const saundersWins = seasons.reduce((total, season) => total + (+season.saundersWins || 0), 0);
  const saundersLosses = seasons.reduce((total, season) => total + (+season.saundersLosses || 0), 0);
  const title = `${window.owner} ${rangeLabel(window.windowStartSeason, window.windowEndSeason)}`;
  const titleLabel = kind === 'saunders' ? 'Lowest 5-Year Score' : 'Best Dynasty Window';
  const appearanceLabel = kind === 'saunders' ? 'Saunders Bowl Appearances' : 'Playoff Appearances';
  const recordLabel = kind === 'saunders' ? 'Saunders Record' : 'Playoff Record';
  const seasonRows = seasons.map(season => `
    <tr>
      <td>${season.season}</td>
      <td>${whole(season.wins)}-${whole(season.losses)}-${whole(season.ties)}</td>
      <td>${seasonModalOutcome(window.owner, season, allGames, kind)}${season.champion ? ' 👑' : ''}</td>
    </tr>
  `).join('');
  return `
    <div class="dynasty-modal-backdrop" data-dynasty-modal-close="1"></div>
    <div class="dynasty-modal-panel" role="dialog" aria-modal="true" aria-labelledby="dynastyWindowModalTitle" tabindex="-1">
      <button type="button" class="dynasty-modal-close" data-dynasty-modal-close="1" aria-label="Close window details">×</button>
      <div class="dynasty-modal-kicker">${escapeHtml(titleLabel)}</div>
      <h3 id="dynastyWindowModalTitle">${escapeHtml(title)}</h3>
      <div class="dynasty-modal-subtitle">
        ${escapeHtml(window.windowSize ? `${window.windowSize}-Year Window` : 'Window')}
        · ${escapeHtml(window.label || 'Dynasty Window')}
      </div>
      <div class="dynasty-modal-metrics">
        <div class="dynasty-modal-metric">
          <span>Total Record</span>
          <strong>${whole(window.wins)}-${whole(window.losses)}-${whole(window.ties)}</strong>
        </div>
        <div class="dynasty-modal-metric">
          <span>${escapeHtml(appearanceLabel)}</span>
          <strong>${whole(kind === 'saunders' ? saundersAppearances : playoffAppearances)}</strong>
        </div>
        <div class="dynasty-modal-metric">
          <span>${escapeHtml(recordLabel)}</span>
          <strong>${whole(kind === 'saunders' ? saundersWins : playoffWins)}-${whole(kind === 'saunders' ? saundersLosses : playoffLosses)}</strong>
        </div>
      </div>
      <div class="dynasty-modal-table-wrap">
        <table class="dynasty-modal-table">
          <thead>
            <tr>
              <th scope="col">Season</th>
              <th scope="col">Record</th>
              <th scope="col">Final Result</th>
            </tr>
          </thead>
          <tbody>
            ${seasonRows || '<tr><td colspan="3">No season details available.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function findDynastyWindowByKey(bestWindows = {}, key = '') {
  if (!key) return null;
  const allWindows = [
    ...(Array.isArray(bestWindows.topOverall) ? bestWindows.topOverall : []),
    ...(Array.isArray(bestWindows.byOwner) ? bestWindows.byOwner : []),
  ];
  return allWindows.find(window => buildDynastyWindowKey(window) === key) || null;
}

function findDynastyWindowByKeyFromRows(rows = [], key = '') {
  if (!key) return null;
  return (Array.isArray(rows) ? rows : []).find(window => buildDynastyWindowKey(window) === key) || null;
}

function dynastyBestWindowsHtml(bestWindows = {}) {
  const topOverall = Array.isArray(bestWindows.topOverall) ? bestWindows.topOverall : [];
  const byOwner = Array.isArray(bestWindows.byOwner) ? bestWindows.byOwner : [];
  const topHtml = topOverall.slice(0, 10).map(bestWindowCard).join('');
  const ownerHtml = byOwner.map(bestWindowCard).join('');
  const windowSizeLabel = bestWindows.windowSizeLabel ? `${bestWindows.windowSizeLabel} Windows` : 'Windows';
  return `
    <div class="dynasty-window-grid">
      <div>
        <h4 class="dynasty-grid-title">Best Overall ${escapeHtml(windowSizeLabel)}</h4>
        <div class="dynasty-window-grid-inner">${topHtml || '<div class="dynasty-empty">No rolling windows available.</div>'}</div>
      </div>
      <div>
        <h4 class="dynasty-grid-title">Best Window by Owner${bestWindows.windowSizeLabel ? ` (${escapeHtml(bestWindows.windowSizeLabel)})` : ''}</h4>
        <div class="dynasty-window-grid-inner">${ownerHtml || '<div class="dynasty-empty">No rolling windows available.</div>'}</div>
      </div>
    </div>
  `;
}

function heatmapCellBackground(cell, score, minScore = 0, maxScore = 0) {
  const mix = (from, to, t) => Math.round(from + ((to - from) * t));
  const blend = (from, to, t) => `rgb(${mix(from[0], to[0], t)}, ${mix(from[1], to[1], t)}, ${mix(from[2], to[2], t)})`;
  if (cell.profile?.champion) {
    const t = 0.75;
    return {
      background: blend([255, 249, 231], [234, 179, 8], t),
      color: '#1f2937',
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.26), 0 0 0 1px rgba(180,123,0,.24)',
    };
  }
  if (cell.profile?.saunders) {
    const t = 0.85;
    return {
      background: blend([90, 61, 24], [75, 44, 14], t),
      color: '#fff',
      boxShadow: 'inset 0 0 0 1px rgba(255,248,238,.14), 0 0 0 1px rgba(75,44,14,.35)',
    };
  }
  const value = Number.isFinite(score) ? +score : 0;
  const anchor = 8;
  const lowerBound = Number.isFinite(minScore) ? Math.min(+minScore, anchor) : anchor;
  const upperBound = Number.isFinite(maxScore) ? Math.max(+maxScore, anchor) : anchor;
  if (value <= anchor) {
    const denominator = Math.max(1, anchor - lowerBound);
    const t = clamp01((anchor - value) / denominator);
    return {
      background: blend([255, 248, 248], [185, 28, 28], t),
      color: t > 0.72 ? '#0f172a' : '#fff',
    };
  }
  const denominator = Math.max(1, upperBound - anchor);
  const t = clamp01((value - anchor) / denominator);
  return {
    background: blend([244, 248, 255], [37, 99, 235], t),
    color: t < 0.35 ? '#0f172a' : '#fff',
  };
}

function dynastyHeatmapHtml(heatmap = {}) {
  const seasons = heatmap.seasonList || [];
  const rows = heatmap.rows || [];
  if (!seasons.length || !rows.length) return `<div class="dynasty-empty">No heatmap data available.</div>`;

  const header = `
    <div class="dynasty-heatmap-row dynasty-heatmap-header">
      <div class="dynasty-heatmap-owner">Owner</div>
      ${seasons.map(season => `<div class="dynasty-heatmap-season">${season}</div>`).join('')}
    </div>
  `;

  const body = rows.map(row => `
    <div class="dynasty-heatmap-row">
      <div class="dynasty-heatmap-owner">${escapeHtml(row.owner)}</div>
      ${row.cells.map(cell => {
        if (!cell.profile) {
          return `<div class="dynasty-heatmap-cell empty"></div>`;
        }
        const colors = heatmapCellBackground(cell, cell.heat, heatmap.minScore, heatmap.maxScore);
        const styleBits = [
          `background:${colors.background}`,
          `color:${colors.color}`,
          colors.boxShadow ? `box-shadow:${colors.boxShadow}` : null,
        ].filter(Boolean).join(';');
        const accent = cell.profile.champion ? 'champion' : cell.profile.saunders ? 'saunders' : '';
        return `
          <div class="dynasty-heatmap-cell ${accent}" style="${styleBits}">
            <span class="dynasty-heatmap-season-num">${cell.season}</span>
            <strong>${n(cell.score, 1)}</strong>
            <span>${whole(cell.profile.finish)}${cell.profile.champion ? ' 👑' : ''}${cell.profile.saunders ? ' 🪱' : ''}</span>
          </div>
        `;
      }).join('')}
    </div>
  `).join('');

  return `<div class="dynasty-heatmap" style="--season-count:${seasons.length}">${header}${body}</div>`;
}

function dynastyTrendChartHtml(chart = {}, opts = {}) {
  const seasons = chart.seasonList || [];
  const hiddenOwners = Array.isArray(opts.hiddenOwners) ? opts.hiddenOwners : (Array.isArray(chart.hiddenOwners) ? chart.hiddenOwners : []);
  const hiddenSet = new Set(hiddenOwners.filter(Boolean));
  const series = (chart.series || []).map(row => ({
    ...row,
    hidden: hiddenSet.has(row.owner),
  }));
  if (!seasons.length || !series.length) return `<div class="dynasty-empty">No dynasty trend data available.</div>`;

  const visibleSeries = series.filter(row => !row.hidden);
  const width = 1100;
  const height = 380;
  const margin = { top: 28, right: 28, bottom: 42, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xForIndex = index => margin.left + (seasons.length === 1 ? innerWidth / 2 : (index / (seasons.length - 1)) * innerWidth);
  const yForValue = value => margin.top + ((chart.maxScore - value) / Math.max(0.0001, chart.maxScore - chart.minScore)) * innerHeight;

  const yTicks = 5;
  const tickValues = [];
  for (let i = 0; i <= yTicks; i += 1) {
    tickValues.push(chart.minScore + ((chart.maxScore - chart.minScore) * (i / yTicks)));
  }

  const legendHtml = series.map(row => `
    <button
      type="button"
      class="dynasty-facet-chip${row.hidden ? ' is-hidden' : ''}"
      data-dynasty-trend-toggle="1"
      data-owner="${escapeHtml(row.owner)}"
      aria-pressed="${row.hidden ? 'false' : 'true'}"
      title="${escapeHtml(row.hidden ? 'Show series' : 'Hide series')}"
    >
      <span class="dynasty-facet-swatch" style="background:${row.color}"></span>
      <span class="dynasty-facet-label">${escapeHtml(row.owner)}</span>
      <span class="dynasty-facet-value">${fmtTrimmed(row.finalScore)}</span>
      <span class="dynasty-facet-action">${row.hidden ? 'Show' : 'Hide'}</span>
    </button>
  `).join('');

  const svgSeries = visibleSeries.map(row => {
    const points = row.points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xForIndex(index).toFixed(2)} ${yForValue(point.cumulativeScore).toFixed(2)}`).join(' ');
    const finalPoint = row.points[row.points.length - 1];
    const lastX = xForIndex(row.points.length - 1).toFixed(2);
    const lastY = yForValue(finalPoint.cumulativeScore).toFixed(2);
    const seasonLabel = finalPoint?.season ?? '—';
    return `
      <g class="dynasty-trend-series">
        <title>${escapeHtml(`${row.owner}: ${fmtTrimmed(row.finalScore)} through ${seasonLabel}`)}</title>
        <path d="${points}" class="dynasty-trend-path" style="stroke:${row.color}" />
        <circle cx="${lastX}" cy="${lastY}" r="3.6" fill="${row.color}" />
      </g>
    `;
  }).join('');

  const gridLines = tickValues.map(value => {
    const y = yForValue(value).toFixed(2);
    return `
      <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" class="dynasty-trend-grid" />
      <text x="${margin.left - 10}" y="${y}" text-anchor="end" dominant-baseline="middle" class="dynasty-trend-y-label">${fmtTrimmed(value)}</text>
    `;
  }).join('');

  const xLabels = seasons.map((season, index) => {
    const x = xForIndex(index).toFixed(2);
    return `
      <text x="${x}" y="${height - 14}" text-anchor="middle" class="dynasty-trend-x-label">${season}</text>
      <line x1="${x}" y1="${height - margin.bottom}" x2="${x}" y2="${height - margin.bottom + 6}" class="dynasty-trend-tick" />
    `;
  }).join('');

  const emptyOverlay = visibleSeries.length
    ? ''
    : `<div class="dynasty-trend-empty">All teams are hidden. Click a team in the key to bring it back.</div>`;

  return `
    <div class="dynasty-trend-chart">
      <div class="dynasty-trend-header">
        <div>
          <h4 class="dynasty-grid-title">All-Time Dynasty Trend</h4>
          <div class="dynasty-trend-note">Cumulative dynasty score by season. Click a team in the key to hide or show it.</div>
        </div>
      </div>
      <div class="dynasty-trend-legend">${legendHtml}</div>
      <div class="dynasty-trend-body">
        ${emptyOverlay}
        <svg class="dynasty-trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="All-time dynasty score through the years">
          <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" class="dynasty-trend-axis" />
          <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" class="dynasty-trend-axis" />
          ${gridLines}
          ${svgSeries}
          ${xLabels}
        </svg>
      </div>
    </div>
  `;
}

function dynastySlumpsHtml(slumps = {}) {
  const windowLabel = slumps.windowSize ? `${slumps.windowSize}-Year` : 'Rolling 3-Year';
  const card = (title, rows, formatter) => `
    <section class="dynasty-slump-card">
      <h4>${escapeHtml(title)}</h4>
      <ul class="dynasty-slump-list">
        ${(rows || []).map(formatter).join('') || '<li class="dynasty-empty">No data.</li>'}
      </ul>
    </section>
  `;

  return `
    <div class="dynasty-slump-grid">
      ${card(`Lowest ${windowLabel} Scores`, slumps.lowestScores, row => {
        const windowKey = buildDynastyWindowKey(row);
        return `
          <li class="dynasty-slump-list-item">
            <button type="button" class="dynasty-slump-item" data-window-kind="saunders" data-window-key="${escapeHtml(windowKey)}">
              <span class="dynasty-slump-main">
                <strong>${escapeHtml(row.owner)}</strong>
                <span class="dynasty-slump-range">${escapeHtml(rangeLabel(row.windowStartSeason, row.windowEndSeason))}</span>
              </span>
              <span class="dynasty-slump-score">${n(row.score, 1)}</span>
            </button>
          </li>
        `;
      })}
      ${card(`Worst Average Finish`, slumps.worstAverageFinish, row => `<li><strong>${escapeHtml(row.owner)}</strong> ${escapeHtml(rangeLabel(row.windowStartSeason, row.windowEndSeason))} <span>${n(row.averageFinish, 2)}</span></li>`)}
      ${card(`Most Saunders`, slumps.mostSaundersPain, row => `<li><strong>${escapeHtml(row.owner)}</strong> ${escapeHtml(rangeLabel(row.windowStartSeason, row.windowEndSeason))} <span>${whole((+row.saundersTitles || 0) + (+row.saundersByes || 0))}</span></li>`)}
      ${card(`Biggest Drops`, slumps.biggestDrops, row => `<li><strong>${escapeHtml(row.owner)}</strong> ${escapeHtml(rangeLabel(row.previousWindow?.windowStartSeason, row.previousWindow?.windowEndSeason))} → ${escapeHtml(rangeLabel(row.currentWindow?.windowStartSeason, row.currentWindow?.windowEndSeason))} <span>${signed(row.delta, 1)}</span></li>`)}
    </div>
  `;
}

function dynastyFormulaHtml(formula = {}) {
  const weights = formula.weights || DYNASTY_WEIGHTS;
  const rows = Object.entries(weights).map(([key, value]) => `
    <tr>
      <td>${escapeHtml(key)}</td>
      <td>${signed(value, 1)}</td>
    </tr>
  `).join('');
  const rules = formula.labelRules || [
    'Dynasty Run: at least 2 championships.',
    'Mini-Dynasty: at least 1 championship and 1 regular-season title.',
    'Regular Season Machine: at least 2 regular-season titles without a championship.',
    'Playoff Peak: postseason rank drives the result.',
    'Snakebitten Era: strong point differential without titles.',
    'Dark Age: near the bottom of the selected period.',
  ];
  return `
    <div class="dynasty-formula">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th scope="col">Weight</th><th scope="col">Value</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <ul class="dynasty-formula-rules">
        ${rules.map(rule => `<li>${escapeHtml(rule)}</li>`).join('')}
      </ul>
    </div>
  `;
}

function renderDynastyCalculatorHero(score, opts = {}) {
  const el = docOrDefault(opts.doc)?.getElementById('dynastyCalculatorHero');
  if (!el) return;
  el.innerHTML = dynastyCalculatorHeroHtml(score, opts);
}

function renderDynastyScoreBreakdown(score, opts = {}) {
  const el = docOrDefault(opts.doc)?.getElementById('dynastyScoreBreakdown');
  if (!el) return;
  el.innerHTML = dynastyScoreBreakdownHtml(score, opts);
}

function renderDynastyPeriodLeaderboard(scores, opts = {}) {
  const el = docOrDefault(opts.doc)?.getElementById('dynastyPeriodLeaderboard');
  if (!el) return;
  el.innerHTML = dynastyPeriodComparisonHtml(scores, opts);
}

function renderDynastyBestWindows(bestWindows, opts = {}) {
  const el = docOrDefault(opts.doc)?.getElementById('dynastyBestWindows');
  if (!el) return;
  el.innerHTML = dynastyBestWindowsHtml(bestWindows, opts);
}

function renderDynastyWindowModal(window, opts = {}) {
  const el = docOrDefault(opts.doc)?.getElementById('dynastyWindowModal');
  if (!el) return;
  if (!window) {
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.setAttribute('aria-hidden', 'false');
  el.innerHTML = dynastyWindowModalHtml(window, opts);
}

function renderDynastySlumpModal(window, opts = {}) {
  return renderDynastyWindowModal(window, { ...opts, kind: 'saunders' });
}

function renderDynastyHeatmap(heatmap, opts = {}) {
  const el = docOrDefault(opts.doc)?.getElementById('dynastyHeatmap');
  if (!el) return;
  el.innerHTML = dynastyHeatmapHtml(heatmap, opts);
}

function renderDynastyTrendChart(chart, opts = {}) {
  const el = docOrDefault(opts.doc)?.getElementById('dynastyTrendChart');
  if (!el) return;
  el.innerHTML = dynastyTrendChartHtml(chart, opts);
}

function renderDynastySlumps(slumps, opts = {}) {
  const el = docOrDefault(opts.doc)?.getElementById('dynastySlumps');
  if (!el) return;
  el.innerHTML = dynastySlumpsHtml(slumps, opts);
}

function renderDynastyFormula(formula, opts = {}) {
  const el = docOrDefault(opts.doc)?.getElementById('dynastyFormula');
  if (!el) return;
  el.innerHTML = dynastyFormulaHtml(formula, opts);
}

function buildDynastyViewModel({
  leagueGames = [],
  seasonSummaries = [],
  seasonAggregates = null,
  mode = 'calculator',
  owner = 'Joe',
  startSeason = null,
  endSeason = null,
  requestedStartSeason = startSeason,
  requestedEndSeason = endSeason,
  minSeasons = 2,
  includeSaundersPenalty = true,
  weights = DYNASTY_WEIGHTS,
  allTeams = '__ALL__',
} = {}) {
  const aggregates = seasonAggregates || computeSeasonAggregatesAllTeams(leagueGames, seasonSummaries);
  const seasonProfiles = buildOwnerSeasonProfiles({
    seasonSummaries,
    seasonAggregates: aggregates,
    weights,
    includeSaundersPenalty,
  });
  const seasons = [...new Set(seasonProfiles.map(row => row.season))].sort((a, b) => a - b);
  const availableStart = seasons[0] ?? null;
  const availableEnd = seasons[seasons.length - 1] ?? null;
  const normalizedRange = normalizeRangeForMode({
    mode,
    startSeason,
    endSeason,
    requestedStartSeason,
    requestedEndSeason,
    availableSeasons: seasons,
  });
  const leaderboardRange = mode === 'all-time'
    ? { startSeason: availableStart, endSeason: availableEnd, requestedStartSeason: availableStart, requestedEndSeason: availableEnd }
    : normalizedRange;
  const periodScores = calculateDynastyScoresForPeriod({
    startSeason: leaderboardRange.startSeason,
    endSeason: leaderboardRange.endSeason,
    requestedStartSeason: leaderboardRange.requestedStartSeason,
    requestedEndSeason: leaderboardRange.requestedEndSeason,
    seasonProfiles,
    weights,
    minSeasons,
    includeSaundersPenalty,
  });
  const rollingRange = {
    startSeason: leaderboardRange.startSeason,
    endSeason: leaderboardRange.endSeason,
  };
  const activeWindowSize = mode === 'rolling-5' ? 5 : 3;
  const selectedOwner = owner && owner !== allTeams ? owner : null;
  const selectedScore = mode === 'rolling-3' || mode === 'rolling-5'
    ? null
    : (selectedOwner ? periodScores.find(row => row.owner === selectedOwner) || periodScores[0] || null : periodScores[0] || null);
  const rollingThreeWindows = computeRollingDynastyWindows({
    windowSize: 3,
    seasonProfiles,
    startSeason: rollingRange.startSeason,
    endSeason: rollingRange.endSeason,
    minSeasons,
    includeSaundersPenalty,
    weights,
  });
  const rollingFiveWindows = computeRollingDynastyWindows({
    windowSize: 5,
    seasonProfiles,
    startSeason: rollingRange.startSeason,
    endSeason: rollingRange.endSeason,
    minSeasons,
    includeSaundersPenalty,
    weights,
  });
  const activeRollingWindows = activeWindowSize === 5 ? rollingFiveWindows : rollingThreeWindows;
  const bestWindows = {
    windowSize: activeWindowSize,
    windowSizeLabel: `${activeWindowSize}-Year`,
    topOverall: activeRollingWindows
      .slice()
      .sort(compareDynastyScores)
      .slice(0, 10),
    byOwner: computeBestWindowsByOwner(activeRollingWindows, 12),
  };
  const slumps = computeSlumpWindows({
    rollingWindows: activeRollingWindows,
    seasonProfiles,
    windowSize: activeWindowSize,
  });
  const heatmap = buildHeatmapModel(seasonProfiles, seasons);
  const heroScore = mode === 'rolling-3' || mode === 'rolling-5'
    ? bestWindows.topOverall[0] || null
    : (mode === 'calculator'
      ? selectedScore
      : periodScores[0] || null);
  const comparisonRows = mode === 'rolling-3' || mode === 'rolling-5'
    ? bestWindows.topOverall.slice(0, 10)
    : periodScores;

  return {
    controls: {
      mode,
      owner: owner || allTeams,
      startSeason: leaderboardRange.startSeason,
      endSeason: leaderboardRange.endSeason,
      requestedStartSeason: leaderboardRange.requestedStartSeason,
      requestedEndSeason: leaderboardRange.requestedEndSeason,
      minSeasons,
      includeSaundersPenalty,
    },
    selectedScore: heroScore,
    comparisonRows,
    periodScores,
    rollingThreeWindows,
    rollingFiveWindows,
    bestWindows,
    slumps,
    heatmap,
    trendChart: buildDynastyTrendChartModel(seasonProfiles),
    seasonProfiles,
  };
}

function normalizeRangeForMode({
  mode,
  startSeason,
  endSeason,
  requestedStartSeason,
  requestedEndSeason,
  availableSeasons = [],
} = {}) {
  const seasons = [...new Set(availableSeasons.map(value => +value).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!seasons.length) {
    return {
      startSeason: null,
      endSeason: null,
      requestedStartSeason: null,
      requestedEndSeason: null,
    };
  }
  const minSeason = seasons[0];
  const maxSeason = seasons[seasons.length - 1];
  const requestedStart = isFiniteInput(requestedStartSeason) ? +requestedStartSeason : (isFiniteInput(startSeason) ? +startSeason : seasons[Math.max(0, seasons.length - 3)]);
  const requestedEnd = isFiniteInput(requestedEndSeason) ? +requestedEndSeason : (isFiniteInput(endSeason) ? +endSeason : maxSeason);
  const clampedStart = Math.min(maxSeason, Math.max(minSeason, requestedStart));
  const clampedEnd = Math.min(maxSeason, Math.max(minSeason, requestedEnd));
  return {
    startSeason: Math.min(clampedStart, clampedEnd),
    endSeason: Math.max(clampedStart, clampedEnd),
    requestedStartSeason: requestedStart,
    requestedEndSeason: requestedEnd,
  };
}

function dynastyPeriodComparisonHtml(rows = [], opts = {}) {
  if (!rows.length) return `<div class="dynasty-empty">No qualifying owners in this period.</div>`;
  const rollingMode = opts.mode === 'rolling-3' || opts.mode === 'rolling-5';
  const hasWindowColumn = rollingMode || rows.some(row => row.windowLabel || (Number.isFinite(+row.windowStartSeason) && Number.isFinite(+row.windowEndSeason)));
  const header = hasWindowColumn
    ? `
      <thead>
        <tr>
          <th scope="col">Rank</th>
          <th scope="col">Window</th>
          <th scope="col">Owner</th>
          <th scope="col">Score</th>
          <th scope="col">Record</th>
          <th scope="col">Hardware</th>
          <th scope="col">Diff</th>
        </tr>
      </thead>
    `
    : `
      <thead>
        <tr>
          <th scope="col">Rank</th>
          <th scope="col">Owner</th>
          <th scope="col">Score</th>
          <th scope="col">Record</th>
          <th scope="col">Hardware</th>
          <th scope="col">Diff</th>
        </tr>
      </thead>
    `;
  const body = rows.map(score => {
    const windowRange = score.windowLabel || rangeLabel(score.scoredStartSeason, score.scoredEndSeason);
    return hasWindowColumn ? `
      <tr class="dynasty-row">
        <td class="dynasty-rank">#${score.rankInPeriod || score.rank || '—'}</td>
        <td>${escapeHtml(windowRange)}</td>
        <td><strong>${escapeHtml(score.owner)}</strong></td>
        <td>${fmtTrimmed(score.score)}</td>
        <td>${whole(score.wins)}-${whole(score.losses)}-${whole(score.ties)}</td>
        <td>${whole(score.championships)} D, ${whole(score.regularSeasonTitles)} RS</td>
        <td>${signed(score.pointDiff, 1)}</td>
      </tr>
    ` : `
      <tr class="dynasty-row">
        <td class="dynasty-rank">#${score.rankInPeriod}</td>
        <td><strong>${escapeHtml(score.owner)}</strong></td>
        <td>${fmtTrimmed(score.score)}</td>
        <td>${whole(score.wins)}-${whole(score.losses)}-${whole(score.ties)}</td>
        <td>${whole(score.championships)} D, ${whole(score.regularSeasonTitles)} RS</td>
        <td>${signed(score.pointDiff, 1)}</td>
      </tr>
    `;
  }).join('');
  return `
    <div class="table-wrap dynasty-period-leaderboard">
      ${rollingMode ? `<div class="dynasty-period-note">Top 10 ${escapeHtml(opts.windowSizeLabel || 'windows')} within the selected period.</div>` : ''}
      <table>
        ${header}
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

export {
  DYNASTY_WEIGHTS,
  buildDynastyViewModel,
  buildOwnerSeasonProfiles,
  calculateDynastyScore,
  calculateDynastyScoresForPeriod,
  computeRollingDynastyWindows,
  computeBestWindowsByOwner,
  computeSlumpWindows,
  rankDynastyScores,
  scoreOwnerSeason,
  buildDynastyTrendChartModel,
  dynastyCalculatorHeroHtml,
  dynastyScoreBreakdownHtml,
  dynastyPeriodLeaderboardHtml,
  dynastyBestWindowsHtml,
  dynastyWindowModalHtml,
  dynastyHeatmapHtml,
  dynastyTrendChartHtml,
  dynastySlumpsHtml,
  dynastyFormulaHtml,
  dynastyPeriodComparisonHtml,
  renderDynastyCalculatorHero,
  renderDynastyScoreBreakdown,
  renderDynastyPeriodLeaderboard,
  renderDynastyBestWindows,
  renderDynastyWindowModal,
  renderDynastyHeatmap,
  renderDynastyTrendChart,
  renderDynastySlumps,
  renderDynastyFormula,
  buildDynastyWindowKey,
  findDynastyWindowByKey,
  findDynastyWindowByKeyFromRows,
  renderDynastySlumpModal,
  seasonOutcomeNarrative,
};
