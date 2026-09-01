import { useEffect, useMemo, useState } from 'preact/hooks';
import type { DraftLocation } from '../../data/generated/asset-types';
import { draftLocationDetails, draftLocationLeaderLines, draftLocationPrecisionLabel, enabledDraftLocations, formatDraftLocationYears, layoutDraftCallouts, projectDraftLocations } from './draft-location-model';

interface Props {
  locations: DraftLocation[];
  selectedLocation: string | null;
  onSelect: (id: string | null) => void;
  onReveal?: (entryId: string, opener: HTMLElement) => void;
}

const COMPACT_LAYOUT_WIDTH = 192;
const WIDE_LAYOUT_WIDTH = 400;
const JOURNEY_LAYOUT_HEIGHT = 300;
const JOURNEY_CALLOUT_HEIGHT = 68;
const basemapUrl = `${import.meta.env.BASE_URL}assets/draft-journey-basemap.svg`;

function useCompactJourneyLayout(): boolean {
  const query = '(max-width: 760px)';
  const readMatches = () => typeof window !== 'undefined' && (window.matchMedia?.(query).matches ?? window.innerWidth <= 760);
  const [compact, setCompact] = useState(readMatches);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia?.(query);
    if (!media) {
      const update = () => setCompact(window.innerWidth <= 760);
      window.addEventListener('resize', update);
      update();
      return () => window.removeEventListener('resize', update);
    }
    const update = () => setCompact(media.matches);
    update();
    if (media.addEventListener) media.addEventListener('change', update);
    else media.addListener(update);
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', update);
      else media.removeListener(update);
    };
  }, []);

  return compact;
}

export default function DraftJourney({ locations, selectedLocation, onSelect, onReveal }: Props) {
  const sorted = useMemo(() => enabledDraftLocations(locations), [locations]);
  const points = useMemo(() => projectDraftLocations(sorted), [sorted]);
  const compact = useCompactJourneyLayout();
  const layoutWidth = compact ? COMPACT_LAYOUT_WIDTH : WIDE_LAYOUT_WIDTH;
  const callouts = useMemo(() => layoutDraftCallouts(sorted, layoutWidth, JOURNEY_LAYOUT_HEIGHT, JOURNEY_CALLOUT_HEIGHT), [layoutWidth, sorted]);
  const leaderLines = useMemo(() => draftLocationLeaderLines(callouts, layoutWidth, JOURNEY_LAYOUT_HEIGHT), [callouts, layoutWidth]);
  const details = useMemo(() => draftLocationDetails(selectedLocation, sorted), [selectedLocation, sorted]);
  const selected = details.length === 1 && selectedLocation ? details[0] : null;
  const status = selected ? `Showing ${selected.label}, ${formatDraftLocationYears(selected)}` : 'Showing all draft locations';
  const choose = (value: string) => onSelect(value || null);
  return (
    <section class="draft-journey" aria-labelledby="draftJourneyHeading">
      <div class="section-heading">
        <div>
          <h3 id="draftJourneyHeading">Draft Journey</h3>
          <p class="muted">A Mid-Atlantic map of draft history. Municipality positions are approximate.</p>
        </div>
        <label class="draft-journey-filter">Location
          <select aria-label="Filter draft journey by location" value={selectedLocation || ''} onChange={event => choose((event.currentTarget as HTMLSelectElement).value)}>
            <option value="">All locations</option>
            {sorted.map(location => <option key={location.id} value={location.id}>{location.label} · {formatDraftLocationYears(location)}</option>)}
          </select>
        </label>
      </div>
      <p class="visually-hidden" aria-live="polite">{status}</p>
      <div class="draft-journey-layout">
        <div class="draft-journey-map has-basemap" role="group" aria-label="Draft locations across the Mid-Atlantic">
          <img class="draft-journey-basemap" src={basemapUrl} alt="" aria-hidden="true" />
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height: `${JOURNEY_LAYOUT_HEIGHT}px` }}>
            <polyline class="draft-journey-route" points={points.map(point => `${point.x},${point.y}`).join(' ')} />
            {leaderLines.map(line => <line key={line.locationId} class="draft-journey-leader" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />)}
            {points.map(point => <circle key={point.location.id} class={point.location.id === selectedLocation ? 'is-selected' : ''} cx={point.x} cy={point.y} r="2.5" />)}
          </svg>
          {callouts.map(callout => {
            const location = callout.location;
            return <button key={location.id} type="button" class={`draft-journey-callout${location.id === selectedLocation ? ' is-selected' : ''}`} style={{ left: `${((callout.left + callout.width / 2) / layoutWidth) * 100}%`, top: `${(callout.top / JOURNEY_LAYOUT_HEIGHT) * 100}%`, width: `${callout.width}px`, minHeight: `${callout.height}px` }} aria-pressed={location.id === selectedLocation} aria-label={`Show ${location.label}, ${formatDraftLocationYears(location)}`} onClick={() => choose(location.id)}>
              <span>{location.label}</span><small>{formatDraftLocationYears(location)}</small>
            </button>;
          })}
        </div>
        <div class="draft-journey-virtual">
          {sorted.filter(location => location.location_type === 'virtual').map(location => <button type="button" class={`draft-journey-virtual-button${location.id === selectedLocation ? ' is-selected' : ''}`} aria-pressed={location.id === selectedLocation} onClick={() => choose(location.id)} key={location.id}><span>{location.label}</span><small>{formatDraftLocationYears(location)}</small></button>)}
        </div>
      </div>
      <div class="draft-journey-details">
        {details.map(location => <article class={`draft-journey-detail${location.id === selectedLocation ? ' is-selected' : ''}`} key={location.id}>
          <h4>{location.label}</h4><p><strong>{formatDraftLocationYears(location)}</strong> · {location.location_type === 'virtual' ? 'Virtual' : 'Physical'}</p>
          {location.venue && <p>{location.venue}</p>}<p class="muted">{draftLocationPrecisionLabel(location)}</p>
          {onReveal && <button type="button" class="button-secondary" onClick={event => onReveal(location.entry_id, event.currentTarget as HTMLElement)}>Open {location.label} lore</button>}
        </article>)}
      </div>
    </section>
  );
}
