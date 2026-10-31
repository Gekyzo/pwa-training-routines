import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTraining } from '#training';
import {
  bodyWeightOn, addBodyEntry, editBodyEntry, deleteBodyEntry, bodySeries, addMeasure, editMeasure, deleteMeasure, relativeStrength, dots, checkDate,
} from '#body';

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

// ---- Entries, measures, relative strength and DOTS (BODY-1 to BODY-3) ----

const base = () => ({ ...emptyTraining(), settings: { ...emptyTraining().settings, measures: [{ id: 'waist', name: 'Waist', unit: 'cm' }] } });

test('addBodyEntry takes the unit of the settings for the weight and of the measure otherwise (BODY-1)', () => {
  let { state } = addBodyEntry(base(), { date: '2026-10-01', measure: 'weight', value: '80,44' }, 'a');
  assert.deepEqual(state.bodies[0], { id: 'a', date: '2026-10-01', measure: 'weight', value: 80.4, unit: 'kg' });
  ({ state } = addBodyEntry(state, { date: '2026-10-01', measure: 'waist', value: 90 }, 'b'));
  assert.equal(state.bodies[1].unit, 'cm');
  const lb = { ...base(), settings: { ...base().settings, unit: 'lb' } };
  assert.equal(addBodyEntry(lb, { date: '2026-10-01', measure: 'weight', value: 180 }, 'c').state.bodies[0].unit, 'lb');
});

test('addBodyEntry checks the date, the measure and the range (BODY-1)', () => {
  const entry = (extra) => addBodyEntry(base(), { date: '2026-10-01', measure: 'weight', value: 80, ...extra }, 'a');
  assert.equal(entry({ measure: 'nope' }).error.key, 'error.measureMissing');
  assert.equal(entry({ date: '2026-02-30' }).error.key, 'error.date');
  assert.equal(entry({ date: 'x' }).error.key, 'error.date');
  assert.equal(entry({ value: 19.9 }).error.key, 'error.numberRange');
  assert.equal(entry({ value: 401 }).error.key, 'error.numberRange');
  assert.equal(entry({ value: '' }).error.key, 'error.numberRequired');
  assert.equal(entry({ measure: 'waist', value: 5 }).error, undefined);
  assert.equal(entry({ measure: 'waist', value: 1001 }).error.key, 'error.numberRange');
  assert.equal(entry({}).state.bodies.length, 1);
});

test('editBodyEntry changes date and value, deleteBodyEntry removes (BODY-1)', () => {
  const { state } = addBodyEntry(base(), { date: '2026-10-01', measure: 'weight', value: 80 }, 'a');
  const edited = editBodyEntry(state, 'a', { date: '2026-10-02', value: 79 }).state.bodies[0];
  assert.deepEqual([edited.date, edited.value, edited.unit], ['2026-10-02', 79, 'kg']);
  assert.equal(editBodyEntry(state, 'a', { date: '2026-10-02', value: 5 }).error.key, 'error.numberRange');
  assert.equal(editBodyEntry(state, 'zz', { date: '2026-10-02', value: 79 }).error.key, 'error.bodyMissing');
  assert.equal(deleteBodyEntry(state, 'a').state.bodies.length, 0);
  assert.equal(deleteBodyEntry(state, 'zz').error.key, 'error.bodyMissing');
});

test('bodySeries lists one measure oldest first (BODY-1)', () => {
  const state = withBodies(entry('a', '2026-10-05', 81), entry('b', '2026-10-01', 80), entry('w', '2026-10-03', 90, { measure: 'waist', unit: 'cm' }));
  assert.deepEqual(bodySeries(state, 'weight').map((b) => b.id), ['b', 'a']);
  assert.deepEqual(bodySeries(state, 'none'), []);
});

