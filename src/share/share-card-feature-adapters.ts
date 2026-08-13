import { buildShareCard, type ShareStoryFacts } from './share-card-builders';
import { formatDynastyScore } from '../data/dynasty-formatters.ts';
import {
  absoluteShareHref,
  mountCopyLinkAction,
  mountShareCardAction,
  type ShareCardActionController,
} from './share-card-actions';
import type { ShareCardBuildResult, ShareCardKind } from './share-card-types';

type StoryInput = Omit<ShareStoryFacts, 'canonicalHref'> & { canonicalPath: string };
type PulseMatchupCardInput = {
  ownerA: string;
  ownerB: string;
  scoreA: number;
  scoreB: number;
  type: string;
  round: string;
  result: string;
  currentHref: string;
};
type LeagueEditionCardInput = {
  id: string;
  kind: 'weekly' | 'season';
  season: number;
  week: number | null;
  state: 'complete' | 'pending' | 'partial';
  headline: string;
  highlights: Array<{ label: string; value: string; detail: string }>;
  sourceHref: string;
  sourceLabel: string;
  dataVersion: string;
};
type RivalryShareFacts = {
  teamA: string;
  teamB: string;
  scope: string;
  summary: {
    overall: { g: number; w: number; l: number; pf: number; pa: number; recordText: string };
    lastMeeting: { date: string; winner: string; pf: number; pa: number } | null;
  };
};
type TrophyShareFacts = {
  owner: string;
  hardwareShelf: ReadonlyArray<{ label: string; count: number }>;
  hero: { title: string; identityLabel: string; rankContext: string; record: string };
  identity: { label: string };
};

function championshipScores(
  highlights: LeagueEditionCardInput['highlights'],
): Map<string, string> {
  const champion = highlights.find(metric => metric.label === 'Champion');
  const runnerUp = highlights.find(metric => metric.label === 'Runner-up');
  if (!champion || !runnerUp || champion.detail !== runnerUp.detail) return new Map();
  for (const [leftOwner, rightOwner] of [
    [champion.value, runnerUp.value],
    [runnerUp.value, champion.value],
  ]) {
    const prefix = `${leftOwner} `;
    const suffix = ` ${rightOwner}`;
    if (!champion.detail.startsWith(prefix) || !champion.detail.endsWith(suffix)) continue;
    const scoreline = champion.detail.slice(prefix.length, -suffix.length);
    const scores = scoreline.match(/^(-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)$/);
    if (scores) return new Map([[leftOwner, scores[1]], [rightOwner, scores[2]]]);
  }
  return new Map();
}

function result(kind: ShareCardKind, input: StoryInput, win: Window): ShareCardBuildResult {
  const facts = { ...input, canonicalHref: absoluteShareHref(input.canonicalPath, win) };
  return buildShareCard(kind, facts, {
    origin: win.location.origin,
    basePath: import.meta.env.BASE_URL,
  });
}

export function buildPulseMatchupCardResult(
  matchup: PulseMatchupCardInput,
  season: number,
  week: number,
  dataVersion: string,
  win: Window,
): ShareCardBuildResult {
  const winner = matchup.scoreA === matchup.scoreB
    ? 'Tie'
    : matchup.scoreA > matchup.scoreB ? matchup.ownerA : matchup.ownerB;
  return result('matchup', {
    id: `${season}-week-${week}-${matchup.ownerA}-${matchup.ownerB}`,
    eyebrow: `${season} · Week ${week} · ${matchup.round || matchup.type}`,
    title: `${matchup.ownerA} vs ${matchup.ownerB}`,
    subtitle: matchup.result,
    metrics: [
      { label: matchup.ownerA, value: matchup.scoreA.toFixed(2) },
      { label: matchup.ownerB, value: matchup.scoreB.toFixed(2) },
      {
        label: 'Winner',
        value: winner,
        detail: `${Math.abs(matchup.scoreA - matchup.scoreB).toFixed(2)}-point margin`,
      },
    ],
    canonicalPath: matchup.currentHref,
    sourceLabel: 'Current Season',
    dataVersion,
    altText: `${season} Week ${week}: ${matchup.ownerA} ${matchup.scoreA.toFixed(2)}, ${matchup.ownerB} ${matchup.scoreB.toFixed(2)}. ${matchup.result}.`,
  }, win);
}

