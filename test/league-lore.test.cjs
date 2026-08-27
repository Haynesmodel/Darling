const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lore = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/LeagueLore.json')));
const byId = new Map(lore.entries.map(entry => [entry.id, entry]));

test('League Lore preserves the supplied year and sensitivity corrections', () => {
  assert.equal(byId.get('punishment-connor-cheesesteak').season, 2025);
  assert.equal(byId.get('punishment-connor-cheesesteak').completed_year, 2026);
  assert.equal(byId.get('2022-championship-context').sensitivity, 'respectful');
  const championship = byId.get('2022-championship-context').body.join(' ');
  assert.match(championship, /101\.08/);
  assert.match(championship, /100\.40/);
  assert.match(championship, /Tee Higgins/);
  assert.match(championship, /active players/);
});

test('Singer lawn story is in Draft Weekend, never Punishment Museum', () => {
  const punishment = lore.collections.find(collection => collection.id === 'punishment-museum');
  const draftWeekend = lore.collections.find(collection => collection.id === 'draft-weekend-museum');
  assert.equal(punishment.entry_ids.includes('singer-lawn-story'), false);
  assert.equal(draftWeekend.entry_ids.includes('singer-lawn-story'), true);
});

test('commissioner display labels and Plot slogan remain exact', () => {
  assert.deepEqual(lore.commissioner_terms.map(term => term.display_term), ['Haynes, 2014–2017', 'Joel, 2017–2023', 'Zubs, 2023–2025', 'Plotnick, 2025–Present']);
  assert.match(byId.get('2025-plot-administration').body.join(' '), /^Joel was a snake, Zubs was a flake, but Plot- he let them eat cake$/);
});
