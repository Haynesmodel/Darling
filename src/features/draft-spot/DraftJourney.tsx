import { useEffect, useRef, useState } from 'preact/hooks';
import type { DraftLocation } from '../../data/generated/asset-types';
import { draftLocationLeaderLines, draftLocationPrecisionLabel, enabledDraftLocations, formatDraftLocationYears, layoutDraftCallouts, projectDraftLocations } from './draft-location-model';

interface Props {
  locations: DraftLocation[];
  selectedLocation: string | null;
  onSelect: (id: string | null) => void;
  onReveal?: (entryId: string, opener: HTMLElement) => void;
  tourFacts?: DraftJourneyTourFact[];
}

export interface DraftJourneyTourFact {
  locationId: string;
  champions: string;
  moment: string;
}

const COMPACT_LAYOUT_WIDTH = 230;
const WIDE_LAYOUT_WIDTH = 400;
const JOURNEY_LAYOUT_HEIGHT = 300;
const MIN_JOURNEY_ZOOM = 1;
const MAX_JOURNEY_ZOOM = 1.6;
const JOURNEY_ZOOM_STEP = 0.2;

function useCompactJourneyLayout(): boolean {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 760);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const update = () => setCompact(window.innerWidth <= 760);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return compact;
}

type TourState = 1 | 2;

