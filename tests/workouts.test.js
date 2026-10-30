import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTraining, normalizeTraining } from '#training';
import {
  openWorkout,
  startWorkout,
  startFromDay,
  nextDay,
  previousSets,
  addEntry,
  addSet,
  editSet,
  markDone,
  deleteSet,
  deleteEntry,
  moveEntry,
  setWorkoutComment,
  setWorkoutDate,
  finishWorkout,
  deleteWorkout,
  exerciseHistory,
} from '#workouts';

const DAY1 = new Date(2026, 9, 1, 18, 0);
const DAY2 = new Date(2026, 9, 3, 18, 0);
const counter = () => {
  let n = 0;
  return () => `id${++n}`;
};

const base = () => ({
  ...emptyTraining(),
  exercises: [
    { id: 'squat', name: 'Squat', categoryId: null, type: 'weight_reps', rest: null, archived: false },
    { id: 'plank', name: 'Plank', categoryId: null, type: 'time', rest: null, archived: false },
    { id: 'run', name: 'Run', categoryId: null, type: 'distance_time', rest: null, archived: false },
  ],
  routines: [
    {
      id: 'r1',
      name: 'Full body',
      created: '2026-09-01T00:00:00.000Z',
      days: [
        { id: 'a', name: 'A', items: [{ id: 'i1', exerciseId: 'squat', sets: 2, reps: 5, repsMax: null, weight: null, rest: null }] },
        { id: 'b', name: 'B', items: [{ id: 'i2', exerciseId: 'plank', sets: 1, reps: null, repsMax: null, weight: null, rest: null }] },
      ],
    },
  ],
});

// A finished workout of day A with squats of 100 kg × 5 and 90 kg × 6.
const afterDayA = () => {
  let { state } = startFromDay(base(), 'r1', 'a', DAY1, 'w1', counter());
  const [entry] = state.workouts[0].entries;
  ({ state } = editSet(state, 'w1', entry.id, entry.sets[0].id, { weight: '100' }));
  ({ state } = editSet(state, 'w1', entry.id, entry.sets[1].id, { weight: '90', reps: '6' }));
  ({ state } = markDone(state, 'w1', entry.id, entry.sets[0].id));
  ({ state } = markDone(state, 'w1', entry.id, entry.sets[1].id));
  ({ state } = finishWorkout(state, 'w1', DAY1));
  return state;
};

test('an empty workout starts on the local date with no entries, and the input stays (WO-1)', () => {
  const state = base();
  const { state: next } = startWorkout(state, DAY1, 'w1');
  assert.equal(next.workouts[0].date, '2026-10-01');
  assert.equal(next.workouts[0].finished, null);
  assert.deepEqual(next.workouts[0].entries, []);
  assert.equal(openWorkout(next).id, 'w1');
  assert.deepEqual(state, base());
  assert.notEqual(normalizeTraining(next), null);
});

test('a second workout does not start while one is open (WO-1)', () => {
  const { state } = startWorkout(base(), DAY1, 'w1');
  assert.deepEqual(startWorkout(state, DAY1), { state, error: { key: 'error.workoutOpen' } });
  assert.equal(startFromDay(state, 'r1', 'a', DAY1).error.key, 'error.workoutOpen');
});

test('a workout from a day holds its items as planned sets and keeps the names (WO-2)', () => {
  const { state } = startFromDay(base(), 'r1', 'a', DAY1, 'w1', counter());
  const [workout] = state.workouts;
  assert.equal(workout.routineName, 'Full body');
  assert.equal(workout.dayName, 'A');
  assert.equal(workout.entries.length, 1);
  assert.deepEqual(workout.entries[0].sets.map((s) => [s.reps, s.done, s.unit]), [[5, false, 'kg'], [5, false, 'kg']]);
  assert.notEqual(normalizeTraining(state), null);
});

test('a start from a missing routine or day is an error', () => {
  const state = base();
  assert.equal(startFromDay(state, 'x', 'a', DAY1).error.key, 'error.routineMissing');
  assert.equal(startFromDay(state, 'r1', 'x', DAY1).error.key, 'error.dayMissing');
});

test('planned sets take the values of the last time, and the target reps win (WO-8)', () => {
  const { state } = startFromDay(afterDayA(), 'r1', 'a', DAY2, 'w2', counter());
  const workout = state.workouts.find((w) => w.id === 'w2');
  assert.deepEqual(workout.entries[0].sets.map((s) => [s.weight, s.reps]), [[100, 5], [90, 5]]);
});

test('the finish drops sets not done and deletes a workout with none done (WO-7)', () => {
  const done = afterDayA();
  assert.equal(done.workouts[0].finished, DAY1.toISOString());
  assert.equal(done.workouts[0].entries[0].sets.length, 2);
  const { state } = startWorkout(done, DAY2, 'w2');
  const { state: added } = addEntry(state, 'w2', 'plank', 'n1', 's1');
  const result = finishWorkout(added, 'w2', DAY2);
  assert.equal(result.deleted, true);
  assert.equal(result.state.workouts.length, 1);
});

test('the next day follows the last day done, in a cycle (RT-3)', () => {
  assert.equal(nextDay(base(), 'r1').id, 'a');
  const afterA = afterDayA();
  assert.equal(nextDay(afterA, 'r1').id, 'b');
  const afterB = { ...afterA, workouts: [...afterA.workouts, { ...afterA.workouts[0], id: 'w9', dayId: 'b', date: '2026-10-02' }] };
  assert.equal(nextDay(afterB, 'r1').id, 'a');
  assert.equal(nextDay(base(), 'x'), null);
});

