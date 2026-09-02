const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const lore = JSON.parse(fs.readFileSync(path.join(root, 'assets/LeagueLore.json'), 'utf8'));
let model;

test.before(async () => {
  model = await import(`${pathToFileURL(path.join(root, 'src/features/draft-spot/draft-location-model.ts')).href}?${Date.now()}`);
});

test('draft locations cover the five chronological eras and normalize selection', () => {
  const locations = model.enabledDraftLocations(lore.draft_locations);
  assert.deepEqual(locations.map(row => row.id), ['remote-virtual', 'bethany-beach', 'college-park', 'washington-dc', 'vienna-virginia']);
  assert.deepEqual(locations.map(model.formatDraftLocationYears), ['2014–2016', '2017–2022', '2023–2024', '2025', '2026']);
  assert.equal(model.normalizeDraftLocation('washington-dc', locations), 'washington-dc');
  assert.equal(model.normalizeDraftLocation('disabled', locations), null);
  assert.equal(model.normalizeDraftLocation(undefined, locations), null);
  assert.deepEqual(model.draftLocationDetails('college-park', locations).map(row => row.id), ['college-park']);
});

test('physical projection and callouts are finite, bounded, and deterministic', () => {
  const locations = model.enabledDraftLocations(lore.draft_locations);
  const points = model.projectDraftLocations(locations);
  assert.equal(points.length, 4);
  assert.deepEqual(points.map(point => [point.location.id, Number(point.x.toFixed(4)), Number(point.y.toFixed(4))]), [
    ['bethany-beach', 72.5973, 62.6529],
    ['college-park', 47.3933, 56.0191],
    ['washington-dc', 46.1747, 57.2471],
    ['vienna-virginia', 43.1293, 57.3353],
  ]);
  for (const point of points) assert.ok(Number.isFinite(point.x) && point.x >= 0 && point.x <= 100 && Number.isFinite(point.y) && point.y >= 0 && point.y <= 100);
  const first = model.layoutDraftCallouts(locations, 320, 220);
  assert.deepEqual(first, model.layoutDraftCallouts(locations, 320, 220));
  for (const box of first) assert.ok(box.left >= 0 && box.top >= 0 && box.left + box.width <= 320 && box.top + box.height <= 220);
  const leaders = model.draftLocationLeaderLines(first);
  assert.equal(leaders.length, 4);
  assert.deepEqual(leaders.map(line => line.locationId), first.map(box => box.location.id));
  assert.ok(leaders.every(line => [line.x1, line.y1, line.x2, line.y2].every(Number.isFinite)));
  assert.equal(model.projectDraftLocations([locations[0]]).length, 0);
});

test('static Draft Journey backdrop uses the same stretched viewport as the pin overlay', () => {
  const basemap = fs.readFileSync(path.join(root, 'assets/draft-journey-basemap.svg'), 'utf8');
  assert.match(basemap, /viewBox="0 0 1000 906\.6667"/);
  assert.match(basemap, /preserveAspectRatio="none"/);
});

test('co-located physical records receive bounded, non-overlapping callouts at mobile and desktop widths', () => {
  const source = lore.draft_locations.filter(location => location.location_type === 'physical');
  const locations = source.map((location, index) => ({
    ...location,
    id: `co-located-${index}`,
    season_start: 2017 + index,
    season_end: 2017 + index,
    coordinates: { latitude: 39, longitude: -76 },
  }));
  const four = [...locations, { ...locations[0], id: 'co-located-3', season_start: 2020, season_end: 2020 }];
  for (const [width, height] of [[320, 220], [960, 320]]) {
    const callouts = model.layoutDraftCallouts(four, width, height);
    assert.equal(callouts.length, 5);
    for (const callout of callouts) {
      assert.ok(callout.left >= 0 && callout.top >= 0);
      assert.ok(callout.left + callout.width <= width);
      assert.ok(callout.top + callout.height <= height);
    }
    for (let index = 0; index < callouts.length; index += 1) {
      for (let other = index + 1; other < callouts.length; other += 1) {
        const a = callouts[index], b = callouts[other];
        assert.ok(a.left >= b.left + b.width || a.left + a.width <= b.left || a.top >= b.top + b.height || a.top + a.height <= b.top);
      }
    }
  }
});

test('draft location helpers cover disabled, virtual, precision, and collision branches', () => {
  const disabled = { ...lore.draft_locations[1], id: 'disabled', enabled: false };
  const tieVenue = { ...lore.draft_locations[2], id: 'alpha', season_start: 2023, season_end: 2023 };
  const tieId = { ...lore.draft_locations[2], id: 'beta', season_start: 2023, season_end: 2023 };
  const tieMunicipality = { ...lore.draft_locations[2], id: 'zeta', season_start: 2023, season_end: 2024, coordinate_precision: 'municipality' };
  const virtual = { ...lore.draft_locations[0], id: 'virtual-test' };
  const locations = [tieMunicipality, tieId, tieVenue, disabled, virtual];

  assert.deepEqual(model.enabledDraftLocations(locations).map(location => location.id), ['virtual-test', 'alpha', 'beta', 'zeta']);
  assert.equal(model.normalizeDraftLocation(42, locations), null);
  assert.equal(model.selectedDraftLocation('missing', locations), null);
  assert.equal(model.selectedDraftLocation('alpha', locations).id, 'alpha');
  assert.equal(model.selectedDraftLocation(), null);
  assert.deepEqual(model.draftLocationDetails(null, locations).map(location => location.id), ['virtual-test', 'alpha', 'beta', 'zeta']);
  assert.deepEqual(model.draftLocationDetails().map(location => location.id), []);
  assert.deepEqual(model.projectDraftLocations([virtual]), []);
  assert.deepEqual(model.projectDraftLocations(), []);
  assert.equal(model.draftLocationPrecisionLabel(virtual), 'Virtual era; no physical location assigned.');
  assert.equal(model.draftLocationPrecisionLabel(tieVenue), 'Venue location.');
  assert.equal(model.draftLocationPrecisionLabel(tieMunicipality), 'Municipality reference point; approximate.');

  const points = model.projectDraftLocations([tieVenue, tieMunicipality]);
  assert.equal(points.length, 2);
  const callouts = model.layoutDraftCallouts([tieVenue, tieMunicipality], 320, 220);
  assert.equal(callouts.length, 2);
  assert.ok(callouts[0].top + callouts[0].height <= callouts[1].top || callouts[1].top + callouts[1].height <= callouts[0].top);
  const noFit = model.layoutDraftCallouts([
    { ...tieVenue, id: 'tiny-a' },
    { ...tieMunicipality, id: 'tiny-b' },
  ], 1, 1, 48);
  assert.equal(noFit.length, 2);
  assert.ok(noFit.every(callout => callout.width <= 1 && callout.height <= 1));
  assert.equal(noFit[1].left, 0);
  assert.equal(noFit[1].top, 0);
  assert.deepEqual(model.layoutDraftCallouts([], 0, 0), []);
  assert.deepEqual(model.layoutDraftCallouts(), []);
  assert.deepEqual(model.draftLocationLeaderLines([]), []);
});