export function buildLeagueEditionCardResult(
  edition: LeagueEditionCardInput,
  win: Window,
): ShareCardBuildResult | null {
  if (edition.state !== 'complete') return null;
  const finalScores = championshipScores(edition.highlights);
  const metrics: ShareStoryFacts['metrics'] = edition.highlights.slice(0, 4).map(metric => {
    if (metric.label === 'Closest matchup') {
      const margin = metric.detail.match(/^([\d.]+)-point margin$/)?.[1];
      return margin
        ? { label: metric.label, value: `${margin} points`, detail: metric.value }
        : metric;
    }
    if (metric.label === 'Champion' || metric.label === 'Runner-up') {
      const score = finalScores.get(metric.value);
      return score
        ? { ...metric, detail: `${score} points` }
        : { label: metric.label, value: metric.value };
    }
    return metric;
  });
  return result(edition.kind === 'weekly' ? 'weekly-recap' : 'season-recap', {
    id: edition.id,
    eyebrow: 'The League Newspaper',
    title: edition.kind === 'weekly'
      ? `${edition.season} Week ${edition.week} Recap`
      : `${edition.season} Season Recap`,
    subtitle: edition.headline,
    metrics,
    canonicalPath: edition.sourceHref,
    sourceLabel: edition.sourceLabel,
    dataVersion: edition.dataVersion,
    altText: `${edition.headline}. ${metrics.map(item => (
      `${item.label}: ${item.value}${item.detail ? `, ${item.detail}` : ''}`
    )).join('. ')}.`,
  }, win);
}

export function mountCurrentMatchupCards(
  root: HTMLElement | null,
  view: any,
  canonicalPath: string,
  dataVersion: string,
  win: Window,
): ShareCardActionController[] {
  if (!root) return [];
  const canonicalHref = absoluteShareHref(canonicalPath, win);
  return [...root.querySelectorAll<HTMLElement>('[data-share-team-a][data-share-team-b]')].flatMap(host => {
    const teamA = host.getAttribute('data-share-team-a');
    const teamB = host.getAttribute('data-share-team-b');
    const row = view.matchups.find((candidate: any) => (
      candidate.teamA === teamA && candidate.teamB === teamB
    ));
    if (!row) return [];
    const scoreA = Number(row.scoreA);
    const scoreB = Number(row.scoreB);
    if (!row.completed || !Number.isFinite(scoreA) || !Number.isFinite(scoreB)) {
      return [mountCopyLinkAction(host, canonicalHref)];
    }
    const winner = scoreA === scoreB ? 'Tie' : scoreA > scoreB ? row.teamA : row.teamB;
    return [mountShareCardAction({
      host,
      label: `Share ${row.teamA} vs ${row.teamB} card`,
      result: result('matchup', {
        id: `${view.season}-week-${view.week}-${row.teamA}-${row.teamB}`,
        eyebrow: `${view.season} · Week ${view.week}${row.round || row.type ? ` · ${row.round || row.type}` : ''}`,
        title: `${row.teamA} vs ${row.teamB}`,
        subtitle: `${winner === 'Tie' ? 'Final tie' : `${winner} wins`} · ${row.date}`,
        metrics: [
          { label: row.teamA, value: scoreA.toFixed(2) },
          { label: row.teamB, value: scoreB.toFixed(2) },
          { label: 'Winner', value: winner, detail: `${Math.abs(scoreA - scoreB).toFixed(2)}-point margin` },
        ],
        canonicalPath,
        sourceLabel: 'Current Season',
        dataVersion,
        altText: `${view.season} Week ${view.week}: ${row.teamA} ${scoreA.toFixed(2)}, ${row.teamB} ${scoreB.toFixed(2)}; ${winner === 'Tie' ? 'tie' : `${winner} won`}.`,
      }, win),
    })];
  });
}

