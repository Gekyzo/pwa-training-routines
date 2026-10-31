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
  mergeExercises,
  canDeleteExercise,
  seedExercises,
  SEED_CATEGORIES,
  SEED_EXERCISES,
  seedExerciseId,
  defaultsText,
  defaultsInput,
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
  assert.deepEqual(state.exercises.at(-1), {
    id: 'e2', name: 'Plank', categoryId: null, type: 'time', rest: null, archived: false,
    increment: null, bar: null, unit: null, equipment: null, notes: '', unilateral: false,
  });
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

test('an exercise takes increment, bar, equipment, notes and unilateral (EX-5, EX-8)', () => {
  const state = { ...withExercise(), settings: { ...emptyTraining().settings, unit: 'lb' } };
  const next = addExercise(state, {
    name: 'Row', type: 'weight_reps', increment: '2.5', bar: 45, equipment: 'barbell', notes: ' keep flat ', unilateral: true,
  }, 'e2').state.exercises.at(-1);
  assert.deepEqual(
    [next.increment, next.bar, next.unit, next.equipment, next.notes, next.unilateral],
    [2.5, 45, 'lb', 'barbell', 'keep flat', true],
  );
  const plain = addExercise(state, { name: 'Dip', type: 'reps' }, 'e3').state.exercises.at(-1);
  assert.deepEqual([plain.increment, plain.bar, plain.unit, plain.equipment, plain.notes, plain.unilateral], [null, null, null, null, '', false]);
});

test('an exercise refuses bad equipment, long notes and an increment out of range', () => {
  const state = withExercise();
  const input = { name: 'X', type: 'reps' };
  assert.equal(addExercise(state, { ...input, equipment: 'sofa' }).error.key, 'error.equipment');
  assert.equal(addExercise(state, { ...input, notes: 'a'.repeat(501) }).error.key, 'error.commentTooLong');
  assert.equal(addExercise(state, { ...input, increment: 0 }).error.key, 'error.numberRange');
  assert.equal(addExercise(state, { ...input, bar: 101 }).error.key, 'error.numberRange');
});

test('an edit keeps the fields that its input leaves out, and clears the unit with the increment', () => {
  const start = addExercise(withExercise(), { name: 'Row', type: 'weight_reps', increment: 5, equipment: 'cable' }, 'e2').state;
  const renamed = editExercise(start, 'e2', { name: 'Row 2', type: 'weight_reps' }).state.exercises.at(-1);
  assert.deepEqual([renamed.increment, renamed.unit, renamed.equipment], [5, 'kg', 'cable']);
  const cleared = editExercise(start, 'e2', { name: 'Row', type: 'weight_reps', increment: '' }).state.exercises.at(-1);
  assert.deepEqual([cleared.increment, cleared.unit], [null, null]);
});

test('weight_time and weight_distance are exercise types', () => {
  assert.ok(addExercise(withExercise(), { name: 'Carry', type: 'weight_distance' }).state);
  assert.ok(addExercise(withExercise(), { name: 'Hold', type: 'weight_time' }).state);
});

test('every seed has equipment (EX-8)', () => {
  const seeded = seedExercises(emptyTraining(), (key) => key).state;
  assert.ok(seeded.exercises.every((e) => ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'].includes(e.equipment)));
  assert.equal(seeded.exercises.find((e) => e.id === 'seed-squat').equipment, 'barbell');
});

const mergeState = () => {
  const base = withWorkout();
  return {
    ...base,
    exercises: [
      ...base.exercises,
      { ...base.exercises[0], id: 'e2', name: 'Bench 2' },
      { ...base.exercises[0], id: 'e3', name: 'Run', type: 'time' },
    ],
    routines: [{ id: 'r1', name: 'R', archived: false, days: [{ id: 'd1', name: 'D', items: [{ id: 'i1', exerciseId: 'e2', sets: 3 }] }] }],
    workouts: [{
      ...base.workouts[0],
      entries: [
        { id: 'n1', exerciseId: 'e1', sets: [], substituteFor: 'e2' },
        { id: 'n2', exerciseId: 'e2', sets: [], substituteFor: null },
      ],
    }],
    goals: [{ id: 'g1', kind: 'exercise', exerciseId: 'e2', metric: 'set', weight: 100, unit: 'kg', reps: 5, date: null, created: '2026-10-01' }],
  };
};

test('merging moves entries, substitutes, items and goals, and removes the dropped exercise (EX-7)', () => {
  const { state, error } = mergeExercises(mergeState(), 'e1', 'e2');
  assert.equal(error, undefined);
  assert.deepEqual(state.exercises.map((e) => e.id), ['e1', 'e3']);
  assert.deepEqual(state.workouts[0].entries.map((e) => [e.exerciseId, e.substituteFor]), [['e1', 'e1'], ['e1', null]]);
  assert.equal(state.routines[0].days[0].items[0].exerciseId, 'e1');
  assert.equal(state.goals[0].exerciseId, 'e1');
});

test('merging refuses a type mismatch, the same exercise and a missing one (EX-7)', () => {
  const state = mergeState();
  assert.deepEqual(mergeExercises(state, 'e1', 'e3'), { state, error: { key: 'error.typeMismatch' } });
  assert.deepEqual(mergeExercises(state, 'e1', 'e1'), { state, error: { key: 'error.mergeSame' } });
  assert.equal(mergeExercises(state, 'e1', 'zz').error.key, 'error.exerciseMissing');
  assert.equal(mergeExercises(state, 'zz', 'e1').error.key, 'error.exerciseMissing');
});

// ---- EX-9: the increment and the bar of the exercise sheet ----

test('defaultsText shows the increment and the bar in the unit of the settings, empty when unset', () => {
  assert.deepEqual(defaultsText(null, 'kg'), { increment: '', bar: '' });
  assert.deepEqual(defaultsText({ increment: 2.5, bar: null, unit: 'kg' }, 'kg'), { increment: '2.5', bar: '' });
  assert.deepEqual(defaultsText({ increment: 5, bar: 15, unit: 'kg' }, 'lb'), { increment: '11', bar: '33.1' });
});

test('defaultsInput leaves out an increment and a bar that the user did not change', () => {
  const shown = { increment: '11', bar: '33.1' };
  assert.deepEqual(defaultsInput(shown, { increment: '11', bar: '33.1' }, true), {});
  assert.deepEqual(defaultsInput(shown, { increment: '10', bar: '33.1' }, true), { increment: '10', bar: '33.1' });
  assert.deepEqual(defaultsInput(shown, { increment: '11', bar: '' }, true), { increment: '11', bar: '' });
});

test('defaultsInput sends both fields for a new exercise', () => {
  assert.deepEqual(defaultsInput({ increment: '', bar: '' }, { increment: '', bar: '' }, false), { increment: '', bar: '' });
});
