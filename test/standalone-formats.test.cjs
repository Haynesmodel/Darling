const test = require('node:test');
const assert = require('node:assert/strict');
const addFormats = require('ajv-formats').default;
const { fullFormats } = require('../scripts/data/standalone-formats.cjs');

test('browser standalone date formats match the AJV format validators', () => {
  const samples = {
    date: [
      '2000-02-29',
      '1900-02-29',
      '2026-07-24',
      '2026-13-01',
      '2026-04-31',
      '2026-7-24',
      'not-a-date',
    ],
    'date-time': [
      '2026-07-24T14:30:00Z',
      '2026-07-24 14:30:00-05:00',
      '2026-07-24T23:59:60Z',
      '2026-02-29T14:30:00Z',
      '2026-07-24T14:30:00',
      '2026-07-24T25:00:00Z',
      'not-a-date-time',
    ],
  };

  for (const [name, values] of Object.entries(samples)) {
    const reference = addFormats.get(name).validate;
    for (const value of values) {
      assert.equal(fullFormats[name].validate(value), reference(value), `${name}: ${value}`);
    }
  }
});