export function mountRivalryCard(host: HTMLElement | null, view: RivalryShareFacts, canonicalPath: string, dataVersion: string, win: Window) {
  if (!host) return null;
  const overall = view.summary.overall;
  if (!overall.g) return null;
  const leader = overall.w === overall.l ? 'Series tied' : overall.w > overall.l ? `${view.teamA} leads` : `${view.teamB} leads`;
  const last = view.summary.lastMeeting;
  return mountShareCardAction({
    host,
    label: 'Share rivalry card',
    result: result('rivalry', {
      id: `${view.teamA}-${view.teamB}-${view.scope}`,
      eyebrow: `${view.scope === 'allTime' ? 'All-time' : view.scope === 'currentSeason' ? 'Current season' : 'Historic'} rivalry`,
      title: `${view.teamA} vs ${view.teamB}`,
      subtitle: `${leader} · ${overall.recordText}`,
      metrics: [
        { label: 'Meetings', value: String(overall.g) },
        { label: view.teamA, value: `${overall.w} wins`, detail: `${Number(overall.pf).toFixed(2)} points` },
        { label: view.teamB, value: `${overall.l} wins`, detail: `${Number(overall.pa).toFixed(2)} points` },
        {
          label: last ? `Last · ${last.date}` : 'Last meeting',
          value: last ? (last.winner === 'Tie' ? 'Tie' : last.winner) : '—',
          detail: last ? `${Number(last.pf).toFixed(2)}–${Number(last.pa).toFixed(2)}` : undefined,
        },
      ],
      canonicalPath,
      sourceLabel: 'Head to Head',
      dataVersion,
      altText: `${view.teamA} vs ${view.teamB}: ${leader}, ${overall.recordText} in ${overall.g} meetings.`,
    }, win),
  });
}

export function mountTrophyCard(host: HTMLElement | null, view: TrophyShareFacts, canonicalPath: string, dataVersion: string, win: Window) {
  if (!host || !view.owner) return null;
  const hardware = new Map(view.hardwareShelf.map(item => [item.label, item.count]));
  const rank = view.hero.rankContext.split('|')[0].trim();
  const careerRecord = view.hero.record || '—';
  const recordParts = careerRecord.match(/^(\d+-\d+(?:-\d+)?)\s+\(([\d.]+%)\)$/);
  return mountShareCardAction({
    host,
    label: `Share ${view.owner} trophy card`,
    result: result('trophy', {
      id: view.owner,
      eyebrow: 'Trophy Case',
      title: view.hero.title || view.owner,
      subtitle: view.hero.identityLabel || view.identity.label || 'Career profile',
      metrics: [
        {
          label: 'Career record',
          value: recordParts?.[1] || careerRecord,
          detail: recordParts ? `${recordParts[2]} wins` : undefined,
        },
        { label: 'League rank', value: rank || '—' },
        { label: 'Darlings', value: String(hardware.get('Darlings') || 0) },
        { label: 'Saunders titles', value: String(hardware.get('Saunders titles') || 0) },
      ],
      canonicalPath,
      sourceLabel: 'Trophy Case',
      dataVersion,
      altText: `${view.owner} Trophy Case: ${view.hero.record || 'no record'}. ${rank}`.trim(),
    }, win),
  });
}

