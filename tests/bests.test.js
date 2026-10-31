import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTraining } from '#training';
import { bestsOf, RECORDS, e1rm, bestE1rm, repMaxes, recordsOfSet, volumeOf, exerciseVolume, categoryVolume, effectiveLoad } from '#bests';

const set = (id, weight, reps, extra = {}) => ({ id, weight, unit: 'kg', reps, seconds: null, meters: null, done: true, comment: '', ...extra });
const workout = (id, date, sets, exerciseId = 'bench') => ({
  id, date, started: `${date}T10:00:00.000Z`, finished: null, routineId: null, dayId: null, routineName: '', dayName: '', comment: '',
  entries: [{ id: `${id}-e`, exerciseId, sets }],
});

const state = (workouts, type = 'weight_reps') => ({
  ...emptyTraining(),
  exercises: [{ id: 'bench', name: 'Bench', categoryId: null, type, rest: null, archived: false }],
  workouts,
});

test('weight and reps records: heaviest, most reps, best set and best workout (PR-1)', () => {
  const bests = bestsOf(state([
    workout('w1', '2026-10-01', [set('a', 100, 5), set('b', 80, 10)]),
    workout('w2', '2026-10-02', [set('c', 90, 8)]),
  ]), 'bench');
  assert.deepEqual(Object.keys(bests), RECORDS.weight_reps);
  assert.equal(bests.heaviest.set.id, 'a');
  assert.equal(bests.mostReps.set.id, 'b');
  assert.equal(bests.bestSet.set.id, 'b');
  assert.equal(bests.bestSet.value, 800);
  assert.equal(bests.bestWorkout.workout.id, 'w1');
  assert.equal(bests.bestWorkout.value, 1300);
});

test('a tie keeps the first record, and sets not done do not count', () => {
  const bests = bestsOf(state([
    workout('w1', '2026-10-01', [set('a', 100, 5)]),
    workout('w2', '2026-10-02', [set('b', 100, 5), set('c', 200, 1, { done: false })]),
  ]), 'bench');
  assert.equal(bests.heaviest.set.id, 'a');
});

test('weights in lb compare in kg', () => {
  const bests = bestsOf(state([
    workout('w1', '2026-10-01', [set('a', 100, 1)]),
    workout('w2', '2026-10-02', [set('b', 225, 1, { unit: 'lb' })]),
  ]), 'bench');
  assert.equal(bests.heaviest.set.id, 'b');
});

test('time and distance records, and an exercise with no sets has none', () => {
  const plank = bestsOf(state([workout('w1', '2026-10-01', [set('a', null, null, { seconds: 60 }), set('b', null, null, { seconds: 90 })])], 'time'), 'bench');
  assert.equal(plank.longest.value, 90);
  const run = bestsOf(state([workout('w1', '2026-10-01', [set('a', null, null, { meters: 5000, seconds: 1500 })])], 'distance_time'), 'bench');
  assert.deepEqual([run.farthest.value, run.longest.value], [5000, 1500]);
  assert.deepEqual(bestsOf(state([]), 'bench'), {});
  assert.deepEqual(bestsOf(state([]), 'missing'), {});
});

test('a weight of zero makes no heaviest record', () => {
  const bests = bestsOf(state([workout('w1', '2026-10-01', [set('a', 0, 10)])]), 'bench');
  assert.equal(bests.heaviest, undefined);
  assert.equal(bests.mostReps.value, 10);
});

test('weight_time and weight_distance have records (PR-1)', () => {
  const time = bestsOf(state([workout('w1', '2026-10-01', [set('a', 40, null, { seconds: 30 }), set('b', 20, null, { seconds: 90 })])], 'weight_time'), 'bench');
  assert.deepEqual(Object.keys(time), RECORDS.weight_time);
  assert.equal(time.heaviest.set.id, 'a');
  assert.equal(time.longest.set.id, 'b');
  const distance = bestsOf(state([workout('w1', '2026-10-01', [set('a', 60, null, { meters: 20 }), set('b', 40, null, { meters: 50 })])], 'weight_distance'), 'bench');
  assert.deepEqual(Object.keys(distance), RECORDS.weight_distance);
  assert.equal(distance.heaviest.set.id, 'a');
  assert.equal(distance.farthest.set.id, 'b');
});

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('e1rm: Epley and Brzycki, one rep gives the weight, only 1 to 12 reps (PR-2)', () => {
  close(e1rm(100, 5, 'epley'), 100 * (1 + 5 / 30));
  close(e1rm(100, 5, 'brzycki'), (100 * 36) / 32);
  assert.equal(e1rm(100, 1, 'epley'), 100);
  assert.equal(e1rm(100, 1, 'brzycki'), 100);
  assert.ok(e1rm(100, 12, 'epley') > 0);
  assert.equal(e1rm(100, 13, 'epley'), null);
  assert.equal(e1rm(100, 0, 'epley'), null);
  assert.equal(e1rm(0, 5, 'epley'), null);
  assert.equal(e1rm(-5, 5, 'epley'), null);
  assert.equal(e1rm(100, null, 'epley'), null);
  assert.equal(e1rm(null, 5, 'epley'), null);
});

