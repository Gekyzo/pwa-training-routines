import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_SLUG } from '#config';
import {
  TRAINING_KEY,
  MAX_NAME,
  emptyTraining,
  normalizeTraining,
  checkName,
  checkNumber,
  nameTaken,
  setUnit,
  setRest,
  sortedExercises,
  sortedRoutines,
  sortedWorkouts,
  localDate,
} from '#training';

const set = (over = {}) => ({ id: 's1', weight: 60, unit: 'kg', reps: 5, seconds: null, meters: null, done: true, comment: '', ...over });

const full = () => ({
  version: 1,
  settings: { unit: 'kg', rest: 120 },
  categories: [{ id: 'c1', name: 'Chest' }],
  exercises: [{ id: 'e1', name: 'Bench press', categoryId: 'c1', type: 'weight_reps', rest: null, archived: false }],
  routines: [
    {
      id: 'r1',
      name: 'Push',
      created: '2026-10-01T10:00:00.000Z',
      days: [{ id: 'd1', name: 'A', items: [{ id: 'i1', exerciseId: 'e1', sets: 3, reps: 8, repsMax: 12, weight: null, rest: 90 }] }],
    },
  ],
  workouts: [
    {
      id: 'w1',
      date: '2026-10-02',
      started: '2026-10-02T18:00:00.000Z',
      finished: null,
      routineId: 'r1',
      dayId: 'd1',
      routineName: 'Push',
      dayName: 'A',
      comment: '',
      entries: [{ id: 'n1', exerciseId: 'e1', sets: [set()] }],
    },
  ],
});

test('the key of the doc has the slug', () => {
  assert.equal(TRAINING_KEY, `${APP_SLUG}.training`);
});

test('the empty doc is valid and has the default settings', () => {
  assert.deepEqual(normalizeTraining(emptyTraining()), emptyTraining());
  assert.deepEqual(emptyTraining().settings, { unit: 'kg', rest: 90 });
});

test('a full doc passes unchanged', () => {
  assert.deepEqual(normalizeTraining(full()), full());
});

test('a doc that is not version 1 or has a list that is not an array is refused', () => {
  assert.equal(normalizeTraining(null), null);
  assert.equal(normalizeTraining({ ...full(), version: 2 }), null);
  assert.equal(normalizeTraining({ ...full(), workouts: {} }), null);
});

test('names are trimmed and unknown fields are dropped', () => {
  const doc = full();
  doc.categories[0] = { id: 'c1', name: '  Chest ', extra: 1 };
  assert.deepEqual(normalizeTraining(doc).categories, [{ id: 'c1', name: 'Chest' }]);
});

test('two exercises with one name, with no regard to case, are refused', () => {
  const doc = full();
  doc.exercises.push({ ...doc.exercises[0], id: 'e2', name: 'BENCH PRESS' });
  assert.equal(normalizeTraining(doc), null);
});

test('a duplicate id is refused', () => {
  const doc = full();
  doc.categories.push({ id: 'c1', name: 'Back' });
  assert.equal(normalizeTraining(doc), null);
});

test('an unknown exercise type is refused', () => {
  const doc = full();
  doc.exercises[0].type = 'swim';
  assert.equal(normalizeTraining(doc), null);
});

test('a number out of its limits is refused', () => {
  for (const over of [{ reps: -1 }, { reps: 2.5 }, { weight: 1001 }, { seconds: 1.5 }]) {
    const doc = full();
    doc.workouts[0].entries[0].sets[0] = set(over);
    assert.equal(normalizeTraining(doc), null, JSON.stringify(over));
  }
});

test('a range whose top is below its bottom is refused', () => {
  const doc = full();
  doc.routines[0].days[0].items[0].repsMax = 6;
  assert.equal(normalizeTraining(doc), null);
});

test('missing optional fields read as null, false or empty', () => {
  const doc = full();
  delete doc.exercises[0].rest;
  delete doc.exercises[0].archived;
  delete doc.workouts[0].comment;
  delete doc.workouts[0].finished;
  const clean = normalizeTraining(doc);
  assert.equal(clean.exercises[0].rest, null);
  assert.equal(clean.exercises[0].archived, false);
  assert.equal(clean.workouts[0].comment, '');
  assert.equal(clean.workouts[0].finished, null);
});

test('settings out of range fall back to the defaults', () => {
  const doc = full();
  doc.settings = { unit: 'stone', rest: 9999 };
  assert.deepEqual(normalizeTraining(doc).settings, { unit: 'kg', rest: 90 });
});

test('a reference to a missing exercise or category is kept (TRN-5)', () => {
  const doc = full();
  doc.exercises[0].categoryId = 'gone';
  doc.workouts[0].entries[0].exerciseId = 'gone';
  assert.notEqual(normalizeTraining(doc), null);
});

test('checkName trims and refuses blank and long names', () => {
  assert.deepEqual(checkName('  Squat '), { clean: 'Squat' });
  assert.deepEqual(checkName(' '), { error: { key: 'error.nameRequired' } });
  assert.deepEqual(checkName('a'.repeat(MAX_NAME + 1)), { error: { key: 'error.nameTooLong', params: { max: MAX_NAME } } });
});

test('nameTaken ignores case and the entry itself', () => {
  const list = [{ id: 'a', name: 'Squat' }];
  assert.equal(nameTaken(list, 'squat'), true);
  assert.equal(nameTaken(list, 'squat', 'a'), false);
});

test('checkNumber reads a comma, rounds a weight to one decimal and refuses a fraction of reps', () => {
  assert.deepEqual(checkNumber('weight', '62,55'), { value: 62.6 });
  assert.deepEqual(checkNumber('reps', '8'), { value: 8 });
  assert.deepEqual(checkNumber('reps', '8.5'), { error: { key: 'error.numberRange', params: { min: 0, max: 1000 } } });
  assert.deepEqual(checkNumber('reps', ''), { error: { key: 'error.numberRequired' } });
  assert.deepEqual(checkNumber('reps', '', { optional: true }), { value: null });
  assert.deepEqual(checkNumber('rest', 'abc').error.key, 'error.numberRange');
});

test('setUnit and setRest change the settings and leave the input alone', () => {
  const state = emptyTraining();
  assert.equal(setUnit(state, 'lb').state.settings.unit, 'lb');
  assert.equal(setRest(state, '150').state.settings.rest, 150);
  assert.deepEqual(setUnit(state, 'st'), { state, error: { key: 'error.unit' } });
  assert.equal(setRest(state, '601').state, state);
  assert.deepEqual(state, emptyTraining());
});

test('exercises sort by name and routines by creation', () => {
  const state = {
    ...emptyTraining(),
    exercises: [{ id: '2', name: 'squat' }, { id: '1', name: 'Bench' }],
    routines: [{ id: 'b', created: '2026-02-01T00:00:00Z' }, { id: 'a', created: '2026-01-01T00:00:00Z' }],
  };
  assert.deepEqual(sortedExercises(state).map((e) => e.id), ['1', '2']);
  assert.deepEqual(sortedRoutines(state).map((r) => r.id), ['a', 'b']);
});

test('workouts sort newest first by date, then by start', () => {
  const state = {
    ...emptyTraining(),
    workouts: [
      { id: 'a', date: '2026-10-01', started: '2026-10-01T08:00:00Z' },
      { id: 'b', date: '2026-10-02', started: '2026-10-02T08:00:00Z' },
      { id: 'c', date: '2026-10-02', started: '2026-10-02T19:00:00Z' },
    ],
  };
  assert.deepEqual(sortedWorkouts(state).map((w) => w.id), ['c', 'b', 'a']);
});

test('localDate pads the month and the day', () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});
