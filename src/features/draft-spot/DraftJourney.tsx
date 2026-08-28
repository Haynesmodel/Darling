import { useMemo } from 'preact/hooks';
import type { DraftLocation } from '../../data/generated/asset-types';
import { draftLocationDetails, draftLocationPrecisionLabel, enabledDraftLocations, formatDraftLocationYears, layoutDraftCallouts, projectDraftLocations } from './draft-location-model';

interface Props {
  locations: DraftLocation[];
  selectedLocation: string | null;
  onSelect: (id: string | null) => void;
  onReveal?: (entryId: string, opener: HTMLElement) => void;
}

export default function DraftJourney({ locations, selectedLocation, onSelect, onReveal }: Props) {
  const sorted = useMemo(() => enabledDraftLocations(locations), [locations]);
  const points = useMemo(() => projectDraftLocations(sorted), [sorted]);
  const callouts = useMemo(() => layoutDraftCallouts(sorted), [sorted]);
  const details = useMemo(() => draftLocationDetails(selectedLocation, sorted), [selectedLocation, sorted]);
  const selected = details.length === 1 && selectedLocation ? details[0] : null;
  const status = selected ? `Showing ${selected.label}, ${formatDraftLocationYears(selected)}` : 'Showing all draft locations';
  const choose = (value: string) => onSelect(value || null);
  return (
    <section class="draft-journey" aria-labelledby="draftJourneyHeading">
      <div class="section-heading">
        <div>
          <h3 id="draftJourneyHeading">Draft Journey</h3>
          <p class="muted">A schematic map of draft history. Municipality positions are approximate.</p>
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
        <div class="draft-journey-map" role="group" aria-label="Schematic route between draft locations">
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline class="draft-journey-route" points={points.map(point => `${point.x},${point.y}`).join(' ')} />
            {points.map(point => <circle key={point.location.id} class={point.location.id === selectedLocation ? 'is-selected' : ''} cx={point.x} cy={point.y} r="2.5" />)}
          </svg>
          {callouts.map(callout => {
            const location = callout.location;
            return <button key={location.id} type="button" class={`draft-journey-callout${location.id === selectedLocation ? ' is-selected' : ''}`} style={{ left: `${((callout.left + callout.width / 2) / 320) * 100}%`, top: `${(callout.top / 220) * 100}%` }} aria-pressed={location.id === selectedLocation} aria-label={`Show ${location.label}, ${formatDraftLocationYears(location)}`} onClick={() => choose(location.id)}>
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
