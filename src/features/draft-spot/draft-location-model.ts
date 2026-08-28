import type { DraftLocation } from '../../data/generated/asset-types';

export interface DraftLocationPoint {
  location: DraftLocation;
  x: number;
  y: number;
}

export interface DraftLocationCallout extends DraftLocationPoint {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function enabledDraftLocations(locations: DraftLocation[] = []): DraftLocation[] {
  return locations.filter(location => location.enabled).slice().sort((a, b) => a.season_start - b.season_start || a.season_end - b.season_end || a.id.localeCompare(b.id));
}

export function formatDraftLocationYears(location: Pick<DraftLocation, 'season_start' | 'season_end'>): string {
  return `${location.season_start}–${location.season_end}`;
}

export function normalizeDraftLocation(requested: unknown, locations: DraftLocation[] = []): string | null {
  const id = typeof requested === 'string' ? requested : null;
  return id && enabledDraftLocations(locations).some(location => location.id === id) ? id : null;
}

export function selectedDraftLocation(requested: unknown, locations: DraftLocation[] = []): DraftLocation | null {
  const id = normalizeDraftLocation(requested, locations);
  return id ? enabledDraftLocations(locations).find(location => location.id === id) || null : null;
}

export function draftLocationDetails(requested: unknown, locations: DraftLocation[] = []): DraftLocation[] {
  const sorted = enabledDraftLocations(locations);
  const selected = normalizeDraftLocation(requested, sorted);
  return selected ? sorted.filter(location => location.id === selected) : sorted;
}

export function projectDraftLocations(locations: DraftLocation[] = []): DraftLocationPoint[] {
  const physical = enabledDraftLocations(locations).filter(location => location.coordinates);
  if (!physical.length) return [];
  const lats = physical.map(location => location.coordinates!.latitude);
  const lngs = physical.map(location => location.coordinates!.longitude);
  const latMin = Math.min(...lats), latMax = Math.max(...lats), lngMin = Math.min(...lngs), lngMax = Math.max(...lngs);
  const latPad = Math.max((latMax - latMin) * 0.35, 0.25);
  const lngPad = Math.max((lngMax - lngMin) * 0.35, 0.25);
  const minLat = latMin - latPad, maxLat = latMax + latPad, minLng = lngMin - lngPad, maxLng = lngMax + lngPad;
  return physical.map(location => ({
    location,
    x: ((location.coordinates!.longitude - minLng) / (maxLng - minLng)) * 100,
    y: (1 - (location.coordinates!.latitude - minLat) / (maxLat - minLat)) * 100,
  }));
}

function overlaps(a: DraftLocationCallout, b: DraftLocationCallout): boolean {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

export function layoutDraftCallouts(locations: DraftLocation[] = [], width = 320, height = 220): DraftLocationCallout[] {
  const points = projectDraftLocations(locations);
  const scaleX = Math.max(1, width), scaleY = Math.max(1, height);
  const boxWidth = width <= 360 ? 112 : 132;
  const boxHeight = 48;
  const placed: DraftLocationCallout[] = [];
  return points.map(point => {
    const center = Math.min(Math.max(point.x * scaleX / 100, boxWidth / 2), scaleX - boxWidth / 2);
    const left = center - boxWidth / 2;
    let top = Math.min(Math.max(point.y * scaleY / 100 - boxHeight - 8, 2), scaleY - boxHeight - 2);
    const candidate = () => ({ ...point, left, top, width: boxWidth, height: boxHeight });
    let callout = candidate();
    for (let attempt = 0; attempt < placed.length + 2; attempt += 1) {
      if (!placed.some(previous => overlaps(callout, previous))) break;
      top = Math.min(top + boxHeight + 8, scaleY - boxHeight - 2);
      callout = candidate();
    }
    placed.push(callout);
    return callout;
  });
}

export function draftLocationPrecisionLabel(location: DraftLocation): string {
  if (location.location_type === 'virtual') return 'Virtual era; no physical location assigned.';
  return location.coordinate_precision === 'venue' ? 'Venue location.' : 'Municipality reference point; approximate.';
}