test('the next day skips a workout whose day is gone', () => {
  const state = afterDayA();
  const routines = [{ ...state.routines[0], days: state.routines[0].days.filter((d) => d.id !== 'a') }];
  assert.equal(nextDay({ ...state, routines }, 'r1').id, 'b');
});

test('an added exercise and a new set copy the values of the last time (WO-3, WO-8)', () => {
  let { state } = startWorkout(afterDayA(), DAY2, 'w2');
  ({ state } = addEntry(state, 'w2', 'squat', 'n1', 's1'));
  let entry = state.workouts.find((w) => w.id === 'w2').entries[0];
  assert.deepEqual([entry.sets[0].weight, entry.sets[0].reps, entry.sets[0].done], [100, 5, false]);
  ({ state } = editSet(state, 'w2', 'n1', 's1', { weight: '105' }));
  ({ state } = addSet(state, 'w2', 'n1', 's2'));
  entry = state.workouts.find((w) => w.id === 'w2').entries[0];
  assert.deepEqual(entry.sets.map((s) => s.weight), [105, 105]);
});

test('a new set of an exercise with no past is blank, in the unit of the settings', () => {
  const state = { ...base(), settings: { unit: 'lb', rest: 90 } };
  let { state: next } = startWorkout(state, DAY1, 'w1');
  ({ state: next } = addEntry(next, 'w1', 'squat', 'n1', 's1'));
  assert.deepEqual(next.workouts[0].entries[0].sets[0], { id: 's1', weight: null, unit: 'lb', reps: null, seconds: null, meters: null, done: false, comment: '' });
});

test('an edit keeps only the fields of the type and stamps the unit of the settings (WO-4, PR-8)', () => {
  let { state } = startWorkout(base(), DAY1, 'w1');
  ({ state } = addEntry(state, 'w1', 'plank', 'n1', 's1'));
  ({ state } = editSet(state, 'w1', 'n1', 's1', { seconds: '60', weight: '20', comment: ' hard ' }));
  const [set] = state.workouts[0].entries[0].sets;
  assert.deepEqual([set.seconds, set.weight, set.comment], [60, null, 'hard']);
  assert.equal(editSet(state, 'w1', 'n1', 's1', { seconds: '-1' }).error.key, 'error.numberRange');
});

test('a set with no values of its type is not done (WO-5)', () => {
  let { state } = startWorkout(base(), DAY1, 'w1');
  ({ state } = addEntry(state, 'w1', 'run', 'n1', 's1'));
  assert.equal(markDone(state, 'w1', 'n1', 's1').error.key, 'error.setIncomplete');
  ({ state } = editSet(state, 'w1', 'n1', 's1', { meters: '5000' }));
  ({ state } = markDone(state, 'w1', 'n1', 's1'));
  assert.equal(state.workouts[0].entries[0].sets[0].done, true);
  assert.equal(editSet(state, 'w1', 'n1', 's1', { meters: '' }).error.key, 'error.setIncomplete');
  assert.equal(markDone(state, 'w1', 'n1', 's1', false).state.workouts[0].entries[0].sets[0].done, false);
});

test('sets and entries are deleted and moved; a missing one is an error', () => {
  let { state } = startWorkout(base(), DAY1, 'w1');
  ({ state } = addEntry(state, 'w1', 'squat', 'n1', 's1'));
  ({ state } = addEntry(state, 'w1', 'plank', 'n2', 's2'));
  ({ state } = moveEntry(state, 'w1', 'n2', 0));
  assert.deepEqual(state.workouts[0].entries.map((e) => e.id), ['n2', 'n1']);
  ({ state } = deleteSet(state, 'w1', 'n1', 's1'));
  assert.deepEqual(state.workouts[0].entries[1].sets, []);
  ({ state } = deleteEntry(state, 'w1', 'n1'));
  assert.deepEqual(state.workouts[0].entries.map((e) => e.id), ['n2']);
  assert.equal(deleteSet(state, 'w1', 'n2', 'x').error.key, 'error.setMissing');
  assert.equal(deleteEntry(state, 'w1', 'x').error.key, 'error.entryMissing');
  assert.equal(deleteWorkout(state, 'x').error.key, 'error.workoutMissing');
  assert.equal(addEntry(state, 'w1', 'x').error.key, 'error.exerciseMissing');
});

test('a workout takes a comment and another date', () => {
  let { state } = startWorkout(base(), DAY1, 'w1');
  ({ state } = setWorkoutComment(state, 'w1', '  tired '));
  ({ state } = setWorkoutDate(state, 'w1', '2026-09-30'));
  assert.deepEqual([state.workouts[0].comment, state.workouts[0].date], ['tired', '2026-09-30']);
  assert.equal(setWorkoutDate(state, 'w1', '30/09/2026').error.key, 'error.date');
  assert.equal(setWorkoutComment(state, 'w1', 'a'.repeat(501)).error.key, 'error.commentTooLong');
});

test('the history of an exercise lists done sets, newest first (WO-10)', () => {
  const state = afterDayA();
  const history = exerciseHistory(state, 'squat');
  assert.equal(history.length, 1);
  assert.deepEqual(history[0].sets.map((s) => s.weight), [100, 90]);
  assert.deepEqual(exerciseHistory(state, 'plank'), []);
  assert.deepEqual(previousSets(state, 'squat', 'w1'), []);
});
