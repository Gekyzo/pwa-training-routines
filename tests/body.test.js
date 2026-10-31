import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTraining } from '#training';
import { bodyWeightOn } from '#body';

const entry = (id, date, value, extra = {}) => ({ id, date, measure: 'weight', value, unit: 'kg', ...extra });
const withBodies = (...bodies) => ({ ...emptyTraining(), bodies });

test('bodyWeightOn is the latest weight on or before the date (BODY-1)', () => {
  const state = withBodies(entry('a', '2026-10-01', 80), entry('b', '2026-10-10', 82, { unit: 'lb' }), entry('c', '2026-10-20', 79));
  assert.deepEqual(bodyWeightOn(state, '2026-10-10'), { value: 82, unit: 'lb' });
  assert.deepEqual(bodyWeightOn(state, '2026-10-15'), { value: 82, unit: 'lb' });
  assert.deepEqual(bodyWeightOn(state, '2026-12-01'), { value: 79, unit: 'kg' });
});

test('bodyWeightOn is null before the first entry or with none', () => {
  assert.equal(bodyWeightOn(withBodies(entry('a', '2026-10-05', 80)), '2026-10-04'), null);
  assert.equal(bodyWeightOn(withBodies(), '2026-10-04'), null);
});

test('bodyWeightOn ignores other measures', () => {
  const state = withBodies(entry('a', '2026-10-01', 80), entry('w', '2026-10-05', 90, { measure: 'waist', unit: 'cm' }));
  assert.deepEqual(bodyWeightOn(state, '2026-10-06'), { value: 80, unit: 'kg' });
});

test('bodyWeightOn takes the later entry of the same date', () => {
  const state = withBodies(entry('a', '2026-10-01', 80), entry('b', '2026-10-01', 81));
  assert.deepEqual(bodyWeightOn(state, '2026-10-01'), { value: 81, unit: 'kg' });
});
