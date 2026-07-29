const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const addFormats = require('ajv-formats').default;
const { fullFormats } = require('../scripts/data/standalone-formats.cjs');
const {
  compactValidatorErrors,
  outputRootFromArgs,
  specializeFormatRuntime,
} = require('../scripts/generate_asset_validators.cjs');
const {
  outputRootFromArgs: assetTypesOutputRootFromArgs,
} = require('../scripts/generate_asset_types.cjs');

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

test('validator generation resolves output roots and rejects a full format-runtime leak', () => {
  assert.equal(outputRootFromArgs([]), process.cwd());
  assert.equal(outputRootFromArgs(['--output-root', 'generated']), path.join(process.cwd(), 'generated'));
  assert.equal(assetTypesOutputRootFromArgs([]), process.cwd());
  assert.equal(assetTypesOutputRootFromArgs(['--output-root', 'types']), path.join(process.cwd(), 'types'));

  const source = 'const format = require("ajv-formats/dist/formats").fullFormats.date;';
  const specialized = specializeFormatRuntime(source);
  assert.match(specialized, /standalone-formats\.cjs/);
  assert.doesNotMatch(specialized, /ajv-formats\/dist\/formats/);
  assert.throws(
    () => specializeFormatRuntime('require("ajv-formats/dist/formats/renamed")'),
    /still reference the full ajv-formats runtime/,
  );

  const errorObject = 'const error={instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: field}};';
  assert.equal(compactValidatorErrors(errorObject), 'const error={instancePath};');
  assert.throws(
    () => compactValidatorErrors('const error={instancePath,schemaPath:dynamic,keyword:"type",params:{}};'),
    /unsupported error-object shape/,
  );
});
