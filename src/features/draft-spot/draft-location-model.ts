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

export interface DraftLocationLeaderLine {
  locationId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function enabledDraftLocations(locations: DraftLocation[] = []): DraftLocation[] {
  return locations.filter(location => location.enabled);
}

export function formatDraftLocationYears(location: Pick<DraftLocation, 'season_start' | 'season_end'>): string {
  return location.season_start === location.season_end ? String(location.season_start) : `${location.season_start}–${location.season_end}`;
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
  const physical = locations.filter(location => location.enabled && location.coordinates);
  if (!physical.length) return [];
  // Bounds match the U.S. Census Bureau 2025 Cartographic Boundary File used by
  // assets/draft-journey-basemap.svg; the backdrop and pins share this projection.
  return physical.map(location => ({
    location,
    x: ((location.coordinates!.longitude + 80.5) / 7.5) * 100,
    y: (1 - (location.coordinates!.latitude - 36) / 6.8) * 100,
  }));
}

function axisSlots(size: number, boxSize: number, gap: number): number[] {
  const min = 2;
  const max = size - boxSize - 2;
  if (max <= min) return [Math.max(0, (size - boxSize) / 2)];
  const slots: number[] = [];
  for (let value = min; value <= max; value += boxSize + gap) slots.push(value);
  if (slots.at(-1)! + boxSize <= max) slots.push(max);
  return slots;
}

export function layoutDraftCallouts(locations: DraftLocation[] = [], width = 320, height = 220, requestedBoxHeight = 48): DraftLocationCallout[] {
  const points = projectDraftLocations(locations);
  const scaleX = Math.max(1, width), scaleY = Math.max(1, height);
  const boxWidth = Math.min(width <= 360 ? 112 : 132, Math.max(1, scaleX - 4));
  const boxHeight = Math.min(Math.max(1, requestedBoxHeight), Math.max(1, scaleY - 4));
  const gap = 8;
  const leftSlots = axisSlots(scaleX, boxWidth, gap);
  const topSlots = axisSlots(scaleY, boxHeight, gap);
  const slots = leftSlots.flatMap(left => topSlots.map(top => ({ left, top })));
  return points.map(point => {
    const center = Math.min(Math.max(point.x * scaleX / 100, boxWidth / 2), scaleX - boxWidth / 2);
    const preferredLeft = center - boxWidth / 2;
    const preferredTop = Math.min(Math.max(point.y * scaleY / 100 - boxHeight - 8, 2), scaleY - boxHeight - 2);
    let slotIndex = -1;
    let nearest = Infinity;
    slots.forEach((slot, index) => {
      const distance = (slot.left - preferredLeft) ** 2 + (slot.top - preferredTop) ** 2;
      if (distance < nearest) {
        nearest = distance;
        slotIndex = index;
      }
    });
    const position = slotIndex >= 0
      ? slots.splice(slotIndex, 1)[0]
      : { left: Math.max(0, Math.min(preferredLeft, scaleX - boxWidth)), top: Math.max(0, Math.min(preferredTop, scaleY - boxHeight)) };
    const callout = { ...point, ...position, width: boxWidth, height: boxHeight };
    return callout;
  });
}

/** Decorative connectors use the true projected pin and the displaced callout center. */
export function draftLocationLeaderLines(callouts: DraftLocationCallout[], width = 320, height = 220): DraftLocationLeaderLine[] {
  const scaleX = Math.max(1, width), scaleY = Math.max(1, height);
  return callouts.map(callout => ({
    locationId: callout.location.id,
    x1: callout.x,
    y1: callout.y,
    x2: ((callout.left + callout.width / 2) / scaleX) * 100,
    y2: ((callout.top + callout.height / 2) / scaleY) * 100,
  }));
}

export function draftLocationPrecisionLabel(location: DraftLocation): string {
  if (location.location_type === 'virtual') return 'Virtual era; no physical location assigned.';
  return location.coordinate_precision === 'venue' ? 'Venue location.' : 'Municipality reference point; approximate.';
}
