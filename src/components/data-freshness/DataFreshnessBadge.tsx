import { useEffect, useState } from 'preact/hooks';
import { assessDataFreshness, type DataFreshnessAssessment, type OptionalAssetFailure } from '../../data/data-freshness';
import type { CurrentSeasonData, SeasonSummaryRow } from '../../data/generated/asset-types';
import { shortDataVersion } from '../../data/data-version';

export interface DataFreshnessSnapshot {
  currentSeason: CurrentSeasonData | null;
  seasonSummaries: SeasonSummaryRow[];
  optionalFailures: OptionalAssetFailure[];
  dataVersion: string;
  coreVerified: boolean;
}

export interface DataFreshnessRuntime {
  publish(snapshot: DataFreshnessSnapshot): void;
  current(): DataFreshnessSnapshot | null;
  currentAssessment(now?: Date): DataFreshnessAssessment | null;
  subscribe(listener: () => void): () => void;
}

export function createDataFreshnessRuntime(): DataFreshnessRuntime {
  let snapshot: DataFreshnessSnapshot | null = null;
  const listeners = new Set<() => void>();
  let timer: number | null = null;
  const notify = () => listeners.forEach(listener => listener());
  const onVisibility = () => {
    if (document.visibilityState === 'visible') notify();
  };
  const startClock = () => {
    if (timer !== null || typeof window === 'undefined' || typeof document === 'undefined') return;
    timer = window.setInterval(notify, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisibility);
  };
  const stopClock = () => {
    if (listeners.size || timer === null || typeof window === 'undefined' || typeof document === 'undefined') return;
    window.clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisibility);
  };
  return {
    publish(next) {
      snapshot = next;
      notify();
    },
    current: () => snapshot,
    currentAssessment(now = new Date()) {
      return snapshot ? assessDataFreshness({
        currentSeason: snapshot.currentSeason,
        seasonSummaries: snapshot.seasonSummaries,
        optionalFailures: snapshot.optionalFailures,
        now,
      }) : null;
    },
    subscribe(listener) {
      listeners.add(listener);
      startClock();
      return () => {
        listeners.delete(listener);
        stopClock();
      };
    },
  };
}

function absoluteTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function DataFreshnessBadge({ runtime }: { runtime: DataFreshnessRuntime }) {
  const [revision, setRevision] = useState(0);

  useEffect(() => runtime.subscribe(() => setRevision(value => value + 1)), [runtime]);
  const snapshot = runtime.current();
  const assessment = runtime.currentAssessment();
  void revision;

  if (!snapshot || !assessment) {
    return <span class="data-freshness-loading">Checking data…</span>;
  }
  const updated = absoluteTime(assessment.generatedAt);
  const canReload = ['stale', 'live-stale', 'season-gap', 'unknown'].includes(assessment.status);
  return <details class={`data-freshness data-freshness-${assessment.severity}`} data-status={assessment.status}>
    <summary>
      <span class="data-freshness-dot" aria-hidden="true"></span>
      <span>{assessment.label}</span>
    </summary>
    <div class="data-freshness-panel">
      <strong>{assessment.label}</strong>
      <p>{assessment.detail}</p>
      <dl>
        {updated && <div><dt>Updated</dt><dd>{updated}</dd></div>}
        <div><dt>Snapshot</dt><dd>{shortDataVersion(snapshot.dataVersion)}</dd></div>
        <div><dt>Integrity</dt><dd>{snapshot.coreVerified ? 'Core data verified with SHA-256' : 'Verification unavailable'}</dd></div>
      </dl>
      {canReload && <button type="button" class="btn" onClick={() => window.location.reload()}>Reload to check again</button>}
    </div>
  </details>;
}
