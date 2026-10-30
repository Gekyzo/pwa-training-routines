import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTraining, normalizeTraining } from '#training';
import { addRoutine, renameRoutine, deleteRoutine, addDay, renameDay, deleteDay, moveDay, addItem, editItem, deleteItem, moveItem } from '#routines';

const NOW = new Date('2026-10-31T10:00:00.000Z');

const base = () => ({
  ...emptyTraining(),
  exercises: [
    { id: 'e1', name: 'Squat', categoryId: null, type: 'weight_reps', rest: null, archived: false },
    { id: 'e2', name: 'Plank', categoryId: null, type: 'time', rest: null, archived: false },
  ],
});

const withDay = () => {
  let { state } = addRoutine(base(), 'Full body', NOW, 'r1');
  ({ state } = addDay(state, 'r1', 'A', 'd1'));
  return state;
};

test('a routine is added with its creation time and no days, and the input stays', () => {
  const state = base();
  const { state: next } = addRoutine(state, ' Full body ', NOW, 'r1');
  assert.deepEqual(next.routines, [{ id: 'r1', name: 'Full body', created: NOW.toISOString(), days: [] }]);
  assert.deepEqual(state, base());
});

test('a routine name taken with no regard to case is refused', () => {
  const state = withDay();
  assert.deepEqual(addRoutine(state, 'FULL BODY', NOW), { state, error: { key: 'error.routineTaken' } });
  assert.equal(renameRoutine(state, 'r1', 'full body').error, undefined);
});

test('a missing routine, day or item is an error and nothing changes', () => {
  const state = withDay();
  assert.deepEqual(renameRoutine(state, 'x', 'B'), { state, error: { key: 'error.routineMissing' } });
  assert.deepEqual(addDay(state, 'x', 'B'), { state, error: { key: 'error.routineMissing' } });
  assert.deepEqual(renameDay(state, 'r1', 'x', 'B'), { state, error: { key: 'error.dayMissing' } });
  assert.deepEqual(deleteItem(state, 'r1', 'd1', 'x'), { state, error: { key: 'error.itemMissing' } });
});

test('days are added, renamed, moved and deleted; a day name is unique in its routine', () => {
  let state = withDay();
  ({ state } = addDay(state, 'r1', 'B', 'd2'));
  assert.equal(addDay(state, 'r1', 'b').error.key, 'error.dayTaken');
  ({ state } = renameDay(state, 'r1', 'd2', 'Legs'));
  ({ state } = moveDay(state, 'r1', 'd2', 0));
  assert.deepEqual(state.routines[0].days.map((d) => d.name), ['Legs', 'A']);
  ({ state } = moveDay(state, 'r1', 'd2', 99));
  assert.deepEqual(state.routines[0].days.map((d) => d.id), ['d1', 'd2']);
  ({ state } = deleteDay(state, 'r1', 'd1'));
  assert.deepEqual(state.routines[0].days.map((d) => d.id), ['d2']);
});

test('an item takes sets, reps or a range, an optional weight and rest (RT-1)', () => {
  const { state } = addItem(withDay(), 'r1', 'd1', { exerciseId: 'e1', sets: '3', reps: '8', repsMax: '12', weight: '60', rest: '' }, 'i1');
  assert.deepEqual(state.routines[0].days[0].items, [{ id: 'i1', exerciseId: 'e1', sets: 3, reps: 8, repsMax: 12, weight: 60, rest: null }]);
  assert.notEqual(normalizeTraining(state), null);
});

test('an item with a top below its reps, a top with no reps, no sets or an unknown exercise is refused', () => {
  const state = withDay();
  assert.equal(addItem(state, 'r1', 'd1', { exerciseId: 'e1', sets: 3, reps: 10, repsMax: 8 }).error.key, 'error.repsRange');
  assert.equal(addItem(state, 'r1', 'd1', { exerciseId: 'e1', sets: 3, repsMax: 8 }).error.key, 'error.repsRange');
  assert.equal(addItem(state, 'r1', 'd1', { exerciseId: 'e1', sets: '' }).error.key, 'error.numberRequired');
  assert.equal(addItem(state, 'r1', 'd1', { exerciseId: 'e1', sets: 21 }).error.key, 'error.numberRange');
  assert.equal(addItem(state, 'r1', 'd1', { exerciseId: 'x', sets: 3 }).error.key, 'error.exerciseMissing');
});

test('an item is edited, moved and deleted', () => {
  let state = withDay();
  ({ state } = addItem(state, 'r1', 'd1', { exerciseId: 'e1', sets: 3, reps: 5 }, 'i1'));
  ({ state } = addItem(state, 'r1', 'd1', { exerciseId: 'e2', sets: 2 }, 'i2'));
  ({ state } = editItem(state, 'r1', 'd1', 'i1', { exerciseId: 'e1', sets: 5, reps: 5 }));
  assert.equal(state.routines[0].days[0].items[0].sets, 5);
  ({ state } = moveItem(state, 'r1', 'd1', 'i2', 0));
  assert.deepEqual(state.routines[0].days[0].items.map((i) => i.id), ['i2', 'i1']);
  ({ state } = deleteItem(state, 'r1', 'd1', 'i2'));
  assert.deepEqual(state.routines[0].days[0].items.map((i) => i.id), ['i1']);
});

test('a deleted routine leaves its workouts alone', () => {
  const state = { ...withDay(), workouts: [{ id: 'w1', routineId: 'r1', routineName: 'Full body' }] };
  const { state: next } = deleteRoutine(state, 'r1');
  assert.deepEqual(next.routines, []);
  assert.deepEqual(next.workouts, state.workouts);
});
