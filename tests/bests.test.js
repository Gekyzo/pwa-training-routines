import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTraining } from '#training';
import { bestsOf, RECORDS } from '#bests';

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
