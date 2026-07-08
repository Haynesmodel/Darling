import * as core from './core-helpers.js';
import * as stats from './stats-helpers.js';
import { escapeHtml, nfmt } from './render-helpers.js';

function coreFn(name) {
  const fn = core[name] || stats[name];
  if (typeof fn !== 'function') {
    throw new Error(`curse-tracker.js requires core-helpers.js before it (${name})`);
  }
  return fn;
}

function docOrDefault(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function isFiniteNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(+value);
}

function asNumber(value) {
  return isFiniteNumber(value) ? +value : null;
}

function ownerSort(a, b) {
  return a.localeCompare(b);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => `${a}`.localeCompare(`${b}`));
}

function getWeekForGame(game, owner) {
  if (isFiniteNumber(game?.week)) return +game.week;
  const derived = game?._weekByTeam?.[owner];
  return isFiniteNumber(derived) ? +derived : null;
}

function makeSideRows(leagueGames) {
  const rows = [];
  for (const game of leagueGames || []) {
    const scoreA = asNumber(game.scoreA);
    const scoreB = asNumber(game.scoreB);
    if (scoreA === null || scoreB === null) continue;
    const season = asNumber(game.season);
    if (season === null) continue;
    const type = coreFn('normType')(game.type);
    const round = coreFn('normRound')(game.round);
    const date = String(game.date || '');
    const sideA = {
      season,
      week: getWeekForGame(game, game.teamA),
      date,
      owner: game.teamA,
      opponent: game.teamB,
      pointsFor: scoreA,
      pointsAgainst: scoreB,
      result: scoreA > scoreB ? 'W' : scoreA < scoreB ? 'L' : 'T',
      winValue: scoreA > scoreB ? 1 : scoreA < scoreB ? 0 : 0.5,
      type,
      round,
      game,
    };
    const sideB = {
      season,
      week: getWeekForGame(game, game.teamB),
      date,
      owner: game.teamB,
      opponent: game.teamA,
      pointsFor: scoreB,
      pointsAgainst: scoreA,
      result: scoreB > scoreA ? 'W' : scoreB < scoreA ? 'L' : 'T',
      winValue: scoreB > scoreA ? 1 : scoreB < scoreA ? 0 : 0.5,
      type,
      round,
      game,
    };
    rows.push(sideA, sideB);
  }
  return rows;
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const arr = map.get(key);
    if (arr) arr.push(row);
    else map.set(key, [row]);
  }
  return map;
}

function formatPct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatCount(value, digits = 1) {
  return nfmt(value, digits);
}

function exactBinomialTail(n, p, k, direction = 'upper') {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (!Number.isFinite(p)) return null;
  const target = Math.max(0, Math.min(n, Math.floor(k)));
  if (p <= 0) return direction === 'upper' ? (target <= 0 ? 1 : 0) : 1;
  if (p >= 1) return direction === 'upper' ? 1 : (target >= n ? 1 : 0);

  const q = 1 - p;
  let pmf = q ** n;
  let tail = direction === 'upper' ? (target <= 0 ? pmf : 0) : (target >= 0 ? pmf : 0);
  for (let i = 0; i < n; i++) {
    pmf = pmf * ((n - i) / (i + 1)) * (p / q);
    const successes = i + 1;
    if (direction === 'upper') {
      if (successes >= target) tail += pmf;
    } else if (successes <= target) {
      tail += pmf;
    }
  }
  return Math.min(1, Math.max(0, tail));
}

function poissonBinomialTail(probs, k, direction = 'upper') {
  const n = probs.length;
  if (!n) return null;
  const dp = new Array(n + 1).fill(0);
  dp[0] = 1;
  let seen = 0;
  for (const p of probs) {
    const nextSeen = seen + 1;
    for (let i = nextSeen; i >= 1; i--) {
      dp[i] = (dp[i] * (1 - p)) + (dp[i - 1] * p);
    }
    dp[0] *= (1 - p);
    seen = nextSeen;
  }
  const target = Math.max(0, Math.min(n, Math.floor(k)));
  let total = 0;
  if (direction === 'upper') {
    for (let i = target; i <= n; i++) total += dp[i];
  } else {
    for (let i = 0; i <= target; i++) total += dp[i];
  }
  return Math.min(1, Math.max(0, total));
}

function benjaminiHochberg(cards) {
  const statCards = cards.filter(card => Number.isFinite(card.pValue));
  if (statCards.length < 3) {
    for (const card of statCards) card.qValue = card.pValue;
    return cards;
  }
  const sorted = statCards.slice().sort((a, b) => a.pValue - b.pValue || a.id.localeCompare(b.id));
  let running = 1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const card = sorted[i];
    running = Math.min(running, (card.pValue * sorted.length) / (i + 1));
    card.qValue = Math.min(1, running);
  }
  return cards;
}

function completedSeasonsFromSummaries(seasonSummaries) {
  return uniqueSorted((seasonSummaries || []).map(row => +row.season).filter(Number.isFinite));
}

function seasonSummaryLookup(seasonSummaries, owner, season) {
  return (seasonSummaries || []).find(row => row.owner === owner && +row.season === +season) || null;
}

function seasonSummariesBySeason(seasonSummaries) {
  return groupBy(seasonSummaries || [], row => +row.season);
}

function seasonSummariesByOwner(seasonSummaries) {
  return groupBy(seasonSummaries || [], row => row.owner);
}

function titleWinnersBySeason(seasonSummaries) {
  const bySeason = seasonSummariesBySeason(seasonSummaries);
  const map = new Map();
  for (const [season, rows] of bySeason.entries()) {
    const maxWins = Math.max(...rows.map(row => +row.wins || 0));
    const winners = rows
      .filter(row => (+row.wins || 0) === maxWins)
      .slice()
      .sort((a, b) => {
        const pfDiff = (+b.points_for || 0) - (+a.points_for || 0);
        if (pfDiff) return pfDiff;
        return a.owner.localeCompare(b.owner);
      })
      .map(row => row.owner);
    map.set(+season, winners);
  }
  return map;
}

