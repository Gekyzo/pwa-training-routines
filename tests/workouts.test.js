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
  groupEntries,
  ungroupEntry,
  restsAfter,
  nextInGroup,
  duration,
  autoClose,
  AUTO_CLOSE_HOURS,
  repeatWorkout,
  skipEntry,
  unskipEntry,
  substituteEntry,
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
    { id: 'hold', name: 'Hold', categoryId: null, type: 'weight_time', rest: null, archived: false },
    { id: 'carry', name: 'Carry', categoryId: null, type: 'weight_distance', rest: null, archived: false },
    { id: 'dip', name: 'Dip', categoryId: null, type: 'weight_reps', rest: null, archived: false, equipment: 'bodyweight' },
    { id: 'bench', name: 'Bench', categoryId: null, type: 'weight_reps', rest: null, archived: false },
  ],
  routines: [
    {
      id: 'r1',
      name: 'Full body',
      created: '2026-09-01T00:00:00.000Z',
      days: [
        { id: 'a', name: 'A', items: [{ id: 'i1', exerciseId: 'squat', sets: 2, reps: 5, repsMax: 8, weight: null, rest: 120 }] },
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
  ({ state } = markDone(state, 'w1', entry.id, entry.sets[0].id, true, DAY1));
  ({ state } = markDone(state, 'w1', entry.id, entry.sets[1].id, true, DAY1));
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
  assert.deepEqual(next.workouts[0].entries[0].sets[0], {
    id: 's1', weight: null, unit: 'lb', reps: null, seconds: null, meters: null, done: false, comment: '', kind: 'working', effort: null, at: null,
  });
  assert.deepEqual(next.workouts[0].entries[0], {
    id: 'n1', exerciseId: 'squat', sets: next.workouts[0].entries[0].sets, itemId: null, target: null, group: null, skipped: false, substituteFor: null,
  });
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
  ({ state } = markDone(state, 'w1', 'n1', 's1', true, DAY1));
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

test('weight_time needs seconds and weight_distance needs meters to be done (WO-5)', () => {
  let { state } = startWorkout(base(), DAY1, 'w1');
  ({ state } = addEntry(state, 'w1', 'hold', 'n1', 's1'));
  ({ state } = addEntry(state, 'w1', 'carry', 'n2', 's2'));
  ({ state } = editSet(state, 'w1', 'n1', 's1', { weight: '20' }));
  ({ state } = editSet(state, 'w1', 'n2', 's2', { weight: '40', seconds: '10' }));
  assert.equal(markDone(state, 'w1', 'n1', 's1').error.key, 'error.setIncomplete');
  assert.equal(markDone(state, 'w1', 'n2', 's2').error.key, 'error.setIncomplete');
  ({ state } = editSet(state, 'w1', 'n1', 's1', { seconds: '30' }));
  ({ state } = editSet(state, 'w1', 'n2', 's2', { meters: '25' }));
  assert.equal(markDone(state, 'w1', 'n1', 's1', true, DAY1).state.workouts[0].entries[0].sets[0].done, true);
  assert.equal(markDone(state, 'w1', 'n2', 's2', true, DAY1).state.workouts[0].entries[1].sets[0].done, true);
});

const at = (hours, minutes = 0) => new Date(2026, 9, 1, hours, minutes);
const entryOf = (state, workoutId, entryId) => state.workouts.find((w) => w.id === workoutId).entries.find((e) => e.id === entryId);

// An open workout w1 with squat (n1: s1, s2), bench (n2: s3, s4) and plank (n3: s5).
const threeEntries = () => {
  let { state } = startWorkout(base(), DAY1, 'w1');
  ({ state } = addEntry(state, 'w1', 'squat', 'n1', 's1'));
  ({ state } = addSet(state, 'w1', 'n1', 's2'));
  ({ state } = addEntry(state, 'w1', 'bench', 'n2', 's3'));
  ({ state } = addSet(state, 'w1', 'n2', 's4'));
  ({ state } = addEntry(state, 'w1', 'plank', 'n3', 's5'));
  return state;
};

test('a workout from a day keeps a copy of the targets of each item (WO-18)', () => {
  const state = { ...base(), settings: { ...base().settings, unit: 'lb' } };
  const { state: next } = startFromDay(state, 'r1', 'a', DAY1, 'w1', counter());
  const [entry] = next.workouts[0].entries;
  assert.equal(entry.itemId, 'i1');
  assert.deepEqual(entry.target, { sets: 2, reps: 5, repsMax: 8, weight: null, unit: 'lb', rest: 120 });
  assert.deepEqual([entry.group, entry.skipped, entry.substituteFor], [null, false, null]);
  assert.ok(entry.sets.every((s) => s.kind === 'working' && s.effort === null && s.at === null));
  const routines = [{ ...next.routines[0], days: [{ ...next.routines[0].days[0], items: [] }, next.routines[0].days[1]] }];
  assert.deepEqual(entryOf({ ...next, routines }, 'w1', entry.id).target.reps, 5);
  assert.notEqual(normalizeTraining(next), null);
});

test('a set takes a kind; another kind is an error (WO-11)', () => {
  let { state } = startWorkout(base(), DAY1, 'w1');
  ({ state } = addEntry(state, 'w1', 'squat', 'n1', 's1'));
  ({ state } = editSet(state, 'w1', 'n1', 's1', { kind: 'warmup' }));
  assert.equal(entryOf(state, 'w1', 'n1').sets[0].kind, 'warmup');
  assert.equal(editSet(state, 'w1', 'n1', 's1', { kind: 'heavy' }).error.key, 'error.setKind');
  ({ state } = addSet(state, 'w1', 'n1', 's2'));
  assert.equal(entryOf(state, 'w1', 'n1').sets[1].kind, 'working');
});

test('the effort follows the scale of the settings, and is refused with none (WO-12)', () => {
  let { state } = startWorkout(base(), DAY1, 'w1');
  ({ state } = addEntry(state, 'w1', 'squat', 'n1', 's1'));
  assert.equal(editSet(state, 'w1', 'n1', 's1', { effort: '8' }).error.key, 'error.effortOff');
  const rpe = { ...state, settings: { ...state.settings, effort: 'rpe' } };
  assert.equal(entryOf(editSet(rpe, 'w1', 'n1', 's1', { effort: '8,5' }).state, 'w1', 'n1').sets[0].effort, 8.5);
  assert.equal(entryOf(editSet(rpe, 'w1', 'n1', 's1', { effort: '' }).state, 'w1', 'n1').sets[0].effort, null);
  assert.deepEqual(editSet(rpe, 'w1', 'n1', 's1', { effort: '5' }).error, { key: 'error.numberRange', params: { min: 6, max: 10 } });
  assert.equal(editSet(rpe, 'w1', 'n1', 's1', { effort: '7.3' }).error.key, 'error.numberRange');
  const rir = { ...state, settings: { ...state.settings, effort: 'rir' } };
  assert.equal(entryOf(editSet(rir, 'w1', 'n1', 's1', { effort: '0' }).state, 'w1', 'n1').sets[0].effort, 0);
  assert.deepEqual(editSet(rir, 'w1', 'n1', 's1', { effort: '1.5' }).error, { key: 'error.numberRange', params: { min: 0, max: 10 } });
});

test('a negative weight is a set with help, only for a bodyweight exercise (WO-13)', () => {
  let { state } = startWorkout(base(), DAY1, 'w1');
  ({ state } = addEntry(state, 'w1', 'dip', 'n1', 's1'));
  ({ state } = addEntry(state, 'w1', 'squat', 'n2', 's2'));
  ({ state } = editSet(state, 'w1', 'n1', 's1', { weight: '-20' }));
  assert.equal(entryOf(state, 'w1', 'n1').sets[0].weight, -20);
  assert.deepEqual(editSet(state, 'w1', 'n2', 's2', { weight: '-20' }).error, { key: 'error.numberRange', params: { min: 0, max: 1000 } });
  assert.notEqual(normalizeTraining(state), null);
});

test('a done set has the time of the mark, and an undone set has none (WO-14)', () => {
  let { state } = startWorkout(base(), DAY1, 'w1');
  ({ state } = addEntry(state, 'w1', 'plank', 'n1', 's1'));
  ({ state } = editSet(state, 'w1', 'n1', 's1', { seconds: '30' }));
  ({ state } = markDone(state, 'w1', 'n1', 's1', true, at(18, 5)));
  assert.equal(entryOf(state, 'w1', 'n1').sets[0].at, at(18, 5).toISOString());
  ({ state } = markDone(state, 'w1', 'n1', 's1', false, at(18, 6)));
  assert.deepEqual([entryOf(state, 'w1', 'n1').sets[0].done, entryOf(state, 'w1', 'n1').sets[0].at], [false, null]);
});

test('the duration runs from the first done set to the finish, or to the last set after a late finish (WO-14)', () => {
  const sets = (...times) => times.map((time, i) => ({ id: `s${i}`, done: time !== null, at: time && time.toISOString() }));
  const workout = (finished, entrySets) => ({ started: at(17).toISOString(), finished: finished && finished.toISOString(), entries: [{ id: 'n1', sets: entrySets }] });
  assert.equal(duration(workout(at(19), sets(at(18), at(18, 30)))), 3600);
  assert.equal(duration(workout(at(23), sets(at(18), at(18, 30)))), 1800);
  assert.equal(duration(workout(null, sets(at(18), at(18, 30), null))), 1800);
  assert.equal(duration(workout(at(18), sets(null))), 3600);
  assert.equal(duration(workout(null, sets(null))), null);
  assert.equal(duration(workout(null, [])), null);
});

test('an open workout whose last set is over 4 hours old finishes at that set (WO-14)', () => {
  assert.equal(AUTO_CLOSE_HOURS, 4);
  let state = threeEntries();
  ({ state } = editSet(state, 'w1', 'n1', 's1', { reps: '5' }));
  ({ state } = markDone(state, 'w1', 'n1', 's1', true, at(18)));
  assert.equal(autoClose(state, at(22)).state, state);
  const { state: closed } = autoClose(state, at(22, 1));
  assert.equal(closed.workouts[0].finished, at(18).toISOString());
  assert.deepEqual(closed.workouts[0].entries.map((e) => e.id), ['n1']);
  const empty = startWorkout(base(), DAY1, 'w9').state;
  assert.equal(autoClose(empty, at(23, 59)).state, empty);
});

test('entries join a superset and stay next to each other; a group of one ends (WO-15)', () => {
  let state = threeEntries();
  assert.equal(groupEntries(state, 'w1', ['n1'], 'g1').error.key, 'error.groupSize');
  assert.equal(groupEntries(state, 'w1', ['n1', 'n1'], 'g1').error.key, 'error.groupSize');
  assert.equal(groupEntries(state, 'w1', ['n1', 'x'], 'g1').error.key, 'error.entryMissing');
  ({ state } = groupEntries(state, 'w1', ['n3', 'n1'], 'g1'));
  const workout = () => state.workouts[0];
  assert.deepEqual(workout().entries.map((e) => [e.id, e.group]), [['n1', 'g1'], ['n3', 'g1'], ['n2', null]]);
  assert.deepEqual([restsAfter(workout(), 'n1'), restsAfter(workout(), 'n3'), restsAfter(workout(), 'n2')], [false, true, true]);
  ({ state } = groupEntries(state, 'w1', ['n3', 'n2'], 'g2'));
  assert.deepEqual(workout().entries.map((e) => [e.id, e.group]), [['n1', null], ['n3', 'g2'], ['n2', 'g2']]);
  ({ state } = ungroupEntry(state, 'w1', 'n2'));
  assert.deepEqual(workout().entries.map((e) => e.group), [null, null, null]);
  ({ state } = groupEntries(state, 'w1', ['n1', 'n2'], 'g3'));
  ({ state } = deleteEntry(state, 'w1', 'n2'));
  assert.deepEqual(workout().entries.map((e) => e.group), [null, null]);
  assert.notEqual(normalizeTraining(state), null);
});

test('the next set of a superset alternates between its entries (WO-15)', () => {
  let state = threeEntries();
  ({ state } = groupEntries(state, 'w1', ['n1', 'n2'], 'g1'));
  const workout = () => state.workouts[0];
  assert.equal(nextInGroup(workout(), 'n1'), 'n2');
  assert.equal(nextInGroup(workout(), 'n2'), 'n1');
  assert.equal(nextInGroup(workout(), 'n3'), null);
  for (const [entryId, setId] of [['n2', 's3'], ['n2', 's4']]) {
    ({ state } = editSet(state, 'w1', entryId, setId, { reps: '5' }));
    ({ state } = markDone(state, 'w1', entryId, setId, true, DAY1));
  }
  assert.equal(nextInGroup(workout(), 'n1'), 'n1');
  assert.equal(nextInGroup(workout(), 'n2'), 'n1');
  for (const setId of ['s1', 's2']) {
    ({ state } = editSet(state, 'w1', 'n1', setId, { reps: '5' }));
    ({ state } = markDone(state, 'w1', 'n1', setId, true, DAY1));
  }
  assert.equal(nextInGroup(workout(), 'n1'), null);
});

test('a workout repeats as not done sets, with or without the values (WO-16)', () => {
  let state = threeEntries();
  ({ state } = groupEntries(state, 'w1', ['n1', 'n2'], 'g1'));
  ({ state } = editSet(state, 'w1', 'n1', 's1', { weight: '100', reps: '5', kind: 'warmup', comment: 'easy' }));
  ({ state } = editSet(state, 'w1', 'n2', 's3', { weight: '60', reps: '8' }));
  ({ state } = markDone(state, 'w1', 'n1', 's1', true, DAY1));
  ({ state } = markDone(state, 'w1', 'n2', 's3', true, DAY1));
  assert.equal(repeatWorkout(state, 'w1', '2026-10-03', {}, DAY2).error.key, 'error.workoutOpen');
  ({ state } = finishWorkout(state, 'w1', DAY1));
  assert.equal(repeatWorkout(state, 'x', '2026-10-03', {}, DAY2).error.key, 'error.workoutMissing');
  assert.equal(repeatWorkout(state, 'w1', '3/10/2026', {}, DAY2).error.key, 'error.date');
  const { state: again } = repeatWorkout(state, 'w1', '2026-10-03', {}, DAY2, 'w2', counter());
  const copy = again.workouts.find((w) => w.id === 'w2');
  assert.deepEqual([copy.date, copy.finished, copy.started], ['2026-10-03', null, DAY2.toISOString()]);
  assert.deepEqual(copy.entries.map((e) => e.exerciseId), ['squat', 'bench']);
  const [group] = new Set(copy.entries.map((e) => e.group));
  assert.ok(group && group !== 'g1' && copy.entries.every((e) => e.group === group));
  assert.deepEqual(copy.entries[0].sets.map((s) => [s.weight, s.reps, s.kind, s.done, s.comment, s.at]), [[100, 5, 'warmup', false, '', null]]);
  assert.notEqual(normalizeTraining(again), null);
  const { state: blank } = repeatWorkout(state, 'w1', '2026-10-03', { values: false }, DAY2, 'w2', counter());
  const [set] = blank.workouts.find((w) => w.id === 'w2').entries[0].sets;
  assert.deepEqual([set.weight, set.reps, set.kind, set.unit], [null, null, 'warmup', 'kg']);
});

test('a skipped exercise drops its sets and stays at the finish (WO-17)', () => {
  let state = threeEntries();
  ({ state } = editSet(state, 'w1', 'n1', 's1', { reps: '5' }));
  ({ state } = markDone(state, 'w1', 'n1', 's1', true, DAY1));
  assert.equal(skipEntry(state, 'w1', 'n1').error.key, 'error.entryHasDone');
  assert.equal(skipEntry(state, 'w1', 'x').error.key, 'error.entryMissing');
  ({ state } = skipEntry(state, 'w1', 'n2'));
  assert.deepEqual([entryOf(state, 'w1', 'n2').skipped, entryOf(state, 'w1', 'n2').sets], [true, []]);
  const { state: back } = unskipEntry(state, 'w1', 'n2');
  assert.equal(entryOf(back, 'w1', 'n2').skipped, false);
  ({ state } = finishWorkout(state, 'w1', DAY1));
  assert.deepEqual(state.workouts[0].entries.map((e) => [e.id, e.skipped]), [['n1', false], ['n2', true]]);
  assert.notEqual(normalizeTraining(state), null);
});

test('a substitute keeps the target, and keeps the values only for the same type (WO-17)', () => {
  let { state } = startFromDay(base(), 'r1', 'a', DAY1, 'w1', counter());
  const [entry] = state.workouts[0].entries;
  ({ state } = editSet(state, 'w1', entry.id, entry.sets[0].id, { weight: '100' }));
  ({ state } = substituteEntry(state, 'w1', entry.id, 'bench'));
  let next = entryOf(state, 'w1', entry.id);
  assert.deepEqual([next.exerciseId, next.substituteFor, next.target.reps], ['bench', 'squat', 5]);
  assert.deepEqual(next.sets.map((s) => [s.weight, s.reps]), [[100, 5], [null, 5]]);
  ({ state } = substituteEntry(state, 'w1', entry.id, 'plank'));
  next = entryOf(state, 'w1', entry.id);
  assert.deepEqual([next.exerciseId, next.substituteFor], ['plank', 'squat']);
  assert.deepEqual(next.sets.map((s) => [s.id, s.weight, s.reps, s.seconds]), [[entry.sets[0].id, null, null, null], [entry.sets[1].id, null, null, null]]);
  ({ state } = substituteEntry(state, 'w1', entry.id, 'squat'));
  assert.equal(entryOf(state, 'w1', entry.id).substituteFor, null);
  assert.equal(substituteEntry(state, 'w1', entry.id, 'x').error.key, 'error.exerciseMissing');
  ({ state } = editSet(state, 'w1', entry.id, entry.sets[0].id, { reps: '5' }));
  ({ state } = markDone(state, 'w1', entry.id, entry.sets[0].id, true, DAY1));
  assert.equal(substituteEntry(state, 'w1', entry.id, 'plank').error.key, 'error.entryHasDone');
  assert.equal(substituteEntry(state, 'w1', entry.id, 'bench').error, undefined);
  assert.notEqual(normalizeTraining(state), null);
});

test('a substitute that is not for bodyweight drops a negative weight (WO-17)', () => {
  let { state } = startWorkout(base(), DAY1, 'w1');
  ({ state } = addEntry(state, 'w1', 'dip', 'n1', 's1'));
  ({ state } = editSet(state, 'w1', 'n1', 's1', { weight: '-10', reps: '8' }));
  ({ state } = substituteEntry(state, 'w1', 'n1', 'bench'));
  assert.deepEqual(entryOf(state, 'w1', 'n1').sets.map((s) => [s.weight, s.reps]), [[null, 8]]);
});
