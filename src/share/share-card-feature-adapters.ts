import { buildShareCard, type ShareStoryFacts } from './share-card-builders';
import {
  absoluteShareHref,
  mountCopyLinkAction,
  mountShareCardAction,
  type ShareCardActionController,
} from './share-card-actions';
import type { ShareCardBuildResult, ShareCardKind } from './share-card-types';

type StoryInput = Omit<ShareStoryFacts, 'canonicalHref'> & { canonicalPath: string };

function result(kind: ShareCardKind, input: StoryInput, win: Window): ShareCardBuildResult {
  const facts = { ...input, canonicalHref: absoluteShareHref(input.canonicalPath, win) };
  return buildShareCard(kind, facts, {
    origin: win.location.origin,
    basePath: import.meta.env.BASE_URL,
  });
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
        eyebrow: `${view.season} · ${row.round || row.type || `Week ${view.week}`}`,
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
        altText: `${row.teamA} ${scoreA.toFixed(2)}, ${row.teamB} ${scoreB.toFixed(2)}; ${winner === 'Tie' ? 'tie' : `${winner} won`}.`,
      }, win),
    })];
  });
}

export function mountRivalryCard(host: HTMLElement | null, view: any, canonicalPath: string, dataVersion: string, win: Window) {
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
        { label: 'Last meeting', value: last ? (last.winner === 'Tie' ? 'Tie' : last.winner) : '—', detail: last ? `${Number(last.pf).toFixed(2)}–${Number(last.pa).toFixed(2)} · ${last.date}` : undefined },
      ],
      canonicalPath,
      sourceLabel: 'Head to Head',
      dataVersion,
      altText: `${view.teamA} vs ${view.teamB}: ${leader}, ${overall.recordText} in ${overall.g} meetings.`,
    }, win),
  });
}

export function mountTrophyCard(host: HTMLElement | null, view: any, canonicalPath: string, dataVersion: string, win: Window) {
  if (!host || !view.owner) return null;
  const hardware = new Map((view.hardwareShelf || []).map((item: any) => [String(item.label), Number(item.count) || 0]));
  const rank = String(view.hero?.rankContext || '').split('|')[0].trim();
  return mountShareCardAction({
    host,
    label: `Share ${view.owner} trophy card`,
    result: result('trophy', {
      id: view.owner,
      eyebrow: 'Trophy Case',
      title: view.hero?.title || view.owner,
      subtitle: view.hero?.identityLabel || view.identity?.label || 'Career profile',
      metrics: [
        { label: 'Career record', value: view.hero?.record || '—' },
        { label: 'League rank', value: rank || '—' },
        { label: 'Darlings', value: String(hardware.get('Darlings') || 0) },
        { label: 'Saunders titles', value: String(hardware.get('Saunders titles') || 0) },
      ],
      canonicalPath,
      sourceLabel: 'Trophy Case',
      dataVersion,
      altText: `${view.owner} Trophy Case: ${view.hero?.record || 'no record'}. ${rank}`.trim(),
    }, win),
  });
}

export function mountDynastyCard(host: HTMLElement | null, score: any, canonicalPath: string, dataVersion: string, win: Window) {
  if (!host || !score) return null;
  const top = Object.entries(score.components || {})
    .map(([label, value]) => ({ label, value: Number(value) || 0 }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.label.localeCompare(b.label))[0];
  return mountShareCardAction({
    host,
    label: `Share ${score.owner} dynasty card`,
    result: result('dynasty', {
      id: `${score.owner}-${score.requestedStartSeason}-${score.requestedEndSeason}`,
      eyebrow: `${score.requestedStartSeason}–${score.requestedEndSeason} Dynasty Rankings`,
      title: `${score.owner} Dynasty Score`,
      subtitle: score.label || 'Dynasty profile',
      metrics: [
        { label: 'Dynasty score', value: Number(score.score).toFixed(1) },
        { label: 'Period rank', value: `#${score.rankInPeriod} of ${score.totalOwners}` },
        { label: 'Record', value: `${score.wins}-${score.losses}-${score.ties}` },
        { label: top?.label || 'Top component', value: top ? `${top.value >= 0 ? '+' : ''}${top.value.toFixed(1)}` : '—' },
      ],
      canonicalPath,
      sourceLabel: 'Dynasty Rankings',
      dataVersion,
      altText: `${score.owner}: ${Number(score.score).toFixed(1)} Dynasty score, rank ${score.rankInPeriod} of ${score.totalOwners}, ${score.requestedStartSeason}–${score.requestedEndSeason}.`,
    }, win),
  });
}

export function buildFeatureShareCard(kind: ShareCardKind, input: StoryInput, win: Window) {
  return result(kind, input, win);
}