function playoffTeamCountForSeason(rows) {
  return rows.filter(row => (
    row.champion
    || row.bye
    || row.wild_card
    || (+row.playoff_wins || 0) > 0
    || (+row.playoff_losses || 0) > 0
  )).length;
}

function formatSeasonList(seasons) {
  if (!seasons.length) return '—';
  const sorted = [...new Set(seasons.map(season => +season).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!sorted.length) return '—';
  const ranges = [];
  let start = sorted[0];
  let end = start;
  for (let i = 1; i < sorted.length; i++) {
    const value = sorted[i];
    if (value === end + 1) {
      end = value;
      continue;
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    start = value;
    end = value;
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(', ');
}

function formatLastOccurrence(lastOccurrence) {
  if (!lastOccurrence) return '—';
  const bits = [`${lastOccurrence.season}`];
  if (isFiniteNumber(lastOccurrence.week)) bits.push(`Week ${lastOccurrence.week}`);
  if (lastOccurrence.date) bits.push(lastOccurrence.date);
  return bits.join(' ');
}

function formatPlayoffRound(round) {
  const label = String(round || '').trim();
  const lower = label.toLowerCase();
  if (lower.includes('champ')) return 'Championship';
  if (lower.includes('semi')) return 'Semifinal';
  if (lower.includes('quarter')) return 'Quarterfinal';
  if (lower.includes('wild')) return 'Wild Card';
  if (label) return label;
  return 'Playoff';
}

function formatWeekLabel(week) {
  if (!isFiniteNumber(week)) return null;
  return `Week ${week}`;
}

function statusDescription(status) {
  if (status === 'Broken') {
    return 'Broken means the latest eligible season stopped matching the pattern.';
  }
  if (status === 'Active') {
    return 'Active means there is evidence in one of the last two completed seasons.';
  }
  return 'Cold means the latest evidence is older than the last two completed seasons.';
}

function seasonStrengthScores(seasonRows) {
  const rows = (seasonRows || []).filter(row => Number.isFinite(+row.wins) || Number.isFinite(+row.losses) || Number.isFinite(+row.points_for) || Number.isFinite(+row.points_against));
  if (!rows.length) return new Map();
  const stats = rows.map(row => {
    const games = (+row.wins || 0) + (+row.losses || 0) + (+row.ties || 0);
    const winPct = games ? ((+row.wins || 0) + 0.5 * (+row.ties || 0)) / games : 0;
    const marginPerGame = games ? ((+row.points_for || 0) - (+row.points_against || 0)) / games : 0;
    return { owner: row.owner, winPct, marginPerGame };
  });
  const mean = key => stats.reduce((sum, row) => sum + row[key], 0) / stats.length;
  const stdev = key => {
    const avg = mean(key);
    const variance = stats.reduce((sum, row) => sum + ((row[key] - avg) ** 2), 0) / stats.length;
    return Math.sqrt(variance) || 1;
  };
  const meanWinPct = mean('winPct');
  const meanMarginPerGame = mean('marginPerGame');
  const sdWinPct = stdev('winPct');
  const sdMarginPerGame = stdev('marginPerGame');
  const scores = new Map();
  for (const row of stats) {
    const winZ = (row.winPct - meanWinPct) / sdWinPct;
    const marginZ = (row.marginPerGame - meanMarginPerGame) / sdMarginPerGame;
    scores.set(row.owner, (0.4 * winZ) + (0.2 * marginZ));
  }
  return scores;
}

function byeMatchupWinProbability(teamSummary, opponentSummary, seasonRows) {
  if (!teamSummary || !opponentSummary) return null;
  const strengths = seasonStrengthScores(seasonRows);
  const teamScore = strengths.get(teamSummary.owner);
  const oppScore = strengths.get(opponentSummary.owner);
  if (!Number.isFinite(teamScore) || !Number.isFinite(oppScore)) return null;
  return 1 / (1 + Math.exp(-((teamScore - oppScore) / 1.2)));
}

function summarizePlayoffOutcome(model, owner, season) {
  const isPlayoffGameFn = coreFn('isPlayoffGame');
  const isSaundersGameFn = coreFn('isSaundersGame');
  const roundOrderFn = coreFn('roundOrder');
  const rows = (model.sideRows || [])
    .filter(row => row.owner === owner && +row.season === +season && isPlayoffGameFn(row.game) && !isSaundersGameFn(row.game))
    .sort((a, b) => {
      const roundDiff = roundOrderFn(a.round) - roundOrderFn(b.round);
      if (roundDiff) return roundDiff;
      return String(a.date).localeCompare(String(b.date));
    });
  if (!rows.length) return 'No playoff games recorded';
  const final = rows.at(-1);
  const score = `${formatCount(final.pointsFor)}-${formatCount(final.pointsAgainst)}`;
  const opponent = final.opponent || 'an opponent';
  if (final.game?.champion || (final.result === 'W' && String(final.round || '').toLowerCase().includes('champ'))) {
    return `Championship win over ${opponent} (${score})`;
  }
  return `${formatPlayoffRound(final.round)} ${final.result === 'W' ? 'win' : 'loss'} to ${opponent} (${score})`;
}

function evidenceGameText(card, ev) {
  const parts = [];
  if (isFiniteNumber(ev.season)) parts.push(`${ev.season}`);
  if (isFiniteNumber(ev.week)) parts.push(formatWeekLabel(ev.week));
  if (ev.date) parts.push(ev.date);
  if (ev.owner && ev.opponent) {
    parts.push(`${ev.owner} vs ${ev.opponent}`);
  } else if (ev.owner) {
    parts.push(ev.owner);
  }
  if (card?.detector === 'season-high-loss') {
    if (ev.result) parts.push(ev.result);
    if (ev.note) parts.push(ev.note);
  } else if (card?.detector === 'bye-curse') {
    if (Number.isFinite(+ev.pointsFor) && Number.isFinite(+ev.pointsAgainst)) {
      parts.push(`${formatCount(ev.pointsFor)}-${formatCount(ev.pointsAgainst)}`);
    }
    if (ev.result) parts.push(ev.result);
    if (ev.round) parts.push(formatPlayoffRound(ev.round));
    if (ev.expected !== undefined) {
      parts.push(`Model win chance ${formatPct(ev.expected)}`);
    }
  } else if (card?.detector === 'regular-season-champion-curse') {
    if (ev.note) parts.push(ev.note);
    if (ev.expected !== undefined) {
      parts.push(`Win chance ${formatPct(ev.expected)}`);
    }
  } else if (card?.detector === 'chronically-unlucky') {
    if (ev.note) parts.push(ev.note);
    if (ev.observed !== undefined || ev.expected !== undefined) {
      const obs = ev.observed === undefined ? '—' : formatCount(ev.observed);
      const exp = ev.expected === undefined ? '—' : formatCount(ev.expected);
      parts.push(`Actual ${obs}, expected ${exp}`);
    }
  } else {
    if (Number.isFinite(+ev.pointsFor) && Number.isFinite(+ev.pointsAgainst)) {
      parts.push(`${formatCount(ev.pointsFor)}-${formatCount(ev.pointsAgainst)}`);
    }
    if (ev.result) parts.push(ev.result);
    if (ev.note) parts.push(ev.note);
    if (ev.expected !== undefined || ev.observed !== undefined) {
      const obs = ev.observed === undefined ? '—' : formatCount(ev.observed);
      const exp = ev.expected === undefined ? '—' : formatCount(ev.expected);
      parts.push(`Observed ${obs}, expected ${exp}`);
    }
  }
  return parts.join(' • ');
}

function renderEvidenceList(card) {
  if (!card.evidence || !card.evidence.length) return '';
  const heading = card.evidenceHeading || 'Evidence';
  return `
    <div class="curse-evidence">
      <div class="curse-evidence-heading">${escapeHtml(heading)}</div>
      <ul class="curse-evidence-list">
        ${card.evidence.map(ev => `<li>${escapeHtml(evidenceGameText(card, ev))}</li>`).join('')}
      </ul>
    </div>
  `;
}

function renderFlames(severity) {
  if (!severity) return '<span class="curse-rating-note">Not statistically rated</span>';
  return `<span class="curse-flames" aria-label="${severity} flame severity">${'🔥'.repeat(severity)}</span>`;
}

function computeStatusFromEvidence(card, completedSeasons) {
  if (card.broken) return 'Broken';
  const recent = new Set(completedSeasons.slice(-2));
  if (card.lastOccurrence && recent.has(+card.lastOccurrence.season)) return 'Active';
  const hasRecentEvidence = (card.evidence || []).some(ev => recent.has(+ev.season));
  return hasRecentEvidence ? 'Active' : 'Cold';
}

function highestScoreGameForSeason(rows) {
  if (!rows.length) return null;
  const maxScore = Math.max(...rows.map(row => row.pointsFor));
  const highGames = rows.filter(row => row.pointsFor === maxScore);
  return { maxScore, highGames };
}

function detectSeasonHighCurse(model) {
  const byOwnerSeason = model.regularRowsByOwnerSeason;
  const byOwner = model.regularRowsByOwner;
  const baselinePool = [];
  for (const [owner, rows] of byOwner.entries()) {
    const ownerRows = rows;
    for (const [season, seasonRows] of groupBy(ownerRows, row => row.season).entries()) {
      const seasonGames = seasonRows.filter(row => row.type === 'Regular');
      if (!seasonGames.length) continue;
      const { highGames } = highestScoreGameForSeason(seasonGames);
      const cursed = highGames.every(row => row.result === 'L');
      baselinePool.push({ owner, season, cursed });
    }
  }

  const baselineRows = baselinePool;
  const cards = [];
  const owners = [...byOwner.keys()].sort(ownerSort);
  for (const owner of owners) {
    const seasonRows = model.seasonSummariesByOwner.get(owner) || [];
    const eligibleSeasons = [];
    const evidence = [];
    let cursedCount = 0;
    let latestSeason = null;
    let broken = false;
    for (const summary of seasonRows.sort((a, b) => +a.season - +b.season)) {
      const rows = byOwnerSeason.get(`${owner}|${summary.season}`) || [];
      if (!rows.length) continue;
      const { maxScore, highGames } = highestScoreGameForSeason(rows);
      const cursed = highGames.every(row => row.result === 'L');
      eligibleSeasons.push(+summary.season);
      if (cursed) {
        cursedCount += 1;
        const firstHighGame = highGames[0] || null;
        evidence.push({
          season: +summary.season,
          week: firstHighGame?.week ?? null,
          date: firstHighGame?.date || null,
          owner,
          opponent: firstHighGame?.opponent || null,
          result: 'L',
          note: 'Highest regular-season score',
        });
      }
      latestSeason = {
        season: +summary.season,
        cursed,
      };
    }
    if (eligibleSeasons.length < 6 || cursedCount < 2) continue;
    const baselineRowsForOwner = baselineRows.filter(row => row.owner !== owner);
    const baselineRate = baselineRowsForOwner.length
      ? baselineRowsForOwner.filter(row => row.cursed).length / baselineRowsForOwner.length
      : null;
    if (!(baselineRate > 0)) continue;
    const observedRate = cursedCount / eligibleSeasons.length;
    if (observedRate < baselineRate * 2) continue;
    const expected = eligibleSeasons.length * baselineRate;
    const pValue = exactBinomialTail(eligibleSeasons.length, baselineRate, cursedCount, 'upper');
    const lastSeason = eligibleSeasons.at(-1);
    const lastEligibleCursed = latestSeason?.cursed === true;
    broken = latestSeason ? !lastEligibleCursed && cursedCount >= 2 : false;
    const card = {
      id: `season-high-loss:${owner}`,
      detector: 'season-high-loss',
      category: 'Scoring',
      title: 'The Season High Curse',
      owner,
      opponents: [],
      seasons: eligibleSeasons,
      summary: `${owner} got burned by their best regular-season score ${cursedCount} ${cursedCount === 1 ? 'time' : 'times'}.`,
      detail: `Observed ${cursedCount} of ${eligibleSeasons.length} seasons. Expected ${formatCount(expected)} from the league baseline. Broken means the latest eligible season stopped matching the pattern.`,
      observed: cursedCount,
      expected,
      sampleSize: eligibleSeasons.length,
      effectSize: observedRate / baselineRate,
      ratingMethod: 'statistical',
      pValue,
      qValue: null,
      severity: null,
      broken,
      evidenceHeading: 'Season examples',
      evidence: evidence.sort((a, b) => +a.season - +b.season || String(a.date).localeCompare(String(b.date))),
      lastOccurrence: evidence.length ? {
        season: evidence.at(-1).season,
        week: evidence.at(-1).week,
        date: evidence.at(-1).date,
      } : null,
    };
    cards.push(card);
  }
  return cards;
}

function detectSeasonOpenerCurse(model) {
  const cards = [];
  const owners = [...model.byOwner.keys()].sort(ownerSort);
  const leagueWeek1Rows = model.regularRows.filter(row => row.week === 1);
  const leagueWeek1DecisionRows = leagueWeek1Rows.filter(row => row.result !== 'T');
  const leagueWeek1LossRate = leagueWeek1DecisionRows.length
    ? leagueWeek1DecisionRows.filter(row => row.result === 'L').length / leagueWeek1DecisionRows.length
    : null;

  for (const owner of owners) {
    const rows = model.regularRowsByOwner.get(owner) || [];
    const seasonSummaries = model.seasonSummariesByOwner.get(owner) || [];
    const week1Rows = rows.filter(row => row.week === 1);
    const nonWeek1Rows = rows.filter(row => row.week !== 1);
    const eligibleWeek1Rows = week1Rows.filter(row => row.result !== 'T');
    if (week1Rows.length < 6 || eligibleWeek1Rows.length < 6) continue;

    const week1Losses = eligibleWeek1Rows.filter(row => row.result === 'L').length;
    const week1LossRate = week1Losses / eligibleWeek1Rows.length;
    const ownerNonWeek1DecisionRows = nonWeek1Rows.filter(row => row.result !== 'T');
    const ownerNonWeek1LossRate = ownerNonWeek1DecisionRows.length
      ? ownerNonWeek1DecisionRows.filter(row => row.result === 'L').length / ownerNonWeek1DecisionRows.length
      : null;
    const baselineLossRate = ownerNonWeek1LossRate ?? leagueWeek1LossRate;
    if (!(baselineLossRate > 0)) continue;
    const gap = week1LossRate - baselineLossRate;
    if (gap < 0.25) continue;
    const pValue = exactBinomialTail(eligibleWeek1Rows.length, baselineLossRate, week1Losses, 'upper');
    const expected = eligibleWeek1Rows.length * baselineLossRate;
    const evidence = eligibleWeek1Rows.map(row => ({
      ...row,
      note: 'Week 1',
    }));
    const lastOccurrenceRow = evidence.at(-1) || null;
    const broken = lastOccurrenceRow ? lastOccurrenceRow.result === 'W' && week1Losses >= 2 : false;
    cards.push({
      id: `season-opener:${owner}`,
      detector: 'season-opener',
      category: 'Scoring',
      title: 'The Season Opener Curse',
      owner,
      opponents: [],
      seasons: uniqueSorted(evidence.map(ev => ev.season)),
      summary: `${owner} is ${week1Rows.filter(row => row.result === 'W').length}-${week1Rows.filter(row => row.result === 'L').length}-${week1Rows.filter(row => row.result === 'T').length} in Week 1.`,
      detail: `Observed: ${week1Losses} Week 1 losses in ${eligibleWeek1Rows.length} games. Expected from the season or league baseline: ${formatCount(expected)}.`,
      observed: week1Losses,
      expected,
      sampleSize: eligibleWeek1Rows.length,
      effectSize: gap,
      ratingMethod: 'statistical',
      pValue,
      qValue: null,
      severity: null,
      broken,
      evidenceHeading: 'Week 1 samples',
      evidence,
      lastOccurrence: lastOccurrenceRow ? {
        season: lastOccurrenceRow.season,
        week: lastOccurrenceRow.week,
        date: lastOccurrenceRow.date,
      } : null,
    });
  }
  return cards;
}

function detectChronicallyUnlucky(model) {
  const byOwner = model.seasonAggregatesByOwner;
  const cards = [];
  for (const [owner, rows] of byOwner.entries()) {
    const regularSeasons = rows.filter(row => Number.isFinite(+row.season));
    if (regularSeasons.length < 6) continue;
    const totalAct = regularSeasons.reduce((sum, row) => sum + (+row.actWins || 0), 0);
    const totalExp = regularSeasons.reduce((sum, row) => sum + (+row.expWins || 0), 0);
    const deficit = totalExp - totalAct;
    if (deficit < 5) continue;
    const seasonSummaries = model.seasonSummariesByOwner.get(owner) || [];
    const neverWon = !seasonSummaries.some(row => row.champion);
    const neverTop3 = !seasonSummaries.some(row => Number.isFinite(+row.finish) && +row.finish <= 3);
    if (!neverWon && !neverTop3) continue;
    const worstSeasons = regularSeasons
      .map(row => ({
        season: +row.season,
        owner,
        observed: +row.actWins || 0,
        expected: +row.expWins || 0,
        note: `Luck ${((+row.actWins || 0) - (+row.expWins || 0)) >= 0 ? '+' : ''}${((+row.actWins || 0) - (+row.expWins || 0)).toFixed(2)}`,
      }))
      .sort((a, b) => (a.observed - a.expected) - (b.observed - b.expected) || b.season - a.season)
      .slice(0, 4);
    cards.push({
      id: `chronically-unlucky:${owner}`,
      detector: 'chronically-unlucky',
      category: 'Luck',
      title: 'The Chronically Unlucky',
      owner,
      opponents: [],
      seasons: regularSeasons.map(row => +row.season),
      summary: `${owner} has the most Expected Wins of any owner without a Darling title.`,
      detail: `Most career Expected Wins among title-less teams. Actual wins: ${formatCount(totalAct, 1)}. Expected wins: ${formatCount(totalExp, 1)}. Deficit: ${formatCount(deficit, 1)}. ${neverWon ? 'Never won the Darling.' : 'Never finished top 3.'} Evidence shows the worst luck seasons only.`,
      observed: totalAct,
      expected: totalExp,
      sampleSize: regularSeasons.length,
      effectSize: deficit,
      ratingMethod: 'effect-size',
      pValue: null,
      qValue: null,
      severity: null,
      broken: false,
      evidenceHeading: 'Worst seasons',
      evidence: worstSeasons,
      lastOccurrence: regularSeasons.length ? {
        season: +regularSeasons[regularSeasons.length - 1].season,
        week: null,
        date: null,
      } : null,
    });
  }
  cards.sort((a, b) => (b.observed || 0) - (a.observed || 0) || b.effectSize - a.effectSize || a.owner.localeCompare(b.owner));
  return cards.slice(0, 1);
}

function detectRegularSeasonChampionCurse(model) {
  const bySeason = model.seasonSummariesBySeason;
  const titleWinners = titleWinnersBySeason(model.seasonSummaries);
  const probs = [];
  const evidence = [];
  const seasons = [];
  let observed = 0;
  for (const [season, rows] of bySeason.entries()) {
    const completedRows = rows.filter(row => Number.isFinite(+row.season));
    if (!completedRows.length) continue;
    const playoffTeams = playoffTeamCountForSeason(completedRows);
    if (playoffTeams < 2) continue;
    const winners = titleWinners.get(+season) || [];
    if (!winners.length) continue;
    const winnerRows = completedRows.filter(row => winners.includes(row.owner));
    const champWin = winnerRows.some(row => row.champion);
    const p = Math.min(1, winners.length / playoffTeams);
    probs.push(p);
    seasons.push(+season);
    if (champWin) observed += 1;
    const displayWinner = winners[0];
    const outcome = summarizePlayoffOutcome(model, displayWinner, +season);
    evidence.push({
      season: +season,
      owner: displayWinner,
      note: `#1 Seed: ${outcome}`,
      observed: champWin ? 1 : 0,
      expected: p,
    });
  }
  if (seasons.length < 6) return [];
  const expected = probs.reduce((sum, p) => sum + p, 0);
  const observedRate = observed / seasons.length;
  const expectedRate = expected / seasons.length;
  const gap = expectedRate - observedRate;
  if (gap < 0.10 || observed > expected) return [];
  const pValue = poissonBinomialTail(probs, observed, 'lower');
  const latestSeason = seasons.at(-1);
  const latestEvidence = evidence.at(-1) || null;
  const broken = latestEvidence ? latestEvidence.observed === 1 : false;
  return [{
    id: 'regular-season-champion-curse:league',
    detector: 'regular-season-champion-curse',
    category: 'Postseason',
    title: 'The #1 Seed Curse',
    owner: 'League',
    opponents: [],
    seasons,
    summary: `The #1 Seed has won ${observed} ${observed === 1 ? 'time' : 'times'} in ${seasons.length} seasons.`,
    detail: `Observed ${observed} ${observed === 1 ? 'championship' : 'championships'} by the season's title holders. Expected ${formatCount(expected, 1)} based on each season's playoff-field win chance. Ties for #1 Seed use points scored as the tiebreak.`,
    observed,
    expected,
    sampleSize: seasons.length,
    effectSize: gap,
    ratingMethod: 'statistical',
    pValue,
    qValue: null,
    severity: null,
    broken,
    evidenceHeading: 'Playoff outcomes',
    evidence,
    lastOccurrence: latestSeason ? { season: latestSeason, week: null, date: null } : null,
  }];
}

function detectByeCurse(model) {
  const cards = [];
  const byeRows = [];
  const isPlayoffGameFn = coreFn('isPlayoffGame');
  const isSaundersGameFn = coreFn('isSaundersGame');
  for (const row of model.sideRows) {
    if (!isPlayoffGameFn(row.game) || isSaundersGameFn(row.game)) continue;
    if (!String(row.round || '').toLowerCase().includes('semi')) continue;
    const summary = seasonSummaryLookup(model.seasonSummaries, row.owner, row.season);
    if (!summary) continue;
    if (summary.bye) byeRows.push({ row, summary });
  }
  if (byeRows.length < 5) return [];
  const evidence = [];
  const probs = [];
  for (const { row, summary } of byeRows) {
    const seasonRows = model.seasonSummariesBySeason.get(+row.season) || [];
    const opponentSummary = seasonSummaryLookup(model.seasonSummaries, row.opponent, row.season);
    const winProbability = byeMatchupWinProbability(summary, opponentSummary, seasonRows);
    if (!Number.isFinite(winProbability)) continue;
    probs.push(winProbability);
    evidence.push({
      ...row,
      round: row.round,
      expected: winProbability,
    });
  }
  if (evidence.length < 5) return [];
  const observedWins = evidence.filter(({ result }) => result === 'W').length;
  const observedRate = observedWins / evidence.length;
  const expected = probs.reduce((sum, p) => sum + p, 0);
  const expectedRate = expected / evidence.length;
  const gap = expectedRate - observedRate;
  if (gap < 0.15) return [];
  const pValue = poissonBinomialTail(probs, observedWins, 'lower');
  const latest = evidence.at(-1) || null;
  const broken = latest ? latest.result === 'W' && observedWins >= 1 : false;
  cards.push({
    id: 'bye-curse:league',
    detector: 'bye-curse',
    category: 'Postseason',
    title: 'The Bye Curse',
    owner: 'League',
    opponents: [],
    seasons: uniqueSorted(evidence.map(({ season }) => season)),
    summary: `Teams with a first-round bye are ${observedWins}-${byeRows.length - observedWins} in the Semi Final.`,
    detail: `Each semifinal game's win chance comes from the two teams' regular-season record and scoring margin. Observed ${observedWins} wins in ${evidence.length} semifinal games.`,
    observed: observedWins,
    expected,
    sampleSize: evidence.length,
    effectSize: gap,
    ratingMethod: 'statistical',
    pValue,
    qValue: null,
    severity: null,
    broken,
    evidenceHeading: 'Semifinal sample',
    evidence,
    lastOccurrence: latest ? {
      season: latest.season,
      week: latest.week,
      date: latest.date,
    } : null,
  });
  return cards;
}

function buildCurseTrackerModel(leagueGames, seasonSummaries) {
  const sideRows = makeSideRows(leagueGames);
  const regularRows = sideRows.filter(row => row.type === 'Regular');
  const byOwner = groupBy(sideRows, row => row.owner);
  const regularRowsByOwner = groupBy(regularRows, row => row.owner);
  const regularRowsByOwnerSeason = groupBy(regularRows, row => `${row.owner}|${row.season}`);
  const seasonSummariesByOwnerMap = seasonSummariesByOwner(seasonSummaries);
  const seasonSummariesBySeasonMap = seasonSummariesBySeason(seasonSummaries);
  const seasonAggregates = coreFn('computeSeasonAggregatesAllTeams')(leagueGames, seasonSummaries)
    .filter(row => Number.isFinite(+row.season));
  const seasonAggregatesByOwner = groupBy(seasonAggregates, row => row.team);
  const completedSeasons = completedSeasonsFromSummaries(seasonSummaries);
  const cards = [
    ...detectSeasonHighCurse({
      sideRows,
      regularRows,
      byOwner,
      regularRowsByOwner,
      regularRowsByOwnerSeason,
      seasonSummaries,
      seasonSummariesByOwner: seasonSummariesByOwnerMap,
      seasonSummariesBySeason: seasonSummariesBySeasonMap,
    }),
    ...detectSeasonOpenerCurse({
      sideRows,
      regularRows,
      byOwner,
      regularRowsByOwner,
      regularRowsByOwnerSeason,
      seasonSummaries,
      seasonSummariesByOwner: seasonSummariesByOwnerMap,
      seasonSummariesBySeason: seasonSummariesBySeasonMap,
    }),
    ...detectChronicallyUnlucky({
      sideRows,
      regularRows,
      byOwner,
      regularRowsByOwner,
      regularRowsByOwnerSeason,
      seasonSummaries,
      seasonSummariesByOwner: seasonSummariesByOwnerMap,
      seasonSummariesBySeason: seasonSummariesBySeasonMap,
      seasonAggregatesByOwner,
    }),
    ...detectRegularSeasonChampionCurse({
      sideRows,
      regularRows,
      byOwner,
      regularRowsByOwner,
      regularRowsByOwnerSeason,
      seasonSummaries,
      seasonSummariesByOwner: seasonSummariesByOwnerMap,
      seasonSummariesBySeason: seasonSummariesBySeasonMap,
    }),
    ...detectByeCurse({
      sideRows,
      regularRows,
      byOwner,
      regularRowsByOwner,
      regularRowsByOwnerSeason,
      seasonSummaries,
      seasonSummariesByOwner: seasonSummariesByOwnerMap,
      seasonSummariesBySeason: seasonSummariesBySeasonMap,
    }),
  ];
  benjaminiHochberg(cards);
  for (const card of cards) {
    if (card.ratingMethod !== 'statistical') {
      card.qValue = null;
      card.severity = null;
      continue;
    }
    const effectOk = card.detector === 'season-high-loss'
      ? card.effectSize >= 2
      : card.detector === 'season-opener'
        ? card.effectSize >= 0.25
        : card.detector === 'regular-season-champion-curse'
          ? card.effectSize >= 0.10
          : card.detector === 'bye-curse'
            ? card.effectSize >= 0.20
            : false;
    if (!effectOk || !Number.isFinite(card.qValue)) {
      card.severity = null;
      continue;
    }
    if (card.qValue < 0.01) card.severity = 3;
    else if (card.qValue < 0.05) card.severity = 2;
    else if (card.qValue < 0.15) card.severity = 1;
    else card.severity = null;
  }
  for (const card of cards) {
    card.status = computeStatusFromEvidence(card, completedSeasons);
  }
  return {
    sideRows,
    regularRows,
    byOwner,
    regularRowsByOwner,
    regularRowsByOwnerSeason,
    seasonSummariesByOwner: seasonSummariesByOwnerMap,
    seasonSummariesBySeason: seasonSummariesBySeasonMap,
    seasonAggregatesByOwner,
    cards,
    completedSeasons,
    owners: uniqueSorted((seasonSummaries || []).map(row => row.owner)),
  };
}

function buildCurseTrackerControls({
  doc,
  seasonSummaries,
  selectedTeam,
  allTeams,
  onChange,
}) {
  const root = docOrDefault(doc);
  if (!root) return null;
  const container = root.getElementById('curseControls');
  if (!container) return null;
  const owners = uniqueSorted((seasonSummaries || []).map(row => row.owner));
  if (!container.dataset.ready) {
    container.innerHTML = `
      <label>Owner
        <select id="curseOwnerSelect"></select>
      </label>
      <label>Category
        <select id="curseCategorySelect">
          <option value="all">All categories</option>
          <option value="Scoring">Scoring</option>
          <option value="Matchup">Matchup</option>
          <option value="Postseason">Postseason</option>
          <option value="Luck">Luck</option>
        </select>
      </label>
      <label>Status
        <select id="curseStatusSelect">
          <option value="all">All statuses</option>
          <option value="Active">Active</option>
          <option value="Cold">Cold</option>
          <option value="Broken">Broken</option>
        </select>
      </label>
      <label>Severity
        <select id="curseSeveritySelect">
          <option value="all">All flames</option>
          <option value="1">1+</option>
          <option value="2">2+</option>
          <option value="3">3+</option>
        </select>
      </label>
    `;
    if (typeof window !== 'undefined' && window.__DARLING_DEBUG__) {
      const debugToggle = root.createElement('label');
      debugToggle.className = 'checkbox-label curse-debug-toggle';
      debugToggle.innerHTML = '<input id="curseDevToggle" type="checkbox" /> <span>Show development candidates</span>';
      container.appendChild(debugToggle);
    }
    if (!container.dataset.bound) {
      container.addEventListener('change', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target?.matches('select,input[type="checkbox"]')) return;
        if (typeof onChange === 'function') onChange();
      });
      container.dataset.bound = '1';
    }
    container.dataset.ready = '1';
  }

  const ownerSelect = root.getElementById('curseOwnerSelect');
  const categorySelect = root.getElementById('curseCategorySelect');
  const statusSelect = root.getElementById('curseStatusSelect');
  const severitySelect = root.getElementById('curseSeveritySelect');
  if (ownerSelect) {
    const previousOwner = ownerSelect.value;
    const ownerOptions = [
      `<option value="__ALL__">All owners</option>`,
      ...owners.map(owner => `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`),
    ];
    ownerSelect.innerHTML = ownerOptions.join('');
    if (selectedTeam && selectedTeam !== allTeams) {
      ownerSelect.value = selectedTeam;
      ownerSelect.disabled = true;
    } else {
      ownerSelect.disabled = false;
      ownerSelect.value = owners.includes(previousOwner) ? previousOwner : '__ALL__';
    }
  }
  if (categorySelect && !categorySelect.value) categorySelect.value = 'all';
  if (statusSelect && !statusSelect.value) statusSelect.value = 'all';
  if (severitySelect && !severitySelect.value) severitySelect.value = 'all';
  return container;
}

function readCurseTrackerFilters({
  doc,
  selectedTeam,
  allTeams,
}) {
  const root = docOrDefault(doc);
  if (!root) {
    return {
      owner: selectedTeam && selectedTeam !== allTeams ? selectedTeam : '__ALL__',
      category: 'all',
      status: 'all',
      severity: 'all',
      showDevelopmentCandidates: false,
    };
  }
  const ownerSelect = root.getElementById('curseOwnerSelect');
  const categorySelect = root.getElementById('curseCategorySelect');
  const statusSelect = root.getElementById('curseStatusSelect');
  const severitySelect = root.getElementById('curseSeveritySelect');
  const owner = selectedTeam && selectedTeam !== allTeams
    ? selectedTeam
    : (ownerSelect?.value || '__ALL__');
  const devToggle = root.getElementById('curseDevToggle');
  return {
    owner,
    category: categorySelect?.value || 'all',
    status: statusSelect?.value || 'all',
    severity: severitySelect?.value || 'all',
    showDevelopmentCandidates: !!devToggle?.checked,
  };
}

function cardMatchesFilters(card, filters, selectedTeam, allTeams) {
  if (selectedTeam && selectedTeam !== allTeams) {
    if (card.owner !== selectedTeam) return false;
  } else if (filters.owner !== '__ALL__') {
    if (card.owner !== filters.owner) return false;
  }

  if (filters.category !== 'all' && card.category !== filters.category) return false;
  if (filters.status !== 'all' && card.status !== filters.status) return false;
  if (filters.severity !== 'all') {
    const minSeverity = +filters.severity;
    if (card.ratingMethod === 'statistical') {
      if (!Number.isFinite(card.severity) || card.severity < minSeverity) return false;
    }
  } else if (!filters.showDevelopmentCandidates && card.ratingMethod === 'statistical' && (!Number.isFinite(card.severity) || card.severity < 1)) {
    return false;
  }
  return true;
}

function curseCardSort(a, b) {
  const severityA = Number.isFinite(a.severity) ? a.severity : 0;
  const severityB = Number.isFinite(b.severity) ? b.severity : 0;
  const qDiff = Number.isFinite(a.qValue) && Number.isFinite(b.qValue) ? (a.qValue - b.qValue) : 0;
  return severityB - severityA
    || qDiff
    || a.category.localeCompare(b.category)
    || a.title.localeCompare(b.title)
    || a.id.localeCompare(b.id);
}

function renderCurseCard(card) {
  const flames = renderFlames(card.severity);
  const ownerLabel = card.owner && card.owner !== 'League' ? ` • ${escapeHtml(card.owner)}` : '';
  const severityLabel = card.ratingMethod === 'effect-size'
    ? 'Narrative'
    : `Severity: ${card.severity || 0} flame${card.severity === 1 ? '' : 's'}`;
  const adjusted = Number.isFinite(card.qValue) ? formatPct(card.qValue) : 'n/a';
  const pValue = Number.isFinite(card.pValue) ? formatPct(card.pValue) : 'n/a';
  const lastOccurrence = formatLastOccurrence(card.lastOccurrence);
  const status = card.status || 'Cold';
  const bodyStats = card.detector === 'bye-curse'
    ? [
        `Observed: ${formatCount(card.observed, 1)} wins`,
        `Model expected: ${formatCount(card.expected, 1)} wins`,
        `Adjusted chance of ${formatCount(card.observed, 1)} or fewer wins: ${adjusted} (raw ${pValue})`,
      ]
    : [
        `Observed: ${formatCount(card.observed, 1)}${Number.isFinite(card.sampleSize) ? ` of ${card.sampleSize}` : ''}`,
        `Expected: ${formatCount(card.expected, 1)}`,
        card.ratingMethod === 'effect-size'
          ? 'Not statistically rated'
          : `Adjusted probability: ${adjusted} (raw ${pValue})`,
      ];
  return `
    <details class="curse-card ${card.ratingMethod === 'effect-size' ? 'curse-card-effect' : ''} curse-severity-${card.severity || 0}" data-curse-id="${escapeHtml(card.id)}">
      <summary>
        <div class="curse-card-summary-head">
          <div class="curse-card-heading">
            <div class="curse-card-category">${escapeHtml(card.category)}${ownerLabel}</div>
            <div class="curse-card-title">${escapeHtml(card.title)}</div>
          </div>
          <div class="curse-card-badge">${escapeHtml(severityLabel)} ${flames}</div>
        </div>
        <div class="curse-card-summary-text">${escapeHtml(card.summary)}</div>
        <div class="curse-card-meta">
          <span>Last occurrence: ${escapeHtml(lastOccurrence)}</span>
          <span>Status: ${escapeHtml(status)}</span>
        </div>
      </summary>
      <div class="curse-card-body">
        <p class="curse-card-detail">${escapeHtml(card.detail)}</p>
        <div class="curse-card-stats">
          ${bodyStats.map(line => `<span>${escapeHtml(line)}</span>`).join('')}
        </div>
        <div class="curse-card-status-note">${escapeHtml(statusDescription(status))}</div>
        ${card.seasons.length ? `<div class="curse-card-seasons">Seasons: ${escapeHtml(formatSeasonList(card.seasons))}</div>` : ''}
        ${renderEvidenceList(card)}
      </div>
    </details>
  `;
}

function buildCurseTrackerSummary(cards, visibleCards, completedSeasons, filters) {
  if (!visibleCards.length) return 'No curses match the current filters.';
  const activeCount = visibleCards.filter(card => card.status === 'Active').length;
  const ownerCounts = new Map();
  for (const card of visibleCards) {
    if (!card.owner || card.owner === 'League') continue;
    ownerCounts.set(card.owner, (ownerCounts.get(card.owner) || 0) + 1);
  }
  const owners = [...ownerCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const mostCursed = owners[0] || ['—', 0];
  const allOwners = filters.allOwners || [];
  let mostBlessed = ['—', 0];
  if (allOwners.length) {
    const counts = allOwners.map(owner => [owner, ownerCounts.get(owner) || 0]);
    counts.sort((a, b) => a[1] - b[1] || b[0].localeCompare(a[0]));
    mostBlessed = counts[0] || mostBlessed;
  }
  const scopeText = filters.owner && filters.owner !== '__ALL__' ? ` for ${filters.owner}` : '';
  return `${visibleCards.length} curses shown, ${activeCount} active, across ${completedSeasons.length} completed seasons${scopeText}. Most cursed: ${mostCursed[0]} (${mostCursed[1]}). Most blessed: ${mostBlessed[0]} (${mostBlessed[1]}).`;
}

function buildCurseTrackerView(leagueGames, seasonSummaries, selectedTeam, allTeams, doc) {
  const model = buildCurseTrackerModel(leagueGames, seasonSummaries);
  const filters = readCurseTrackerFilters({ doc, selectedTeam, allTeams });
  const visibleCards = model.cards
    .filter(card => card.ratingMethod === 'effect-size'
      || (Number.isFinite(card.severity) && card.severity >= 1)
      || (filters.showDevelopmentCandidates && card.ratingMethod === 'statistical'))
    .filter(card => cardMatchesFilters(card, filters, selectedTeam, allTeams))
    .sort(curseCardSort);
  const summary = buildCurseTrackerSummary(model.cards, visibleCards, model.completedSeasons, {
    ...filters,
    allOwners: model.owners,
  });
  return {
    model,
    filters,
    visibleCards,
    summary,
  };
}

function renderCurseTracker({
  doc,
  leagueGames,
  seasonSummaries,
  selectedTeam,
  allTeams,
  onChange,
}) {
  const root = docOrDefault(doc);
  if (!root) return null;
  buildCurseTrackerControls({
    doc: root,
    seasonSummaries,
    selectedTeam,
    allTeams,
    onChange,
  });
  const summaryEl = root.getElementById('curseSummary');
  const grid = root.getElementById('curseGrid');
  if (!summaryEl || !grid) return null;
  const view = buildCurseTrackerView(leagueGames, seasonSummaries, selectedTeam, allTeams, root);
  summaryEl.textContent = view.summary;
  if (!view.visibleCards.length) {
    grid.innerHTML = '<div class="curse-empty muted">No curses match the current filters.</div>';
    return view;
  }
  grid.innerHTML = view.visibleCards.map(renderCurseCard).join('');
  return view;
}

export {
  buildCurseTrackerModel,
  buildCurseTrackerControls,
  buildCurseTrackerSummary,
  buildCurseTrackerView,
  cardMatchesFilters,
  readCurseTrackerFilters,
  renderCurseTracker,
};