export default function DraftJourney({ locations, selectedLocation, onSelect, onReveal, tourFacts = [] }: Props) {
  const sorted = enabledDraftLocations(locations);
  const points = projectDraftLocations(sorted);
  const compact = useCompactJourneyLayout();
  const journeyRoot = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(MIN_JOURNEY_ZOOM);
  const [tourState, setTourState] = useState<TourState | 0>(0);
  const [tourIndex, setTourIndex] = useState(0);
  useEffect(() => {
    const details = journeyRoot.current?.closest('details');
    if (!details) return undefined;
    const sync = () => {
      if (details.open && !selectedLocation && !tourState && points.length) startTour();
    };
    sync();
    details.addEventListener('toggle', sync);
    return () => details.removeEventListener('toggle', sync);
  }, [points.length, selectedLocation, tourState]);
  const layoutWidth = compact ? COMPACT_LAYOUT_WIDTH : WIDE_LAYOUT_WIDTH;
  const callouts = layoutDraftCallouts(sorted, layoutWidth, JOURNEY_LAYOUT_HEIGHT, JOURNEY_CALLOUT_HEIGHT);
  const leaderLines = draftLocationLeaderLines(callouts, layoutWidth, JOURNEY_LAYOUT_HEIGHT);
  const details = selectedLocation ? sorted.filter(location => location.id === selectedLocation) : sorted;
  const tourPoint = tourState === 1 ? points[tourIndex] : null;
  const tourLocation = tourPoint?.location;
  const tourFact = tourFacts[tourIndex];
  const stagePanX = tourPoint ? (50 - tourPoint.x) * zoom : 0;
  const stagePanY = tourPoint ? (50 - tourPoint.y) * zoom : 0;
  const selected = details.length === 1 && selectedLocation ? details[0] : null;
  const status = selected ? `Showing ${selected.label}, ${formatDraftLocationYears(selected)}` : 'Showing all draft locations';
  function startTour() {
    setTourIndex(0);
    setTourState(1);
    setZoom(1.35);
  }
  const interruptTour = () => {
    if (tourState === 1) {
      setTourState(2);
      setZoom(MIN_JOURNEY_ZOOM);
    }
  };
  const choose = (value: string) => { interruptTour(); onSelect(value || null); };
  const adjustZoom = (amount: number) => { interruptTour(); setZoom(current => Math.min(MAX_JOURNEY_ZOOM, Math.max(MIN_JOURNEY_ZOOM, Number((current + amount).toFixed(1))))); };
  const advanceTour = () => {
    if (tourIndex === points.length - 1) {
      setZoom(MIN_JOURNEY_ZOOM);
      setTourState(2);
    } else setTourIndex(index => index + 1);
  };
  useEffect(() => {
    if (tourState !== 1) return;
    const timer = window.setTimeout(advanceTour, 3200);
    return () => window.clearTimeout(timer);
  }, [points.length, tourIndex, tourState]);
  return (
    <section ref={journeyRoot} class="draft-journey" aria-labelledby="draftJourneyHeading">
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
        <div class={`draft-journey-map has-basemap is-interactive${zoom > MIN_JOURNEY_ZOOM ? ' is-zoomed' : ''}`} role="group" aria-label="Draft locations across the Mid-Atlantic">
          <div class="draft-journey-map-chrome">
            <span>US Census · Mid-Atlantic</span>
            <div class="draft-journey-map-tools" role="group" aria-label="Map zoom controls">
              <button type="button" class="draft-journey-map-tool" aria-label="Zoom in" onClick={() => adjustZoom(JOURNEY_ZOOM_STEP)} disabled={zoom >= MAX_JOURNEY_ZOOM}>+</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button type="button" class="draft-journey-map-tool" aria-label="Zoom out" onClick={() => adjustZoom(-JOURNEY_ZOOM_STEP)} disabled={zoom <= MIN_JOURNEY_ZOOM}>−</button>
              <button type="button" class="draft-journey-map-reset" aria-label="Reset map zoom" onClick={() => { interruptTour(); setZoom(MIN_JOURNEY_ZOOM); }} disabled={zoom === MIN_JOURNEY_ZOOM}>Reset</button>
            </div>
          </div>
          {tourState === 1 && tourFact && tourLocation && <aside class="draft-journey-tour-card" aria-live="polite" role="status">
            <p class="draft-journey-tour-kicker">Draft Journey tour · Stop {tourIndex + 1} of {points.length}</p>
            <h4>{tourLocation.label}</h4>
            <p><strong>{formatDraftLocationYears(tourLocation)}</strong></p>
            <p><strong>Champions:</strong> {tourFact.champions || 'TBD — the 2026 season is not complete.'}</p>
            {tourFact.moment && <p class="draft-journey-tour-moment"><strong>From the lore:</strong> {tourFact.moment}</p>}
            <div class="draft-journey-tour-actions"><button type="button" class="draft-journey-tour-next" onClick={advanceTour}>{tourIndex === points.length - 1 ? 'Finish tour' : 'Next stop'}</button><button type="button" class="draft-journey-tour-skip" onClick={interruptTour}>Skip tour</button></div>
          </aside>}
          {tourState === 2 && <button type="button" class="draft-journey-tour-replay" onClick={startTour}>Replay tour</button>}
          <div class="draft-journey-map-viewport">
            <div class="draft-journey-map-stage" style={{ transform: `translate(${stagePanX}%,${stagePanY}%) scale(${zoom})` }}>
              <img class="draft-journey-basemap" src={basemapUrl} alt="" aria-hidden="true" />
              <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polyline class="draft-journey-route" points={points.map(point => `${point.x},${point.y}`).join(' ')} />
                {zoom === MIN_JOURNEY_ZOOM && leaderLines.map(line => <line key={line.locationId} class="draft-journey-leader" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />)}
              </svg>
            </div>
            {points.map(point => {
              const location = point.location;
              const years = formatDraftLocationYears(location);
              const placement = location.id === 'college-park' ? ' is-offset-northwest' : location.id === 'washington-dc' ? ' is-offset-southeast' : location.id === 'vienna-virginia' ? ' is-offset-southwest' : '';
              const isTourStop = tourState === 1 && location.id === tourLocation?.id;
              return <button key={location.id} type="button" class={`draft-journey-marker${placement}${location.id === selectedLocation ? ' is-selected' : ''}${isTourStop ? ' is-tour-stop' : ''}`} style={{ left: `${50 + (point.x - 50) * zoom + stagePanX}%`, top: `${50 + (point.y - 50) * zoom + stagePanY}%` }} aria-pressed={location.id === selectedLocation} aria-label={`Select ${location.label} · ${years}`} data-draft-location-marker={location.id} onClick={() => choose(location.id)}><span>{location.label} · {years}</span></button>;
            })}
            {zoom === MIN_JOURNEY_ZOOM && callouts.map(callout => {
              const location = callout.location;
              return <button key={location.id} type="button" class={`draft-journey-callout${location.id === selectedLocation ? ' is-selected' : ''}`} style={{ left: `${((callout.left + callout.width / 2) / layoutWidth) * 100}%`, top: `${(callout.top / JOURNEY_LAYOUT_HEIGHT) * 100}%`, width: `${callout.width}px` }} aria-pressed={location.id === selectedLocation} aria-label={`Show ${location.label}, ${formatDraftLocationYears(location)}`} onClick={() => choose(location.id)}>
                <span>{location.label}</span><small>{formatDraftLocationYears(location)}</small>
              </button>;
            })}
          </div>
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
const basemapUrl = `${import.meta.env.BASE_URL}assets/draft-journey-basemap.svg`;
const JOURNEY_CALLOUT_HEIGHT = 68;
