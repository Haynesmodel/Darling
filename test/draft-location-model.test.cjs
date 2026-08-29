const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const lore = JSON.parse(fs.readFileSync(path.join(root, 'assets/LeagueLore.json'), 'utf8'));
let model;
let temp;

test.before(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'darling-draft-location-'));
  await esbuild.build({ entryPoints: { model: path.join(root, 'src/features/draft-spot/draft-location-model.ts') }, outdir: temp, bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent' });
  model = await import(`${pathToFileURL(path.join(temp, 'model.js')).href}?${Date.now()}`);
});
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('draft locations cover the four chronological eras and normalize selection', () => {
  const locations = model.enabledDraftLocations(lore.draft_locations);
  assert.deepEqual(locations.map(row => row.id), ['remote-virtual', 'bethany-beach', 'college-park', 'washington-dc']);
  assert.deepEqual(locations.map(model.formatDraftLocationYears), ['2014–2016', '2017–2022', '2023–2024', '2025–2026']);
  assert.equal(model.normalizeDraftLocation('washington-dc', locations), 'washington-dc');
  assert.equal(model.normalizeDraftLocation('disabled', locations), null);
  assert.equal(model.normalizeDraftLocation(undefined, locations), null);
  assert.deepEqual(model.draftLocationDetails('college-park', locations).map(row => row.id), ['college-park']);
});

test('physical projection and callouts are finite, bounded, and deterministic', () => {
  const locations = model.enabledDraftLocations(lore.draft_locations);
  const points = model.projectDraftLocations(locations);
  assert.equal(points.length, 3);
  for (const point of points) assert.ok(Number.isFinite(point.x) && point.x >= 0 && point.x <= 100 && Number.isFinite(point.y) && point.y >= 0 && point.y <= 100);
  const first = model.layoutDraftCallouts(locations, 320, 220);
  assert.deepEqual(first, model.layoutDraftCallouts(locations, 320, 220));
  for (const box of first) assert.ok(box.left >= 0 && box.top >= 0 && box.left + box.width <= 320 && box.top + box.height <= 220);
  assert.equal(model.projectDraftLocations([locations[0]]).length, 0);
});

test('draft location helpers cover disabled, virtual, precision, and collision branches', () => {
  const disabled = { ...lore.draft_locations[1], id: 'disabled', enabled: false };
  const tieVenue = { ...lore.draft_locations[2], id: 'alpha', season_start: 2023, season_end: 2023 };
  const tieMunicipality = { ...lore.draft_locations[2], id: 'zeta', season_start: 2023, season_end: 2024, coordinate_precision: 'municipality' };
  const virtual = { ...lore.draft_locations[0], id: 'virtual-test' };
  const locations = [tieMunicipality, tieVenue, disabled, virtual];

  assert.deepEqual(model.enabledDraftLocations(locations).map(location => location.id), ['virtual-test', 'alpha', 'zeta']);
  assert.equal(model.normalizeDraftLocation(42, locations), null);
  assert.equal(model.selectedDraftLocation('missing', locations), null);
  assert.deepEqual(model.draftLocationDetails(null, locations).map(location => location.id), ['virtual-test', 'alpha', 'zeta']);
  assert.deepEqual(model.projectDraftLocations([virtual]), []);
  assert.equal(model.draftLocationPrecisionLabel(virtual), 'Virtual era; no physical location assigned.');
  assert.equal(model.draftLocationPrecisionLabel(tieVenue), 'Venue location.');
  assert.equal(model.draftLocationPrecisionLabel(tieMunicipality), 'Municipality reference point; approximate.');

  const points = model.projectDraftLocations([tieVenue, tieMunicipality]);
  assert.equal(points.length, 2);
  const callouts = model.layoutDraftCallouts([tieVenue, tieMunicipality], 320, 220);
  assert.equal(callouts.length, 2);
  assert.ok(callouts[0].top + callouts[0].height <= callouts[1].top || callouts[1].top + callouts[1].height <= callouts[0].top);
  assert.deepEqual(model.layoutDraftCallouts([], 0, 0), []);
});