test('measures: add, edit, delete and the in-use guard (BODY-2)', () => {
  let { state } = addMeasure(emptyTraining(), { name: ' Hip ', unit: 'cm' }, 'hip');
  assert.deepEqual(state.settings.measures, [{ id: 'hip', name: 'Hip', unit: 'cm' }]);
  assert.equal(addMeasure(state, { name: 'hip', unit: 'in' }, 'x').error.key, 'error.measureTaken');
  assert.equal(addMeasure(state, { name: 'Fat', unit: 'kg' }, 'x').error.key, 'error.unit');
  assert.equal(addMeasure(state, { name: '', unit: 'cm' }, 'x').error.key, 'error.nameRequired');
  ({ state } = editMeasure(state, 'hip', { name: 'Hips', unit: 'in' }));
  assert.deepEqual(state.settings.measures[0], { id: 'hip', name: 'Hips', unit: 'in' });
  assert.equal(editMeasure(state, 'zz', { name: 'A', unit: 'cm' }).error.key, 'error.measureMissing');
  ({ state } = addBodyEntry(state, { date: '2026-10-01', measure: 'hip', value: 90 }, 'e'));
  assert.equal(deleteMeasure(state, 'hip').error.key, 'error.measureInUse');
  assert.equal(editMeasure(state, 'hip', { name: 'Hips', unit: 'cm' }).error.key, 'error.measureInUse');
  assert.equal(editMeasure(state, 'hip', { name: 'Hip', unit: 'in' }).error, undefined);
  ({ state } = deleteBodyEntry(state, 'e'));
  assert.deepEqual(deleteMeasure(state, 'hip').state.settings.measures, []);
  assert.equal(deleteMeasure(state, 'zz').error.key, 'error.measureMissing');
});

test('checkDate accepts real dates only', () => {
  assert.equal(checkDate('2028-02-29').value, '2028-02-29');
  assert.equal(checkDate('2027-02-29').error.key, 'error.date');
  assert.equal(checkDate(null).error.key, 'error.date');
});

const lifts = (squat, bench, dead, extra = {}) => {
  const set = (id, weight) => ({ id, weight, unit: 'kg', reps: 1, seconds: null, meters: null, done: true, comment: '', kind: 'working' });
  const ex = (id) => ({ id, name: id, categoryId: null, type: 'weight_reps', equipment: 'barbell', archived: false });
  const entries = [['seed-squat', squat], ['seed-bench-press', bench], ['seed-deadlift', dead]]
    .filter(([, w]) => w).map(([exerciseId, w]) => ({ id: `e-${exerciseId}`, exerciseId, sets: [set(`s-${exerciseId}`, w)] }));
  const state = emptyTraining();
  return {
    ...state,
    settings: { ...state.settings, sex: 'male' },
    exercises: ['seed-squat', 'seed-bench-press', 'seed-deadlift'].map(ex),
    workouts: [{ id: 'w', date: '2026-10-01', started: '2026-10-01T10:00:00.000Z', finished: null, routineId: null, dayId: null, routineName: '', dayName: '', comment: '', entries }],
    bodies: [entry('b', '2026-09-01', 80)],
    ...extra,
  };
};

test('relativeStrength is the best e1RM over the body weight (BODY-3)', () => {
  const state = lifts(160, 100, 200);
  assert.equal(relativeStrength(state, 'seed-squat', '2026-10-02'), 2);
  assert.equal(relativeStrength(state, 'seed-squat', '2026-08-01'), null);
  assert.equal(relativeStrength(state, 'nope', '2026-10-02'), null);
});

test('dots uses the standard coefficients of the sex (BODY-3)', () => {
  const male = (80 ** 0 * -307.75076) + 24.0900756 * 80 - 0.1918759221 * 80 ** 2 + 0.0007391293 * 80 ** 3 - 0.000001093 * 80 ** 4;
  assert.ok(Math.abs(dots(lifts(160, 100, 200), '2026-10-02') - (460 * 500) / male) < 1e-9);
  assert.ok(Math.abs(dots(lifts(160, 100, 200), '2026-10-02') - 317.19) < 0.01);
  const female = lifts(160, 100, 200);
  female.settings.sex = 'female';
  assert.ok(Math.abs(dots(female, '2026-10-02') - 460 * 500 / (-57.96288 + 13.6175032 * 80 - 0.1126655495 * 6400 + 0.0005158568 * 512000 - 0.0000010706 * 40960000)) < 1e-9);
});

test('dots is null with no sex, no body weight or a lift with no e1RM (BODY-3)', () => {
  assert.equal(dots(lifts(160, 100, null), '2026-10-02'), null);
  assert.equal(dots(lifts(160, 100, 200, { bodies: [] }), '2026-10-02'), null);
  const none = lifts(160, 100, 200);
  none.settings.sex = null;
  assert.equal(dots(none, '2026-10-02'), null);
});