test('bestE1rm follows the formula of the settings and skips sets over 12 reps', () => {
  const workouts = [workout('w1', '2026-10-01', [set('a', 100, 5), set('b', 60, 15)])];
  const epley = state(workouts);
  close(bestE1rm(epley, 'bench').value, 100 * (1 + 5 / 30));
  assert.equal(bestE1rm(epley, 'bench').set.id, 'a');
  const brzycki = { ...epley, settings: { ...epley.settings, formula: 'brzycki' } };
  close(bestE1rm(brzycki, 'bench').value, (100 * 36) / 32);
  assert.equal(bestE1rm(state([workout('w1', '2026-10-01', [set('a', 60, 15)])]), 'bench'), null);
  assert.equal(bestE1rm(state([], 'reps'), 'bench'), null);
});

test('the e1RM is a record after the best set, and a tie keeps the first (PR-2)', () => {
  assert.deepEqual(RECORDS.weight_reps, ['heaviest', 'mostReps', 'bestSet', 'e1rm', 'bestWorkout']);
  const bests = bestsOf(state([
    workout('w1', '2026-10-01', [set('a', 100, 5)]),
    workout('w2', '2026-10-02', [set('b', 100, 5)]),
  ]), 'bench');
  assert.equal(bests.e1rm.set.id, 'a');
});

test('warm-up sets make no record and no rep max; drop and failure sets do (LOG-5)', () => {
  const s = state([workout('w1', '2026-10-01', [
    set('w', 140, 5, { kind: 'warmup' }), set('a', 100, 5), set('d', 110, 3, { kind: 'drop' }), set('f', 105, 4, { kind: 'failure' }),
  ])]);
  const bests = bestsOf(s, 'bench');
  assert.equal(bests.heaviest.set.id, 'd');
  assert.equal(bests.bestWorkout.value, 500 + 330 + 420);
  assert.equal(repMaxes(s, 'bench')[4].weight, 100);
  assert.equal(volumeOf(s, s.workouts[0]), 500 + 330 + 420);
});

test('repMaxes: the heaviest weight in kg for each rep count 1 to 15 (PR-3)', () => {
  const s = state([
    workout('w1', '2026-10-01', [set('a', 100, 5), set('b', 120, 1), set('c', 40, 15)]),
    workout('w2', '2026-10-02', [set('d', 225, 5, { unit: 'lb' }), set('e', 100, 5), set('f', 50, 16)]),
  ]);
  const maxes = repMaxes(s, 'bench');
  assert.equal(maxes.length, 15);
  assert.deepEqual(maxes.map((m) => m?.reps ?? null), [1, null, null, null, 5, null, null, null, null, null, null, null, null, null, 15]);
  assert.equal(maxes[0].weight, 120);
  assert.equal(maxes[4].set.id, 'd');
  close(maxes[4].weight, 225 * 0.45359237);
  assert.equal(maxes[4].workout.id, 'w2');
  assert.equal(maxes[14].set.id, 'c');
  assert.deepEqual(repMaxes(state([]), 'bench'), Array(15).fill(null));
  assert.deepEqual(repMaxes(state([], 'time'), 'bench'), Array(15).fill(null));
});

test('a tie of a rep max keeps the first set', () => {
  const maxes = repMaxes(state([
    workout('w1', '2026-10-01', [set('a', 100, 5)]),
    workout('w2', '2026-10-02', [set('b', 100, 5)]),
  ]), 'bench');
  assert.equal(maxes[4].set.id, 'a');
});

test('recordsOfSet names the records a set holds now, a tie holds none (PR-4)', () => {
  const s = state([
    workout('w1', '2026-10-01', [set('a', 100, 5), set('b', 80, 10)]),
    workout('w2', '2026-10-02', [set('c', 100, 5)]),
  ]);
  assert.deepEqual(recordsOfSet(s, 'a'), ['heaviest', 'e1rm']);
  assert.deepEqual(recordsOfSet(s, 'b'), ['mostReps', 'bestSet']);
  assert.deepEqual(recordsOfSet(s, 'c'), []);
  assert.deepEqual(recordsOfSet(s, 'missing'), []);
});

test('recordsOfSet works for every type', () => {
  const s = state([workout('w1', '2026-10-01', [set('a', null, null, { seconds: 60 })])], 'time');
  assert.deepEqual(recordsOfSet(s, 'a'), ['longest']);
});

