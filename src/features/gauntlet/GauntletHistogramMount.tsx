import { h, render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

type DeferredChartComponent = (props: any) => any;

function histogramBins(values: readonly number[], { bins = 18, min, max }: { bins?: number; min?: number; max?: number } = {}) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return [];
  const count = Math.max(1, Math.min(50, Math.floor(Number.isFinite(bins) ? bins : 18)));
  const lower = Number.isFinite(min) ? min as number : Math.min(...clean);
  const upper = Number.isFinite(max) ? max as number : Math.max(...clean);
  if (lower === upper) return [{ start: lower - 0.5, end: upper + 0.5, count: clean.length }];
  const step = (upper - lower) / count;
  const result = Array.from({ length: count }, (_, index) => ({
    start: lower + index * step,
    end: index === count - 1 ? upper : lower + (index + 1) * step,
    count: 0,
  }));
  for (const value of clean) {
    const index = Math.max(0, Math.min(count - 1, Math.floor((value - lower) / step)));
    result[index].count += 1;
  }
  return result;
}

interface HistogramResultInput {
  scoresA?: readonly number[];
  scoresB?: readonly number[];
}

interface HistogramTeamSeasonInput {
  owner: string;
  season: number;
  mean: number;
}

function gauntletHistogramRows(
  result: HistogramResultInput | null,
  teamSeasonA: HistogramTeamSeasonInput | null,
  teamSeasonB: HistogramTeamSeasonInput | null,
) {
  if (!result || !teamSeasonA || !teamSeasonB) return { rows: [], means: [], domain: [0, 1] as [number, number], maxCount: 0 };
  const scoresA = Array.isArray(result.scoresA) ? result.scoresA.filter(Number.isFinite) : [];
  const scoresB = Array.isArray(result.scoresB) ? result.scoresB.filter(Number.isFinite) : [];
  const combined = scoresA.concat(scoresB);
  if (!combined.length) return { rows: [], means: [], domain: [0, 1] as [number, number], maxCount: 0 };
  const min = Math.min(...combined);
  const max = Math.max(...combined);
  const teams = [
    { key: 'A' as const, teamSeason: teamSeasonA, scores: scoresA },
    { key: 'B' as const, teamSeason: teamSeasonB, scores: scoresB },
  ];
  const rows = teams.flatMap(team => histogramBins(team.scores, { bins: 18, min, max }).map((bin, index) => ({
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
    domain: [min, max] as [number, number],
    maxCount: rows.reduce((maximum, row) => Math.max(maximum, row.count), 0),
  };
}

function GauntletHistogram({
  result,
  teamSeasonA,
  teamSeasonB,
  active,
}: {
  result: HistogramResultInput | null;
  teamSeasonA: HistogramTeamSeasonInput | null;
  teamSeasonB: HistogramTeamSeasonInput | null;
  active: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [DeferredChart, setDeferredChart] = useState<DeferredChartComponent | null>(null);
  const payload = gauntletHistogramRows(result, teamSeasonA, teamSeasonB);
  const signature = [
    teamSeasonA?.owner || '',
    teamSeasonA?.season || '',
    teamSeasonB?.owner || '',
    teamSeasonB?.season || '',
    payload.rows.length,
    payload.maxCount,
    payload.domain.join(','),
  ].join('|');

  useEffect(() => {
    let mounted = true;
    void import('../../components/charts/DeferredChart').then(module => {
      if (mounted) setDeferredChart(() => module.DeferredChart as DeferredChartComponent);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    const outer = mount?.parentElement;
    if (!DeferredChart) {
      if (outer) outer.dataset.chartState = 'idle';
      return undefined;
    }
    const chartHost = mount?.querySelector<HTMLElement>('[data-chart-state]');
    if (!outer || !chartHost) return undefined;
    const syncState = () => {
      const state = chartHost.dataset.chartState;
      if (state) outer.dataset.chartState = state;
    };
    syncState();
    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(syncState)
      : null;
    observer?.observe(chartHost, { attributes: true, attributeFilter: ['data-chart-state'] });
    return () => observer?.disconnect();
  }, [signature, active, DeferredChart]);

  return <div ref={mountRef} class="gauntlet-histogram-mount" data-chart-state={DeferredChart ? undefined : 'idle'}>
    {DeferredChart && h(DeferredChart, {
      class: 'gauntlet-histogram-inner',
      name: 'Score Distribution',
      signature,
      request: { kind: 'gauntlet-histogram', data: payload },
      active,
      emptyMessage: 'No simulation data available.',
    })}
  </div>;
}

export function mountGauntletHistogram(
  host: HTMLElement | null,
  result: HistogramResultInput | null,
  teamSeasonA: HistogramTeamSeasonInput | null,
  teamSeasonB: HistogramTeamSeasonInput | null,
  active: boolean,
): () => void {
  if (!host) return () => undefined;
  render(h(GauntletHistogram, {
    result,
    teamSeasonA,
    teamSeasonB,
    active,
  }), host);
  return () => render(null, host);
}