export function buildDynastyCardResult(
  score: any,
  canonicalPath: string,
  dataVersion: string,
  win: Window,
  expectedOwner?: string | null,
): ShareCardBuildResult | null {
  if (!score || (expectedOwner && score.owner !== expectedOwner)) return null;
  const requestedSeasonCount = Number(score.requestedSeasonCount);
  const scoredSeasonCount = Number(score.scoredSeasonCount);
  const requestedStartSeason = Number(score.requestedStartSeason);
  const requestedEndSeason = Number(score.requestedEndSeason);
  const scoredStartSeason = Number(score.scoredStartSeason);
  const scoredEndSeason = Number(score.scoredEndSeason);
  if (
    !String(score.owner || '').trim()
    || !Number.isInteger(requestedSeasonCount)
    || requestedSeasonCount <= 0
    || !Number.isInteger(scoredSeasonCount)
    || scoredSeasonCount <= 0
    || scoredSeasonCount > requestedSeasonCount
    || !Number.isInteger(requestedStartSeason)
    || !Number.isInteger(requestedEndSeason)
    || requestedStartSeason > requestedEndSeason
    || requestedSeasonCount !== requestedEndSeason - requestedStartSeason + 1
    || !Number.isInteger(scoredStartSeason)
    || !Number.isInteger(scoredEndSeason)
    || scoredStartSeason < requestedStartSeason
    || scoredEndSeason > requestedEndSeason
    || scoredStartSeason > scoredEndSeason
    || ![score.score, score.rankInPeriod, score.totalOwners, score.wins, score.losses, score.ties]
      .every(value => Number.isFinite(Number(value)))
  ) return null;
  const top = Object.entries(score.components || {})
    .map(([label, value]) => ({ label, value: Number(value) || 0 }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.label.localeCompare(b.label))[0];
  const partialCoverage = scoredSeasonCount < requestedSeasonCount;
  const scoredRange = scoredStartSeason === scoredEndSeason
    ? String(scoredStartSeason)
    : `${scoredStartSeason}–${scoredEndSeason}`;
  return result('dynasty', {
    id: `${score.owner}-${score.requestedStartSeason}-${score.requestedEndSeason}`,
    eyebrow: `${score.requestedStartSeason}–${score.requestedEndSeason} Dynasty Rankings`,
    title: `${score.owner} Dynasty Score`,
    subtitle: `${score.label || 'Dynasty profile'}${partialCoverage ? ' · Partial coverage' : ''}`,
    metrics: [
      { label: 'Dynasty score', value: formatDynastyScore(Number(score.score)) },
      { label: 'Period rank', value: `#${score.rankInPeriod} of ${score.totalOwners}` },
      { label: 'Record', value: `${score.wins}-${score.losses}-${score.ties}` },
      partialCoverage
        ? { label: 'Coverage', value: `${scoredSeasonCount}/${requestedSeasonCount} seasons`, detail: `Scored ${scoredRange}` }
        : { label: top?.label || 'Top component', value: top ? `${top.value >= 0 ? '+' : ''}${top.value.toFixed(1)}` : '—' },
    ],
    canonicalPath,
    sourceLabel: 'Dynasty Rankings',
    dataVersion,
    altText: `${score.owner}: ${formatDynastyScore(Number(score.score))} Dynasty score, rank ${score.rankInPeriod} of ${score.totalOwners}, ${score.requestedStartSeason}–${score.requestedEndSeason}.${partialCoverage ? ` Based on ${scoredSeasonCount} of ${requestedSeasonCount} requested seasons; scored range ${scoredRange}.` : ''}`,
  }, win);
}

export function mountDynastyCard(
  host: HTMLElement | null,
  score: any,
  canonicalPath: string,
  dataVersion: string,
  win: Window,
  expectedOwner?: string | null,
) {
  if (!host) return null;
  const cardResult = buildDynastyCardResult(score, canonicalPath, dataVersion, win, expectedOwner);
  if (!cardResult) return null;
  return mountShareCardAction({
    host,
    label: `Share ${score.owner} dynasty card`,
    result: cardResult,
  });
}

export function buildFeatureShareCard(kind: ShareCardKind, input: StoryInput, win: Window) {
  return result(kind, input, win);
}