const volumeState = (extra = {}) => ({
  ...emptyTraining(),
  categories: [{ id: 'chest', name: 'Chest' }, { id: 'legs', name: 'Legs' }],
  exercises: [
    { id: 'bench', name: 'Bench', categoryId: 'chest', type: 'weight_reps', equipment: 'barbell', unilateral: false },
    { id: 'lunge', name: 'Lunge', categoryId: 'legs', type: 'weight_reps', equipment: 'dumbbell', unilateral: true },
    { id: 'misc', name: 'Misc', categoryId: null, type: 'weight_reps', equipment: null, unilateral: false },
    { id: 'plank', name: 'Plank', categoryId: 'chest', type: 'time', equipment: null, unilateral: false },
  ],
  workouts: [{
    id: 'w1', date: '2026-10-01', started: '2026-10-01T10:00:00.000Z', finished: null, routineId: null, dayId: null, routineName: '', dayName: '', comment: '',
    entries: [
      { id: 'e1', exerciseId: 'bench', sets: [set('a', 100, 5), set('b', 100, 5, { done: false }), set('c', 225, 2, { unit: 'lb' })] },
      { id: 'e2', exerciseId: 'lunge', sets: [set('d', 20, 10)] },
      { id: 'e3', exerciseId: 'misc', sets: [set('e', 10, 10)] },
      { id: 'e4', exerciseId: 'plank', sets: [set('f', null, null, { seconds: 60 })] },
      { id: 'e5', exerciseId: 'bench', sets: [set('g', 50, 4)] },
    ],
  }],
  ...extra,
});

test('volume: weight x reps of done sets, twice when unilateral, per workout, exercise and category (PR-5)', () => {
  const s = volumeState();
  const w = s.workouts[0];
  const kg = 225 * 0.45359237;
  close(exerciseVolume(s, 'bench', w), 500 + kg * 2 + 200);
  assert.equal(exerciseVolume(s, 'lunge', w), 400);
  assert.equal(exerciseVolume(s, 'plank', w), 0);
  assert.equal(exerciseVolume(s, 'missing', w), 0);
  close(volumeOf(s, w), 500 + kg * 2 + 200 + 400 + 100);
  const byCategory = categoryVolume(s, w);
  close(byCategory.get('chest'), 500 + kg * 2 + 200);
  assert.equal(byCategory.get('legs'), 400);
  assert.equal(byCategory.get(null), 100);
});

test('volume of an empty workout is zero and has no category', () => {
  const s = volumeState();
  const empty = { ...s.workouts[0], entries: [] };
  assert.equal(volumeOf(s, empty), 0);
  assert.equal(categoryVolume(s, empty).size, 0);
});

const bodyweightState = (bodies) => ({
  ...emptyTraining(),
  exercises: [{ id: 'pullup', name: 'Pull-up', categoryId: null, type: 'weight_reps', equipment: 'bodyweight', unilateral: false }],
  bodies,
  workouts: [
    workout('w1', '2026-10-05', [set('a', 10, 5), set('b', null, 8), set('c', -20, 6)], 'pullup'),
  ],
});
const weigh = (id, date, value, unit = 'kg') => ({ id, date, measure: 'weight', value, unit });

test('effectiveLoad: body weight of the date plus the set, partial with no body weight (LOG-9)', () => {
  const s = bodyweightState([weigh('b1', '2026-10-01', 80), weigh('b2', '2026-10-09', 70)]);
  const [exercise] = s.exercises;
  const [a, b, c] = s.workouts[0].entries[0].sets;
  assert.deepEqual(effectiveLoad(s, a, exercise, '2026-10-05'), { kg: 90, partial: false });
  assert.deepEqual(effectiveLoad(s, b, exercise, '2026-10-05'), { kg: 80, partial: false });
  assert.deepEqual(effectiveLoad(s, c, exercise, '2026-10-05'), { kg: 60, partial: false });
  assert.deepEqual(effectiveLoad(s, a, exercise, '2026-09-01'), { kg: 10, partial: true });
  assert.deepEqual(effectiveLoad(s, b, exercise, '2026-09-01'), { kg: 0, partial: true });
});

test('effectiveLoad converts a body weight and a set in lb', () => {
  const s = bodyweightState([weigh('b1', '2026-10-01', 176, 'lb')]);
  const [exercise] = s.exercises;
  const lb = 0.45359237;
  close(effectiveLoad(s, set('x', 44, 5, { unit: 'lb' }), exercise, '2026-10-05').kg, 220 * lb);
});

test('effectiveLoad of other equipment is the weight alone, and not partial', () => {
  const s = bodyweightState([weigh('b1', '2026-10-01', 80)]);
  const barbell = { ...s.exercises[0], equipment: 'barbell' };
  assert.deepEqual(effectiveLoad(s, set('x', 100, 5), barbell, '2026-10-05'), { kg: 100, partial: false });
  assert.deepEqual(effectiveLoad(s, set('x', null, 5), barbell, '2026-10-05'), { kg: 0, partial: false });
});

test('records and volume of a bodyweight exercise use the effective load', () => {
  const s = bodyweightState([weigh('b1', '2026-10-01', 80)]);
  const bests = bestsOf(s, 'pullup');
  assert.equal(bests.heaviest.set.id, 'a');
  assert.equal(bests.heaviest.value, 90);
  assert.equal(bests.bestSet.value, 450);
  close(bests.e1rm.value, 90 * (1 + 5 / 30));
  assert.equal(repMaxes(s, 'pullup')[7].weight, 80);
  assert.equal(volumeOf(s, s.workouts[0]), 450 + 640 + 360);
  assert.equal(bestsOf(bodyweightState([]), 'pullup').heaviest.value, 10);
});
