import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTraining, normalizeTraining } from '#training';
import {
  addCategory,
  editCategory,
  deleteCategory,
  addExercise,
  editExercise,
  deleteExercise,
  archiveExercise,
  canDeleteExercise,
  seedExercises,
  SEED_CATEGORIES,
  SEED_EXERCISES,
  seedExerciseId,
} from '#exercises';

const withExercise = () => ({
  ...emptyTraining(),
  categories: [{ id: 'c1', name: 'Chest' }],
  exercises: [{ id: 'e1', name: 'Bench', categoryId: 'c1', type: 'weight_reps', rest: null, archived: false }],
});

const withWorkout = () => ({
  ...withExercise(),
  workouts: [
    {
      id: 'w1', date: '2026-10-01', started: '2026-10-01T10:00:00Z', finished: null, routineId: null, dayId: null,
      routineName: '', dayName: '', comment: '', entries: [{ id: 'n1', exerciseId: 'e1', sets: [] }],
    },
  ],
});

test('a category is added trimmed, and a name taken with no regard to case is refused', () => {
  const state = withExercise();
  assert.deepEqual(addCategory(state, ' Back ', 'c2').state.categories.at(-1), { id: 'c2', name: 'Back' });
  assert.deepEqual(addCategory(state, 'chest', 'c2'), { state, error: { key: 'error.categoryTaken' } });
  assert.deepEqual(state, withExercise());
});

test('a category is renamed, and a missing one is an error', () => {
  const state = withExercise();
  assert.equal(editCategory(state, 'c1', 'Pecho').state.categories[0].name, 'Pecho');
  assert.equal(editCategory(state, 'c1', 'CHEST').error, undefined);
  assert.deepEqual(editCategory(state, 'x', 'A'), { state, error: { key: 'error.categoryMissing' } });
});

test('a category in use is not deleted (EX-3)', () => {
  const state = withExercise();
  assert.deepEqual(deleteCategory(state, 'c1'), { state, error: { key: 'error.categoryInUse' } });
  const free = addCategory(state, 'Back', 'c2').state;
  assert.equal(deleteCategory(free, 'c2').state.categories.length, 1);
});

test('an exercise is added with its type, an optional rest and no archive', () => {
  const { state } = addExercise(withExercise(), { name: 'Plank', categoryId: null, type: 'time', rest: '' }, 'e2');
  assert.deepEqual(state.exercises.at(-1), { id: 'e2', name: 'Plank', categoryId: null, type: 'time', rest: null, archived: false });
  assert.notEqual(normalizeTraining(state), null);
});

test('an exercise with a taken name, an unknown type or a missing category is refused', () => {
  const state = withExercise();
  assert.equal(addExercise(state, { name: 'bench', type: 'reps' }).error.key, 'error.exerciseTaken');
  assert.equal(addExercise(state, { name: 'Row', type: 'swim' }).error.key, 'error.exerciseType');
  assert.equal(addExercise(state, { name: 'Row', type: 'reps', categoryId: 'x' }).error.key, 'error.categoryMissing');
  assert.equal(addExercise(state, { name: 'Row', type: 'reps', rest: '900' }).error.key, 'error.numberRange');
});

test('the type of an exercise that a workout holds does not change (EX-2)', () => {
  const state = withWorkout();
  assert.deepEqual(editExercise(state, 'e1', { name: 'Bench', categoryId: 'c1', type: 'reps' }), {
    state,
    error: { key: 'error.typeLocked' },
  });
  assert.equal(editExercise(state, 'e1', { name: 'Bench press', categoryId: 'c1', type: 'weight_reps' }).state.exercises[0].name, 'Bench press');
  assert.equal(editExercise(withExercise(), 'e1', { name: 'Bench', type: 'reps' }).state.exercises[0].type, 'reps');
});

test('an exercise with history or in a routine is not deleted, others are (EX-6)', () => {
  assert.equal(deleteExercise(withWorkout(), 'e1').error.key, 'error.exerciseInUse');
  const inRoutine = {
    ...withExercise(),
    routines: [{ id: 'r', name: 'R', created: '2026-01-01T00:00:00Z', days: [{ id: 'd', name: 'A', items: [{ id: 'i', exerciseId: 'e1', sets: 3 }] }] }],
  };
  assert.equal(deleteExercise(inRoutine, 'e1').error.key, 'error.exerciseInRoutine');
  assert.equal(canDeleteExercise(inRoutine, 'e1'), false);
  assert.deepEqual(deleteExercise(withExercise(), 'e1').state.exercises, []);
  assert.equal(deleteExercise(withExercise(), 'x').error.key, 'error.exerciseMissing');
});

test('an exercise is archived and restored', () => {
  const archived = archiveExercise(withWorkout(), 'e1').state;
  assert.equal(archived.exercises[0].archived, true);
  assert.equal(archiveExercise(archived, 'e1', false).state.exercises[0].archived, false);
});

test('the seed adds each category and exercise once, with fixed ids, and the doc stays valid (EX-4)', () => {
  const nameOf = (key) => key.split('.').at(-1);
  const once = seedExercises(emptyTraining(), nameOf).state;
  assert.equal(once.categories.length, SEED_CATEGORIES.length);
  assert.equal(once.exercises.length, SEED_EXERCISES.length);
  assert.ok(once.exercises.some((e) => e.id === seedExerciseId('squat') && e.categoryId === 'seed-cat-legs'));
  assert.notEqual(normalizeTraining(once), null);
  assert.deepEqual(seedExercises(once, nameOf).state, once);
});

test('the seed skips a name that the user already has', () => {
  const state = { ...emptyTraining(), exercises: [{ id: 'mine', name: 'SQUAT', categoryId: null, type: 'reps', rest: null, archived: false }] };
  const seeded = seedExercises(state, (key) => key.split('.').at(-1)).state;
  assert.equal(seeded.exercises.filter((e) => e.name.toLowerCase() === 'squat').length, 1);
  assert.notEqual(normalizeTraining(seeded), null);
});
