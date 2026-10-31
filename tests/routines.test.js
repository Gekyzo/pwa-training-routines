import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTraining, normalizeTraining } from '#training';
import { addRoutine, renameRoutine, deleteRoutine, addDay, renameDay, deleteDay, moveDay, addItem, editItem, deleteItem, moveItem, duplicateRoutine, archiveRoutine, activeRoutines, setWeekdays, todayDays, TEMPLATES, addTemplate } from '#routines';
import { SEED_EXERCISES } from '#exercises';

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
  assert.deepEqual(next.routines, [{ id: 'r1', name: 'Full body', created: NOW.toISOString(), archived: false, days: [] }]);
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
  assert.deepEqual(state.routines[0].days[0].items, [{ id: 'i1', exerciseId: 'e1', sets: 3, reps: 8, repsMax: 12, weight: 60, rest: null, rule: null }]);
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

// RT-5, RT-7, RT-8
const ids = () => {
  let n = 0;
  return () => `n${++n}`;
};
const texts = (key) => key;
const sample = () => {
  let { state } = addRoutine(base(), 'Full body', NOW, 'r1');
  ({ state } = addDay(state, 'r1', 'A', 'd1'));
  ({ state } = addItem(state, 'r1', 'd1', { exerciseId: 'e1', sets: 3, reps: 5 }, 'i1'));
  ({ state } = setWeekdays(state, 'r1', 'd1', [2, 0]));
  return state;
};

test('a routine, a day and an item start with the new fields', () => {
  const { routines: [r] } = sample();
  assert.equal(r.archived, false);
  assert.deepEqual(r.days[0].weekdays, [0, 2]);
  assert.equal(r.days[0].items[0].rule, null);
});

test('duplicate copies with new ids, the new time and the next free name', () => {
  const state = sample();
  const later = new Date('2026-11-01T10:00:00.000Z');
  const { state: one } = duplicateRoutine(state, 'r1', later, 'r2', ids());
  const copy = one.routines[1];
  assert.equal(copy.name, 'Full body (2)');
  assert.equal(copy.created, later.toISOString());
  assert.equal(copy.archived, false);
  assert.deepEqual(copy.days[0], { ...state.routines[0].days[0], id: 'n1', items: [{ ...state.routines[0].days[0].items[0], id: 'n2' }] });
  assert.deepEqual(state, sample());
  const { state: two } = duplicateRoutine(one, 'r1', later, 'r3', ids());
  assert.equal(two.routines[2].name, 'Full body (3)');
});

test('duplicate keeps the copy name within 60 characters and ignores case', () => {
  let { state } = addRoutine(base(), 'x'.repeat(60), NOW, 'r1');
  ({ state } = duplicateRoutine(state, 'r1', NOW, 'r2'));
  assert.equal(state.routines[1].name, `${'x'.repeat(56)} (2)`);
  let s2 = addRoutine(base(), 'Push', NOW, 'a').state;
  s2 = addRoutine(s2, 'push (2)', NOW, 'b').state;
  assert.equal(duplicateRoutine(s2, 'a', NOW, 'c').state.routines[2].name, 'Push (3)');
});

test('duplicate of a missing routine is refused', () => {
  assert.equal(duplicateRoutine(base(), 'zz', NOW).error.key, 'error.routineMissing');
});

test('archive and restore, and activeRoutines hides the archived', () => {
  let state = sample();
  ({ state } = archiveRoutine(state, 'r1'));
  assert.equal(state.routines[0].archived, true);
  assert.deepEqual(activeRoutines(state), []);
  ({ state } = archiveRoutine(state, 'r1', false));
  assert.equal(activeRoutines(state).length, 1);
  assert.equal(archiveRoutine(state, 'zz').error.key, 'error.routineMissing');
});

test('weekdays are deduplicated and sorted, and a bad value is refused', () => {
  const state = sample();
  assert.deepEqual(setWeekdays(state, 'r1', 'd1', [6, 1, 1]).state.routines[0].days[0].weekdays, [1, 6]);
  for (const bad of [[7], [-1], [1.5], ['1'], 'x']) assert.equal(setWeekdays(state, 'r1', 'd1', bad).error.key, 'error.weekday');
  assert.equal(setWeekdays(state, 'r1', 'zz', []).error.key, 'error.dayMissing');
  assert.deepEqual(setWeekdays(state, 'r1', 'd1', []).state.routines[0].days[0].weekdays, []);
});

test('todayDays gives the days of the local weekday, not archived', () => {
  const state = sample();
  const monday = new Date(2026, 9, 26, 12); // Monday, local time
  const sunday = new Date(2026, 9, 25, 12);
  assert.deepEqual(todayDays(state, monday).map((x) => [x.routine.id, x.day.id]), [['r1', 'd1']]);
  assert.deepEqual(todayDays(state, sunday), []);
  assert.deepEqual(todayDays(archiveRoutine(state, 'r1').state, monday), []);
});

test('every template has 2 or 3 days of 4 to 6 items of seed slugs', () => {
  const slugs = SEED_EXERCISES.map(([slug]) => slug);
  assert.deepEqual(TEMPLATES.map((t) => t.id), ['full-body', 'upper-lower', 'push-pull-legs']);
  for (const t of TEMPLATES) {
    assert.ok(t.days.length >= 2 && t.days.length <= 3);
    for (const items of t.days) {
      assert.ok(items.length >= 4 && items.length <= 6);
      for (const [slug, sets, reps, top] of items) {
        assert.ok(slugs.includes(slug));
        assert.ok(sets >= 1 && reps >= 1 && (top === null || top >= reps));
      }
    }
  }
});

test('a template adds the missing seeds and a routine that passes the doc check', () => {
  const { state } = addTemplate(emptyTraining(), 'push-pull-legs', texts, NOW, ids());
  assert.equal(state.routines.length, 1);
  assert.deepEqual(state.routines[0].days.map((d) => d.name), ['template.push-pull-legs.day.1', 'template.push-pull-legs.day.2', 'template.push-pull-legs.day.3']);
  for (const item of state.routines[0].days.flatMap((d) => d.items)) assert.ok(state.exercises.some((e) => e.id === item.exerciseId));
  assert.deepEqual(normalizeTraining(JSON.parse(JSON.stringify(state))).routines, state.routines);
});

test('a template name clash takes the suffix, and a user exercise with the seed name stands in', () => {
  const t = (key) => (key === 'seed.exercise.squat' ? 'Squat' : key);
  const first = addTemplate(base(), 'upper-lower', t, NOW, ids()).state;
  const second = addTemplate(first, 'upper-lower', t, NOW, ids()).state;
  assert.equal(second.routines[1].name, 'template.upper-lower.name (2)');
  const squat = first.routines[0].days[1].items[0].exerciseId;
  assert.equal(squat, 'e1');
  assert.equal(first.exercises.filter((e) => e.name === 'Squat').length, 1);
});

test('an unknown template is refused', () => {
  assert.equal(addTemplate(base(), 'nope', texts, NOW).error.key, 'error.templateMissing');
});

test('duplicate and template work with the default ids', () => {
  const { state } = duplicateRoutine(sample(), 'r1', NOW);
  assert.equal(new Set([state.routines[1].id, state.routines[1].days[0].id, state.routines[1].days[0].items[0].id]).size, 3);
  assert.deepEqual(state.routines[1].days[0].weekdays, [0, 2]);
  const t = addTemplate(emptyTraining(), 'full-body', texts, NOW).state;
  assert.equal(t.routines.length, 1);
});

test('a template gives the id of its new routine', () => {
  const { state, id } = addTemplate(base(), 'upper-lower', texts, NOW);
  assert.equal(state.routines.find((r) => r.id === id).name, 'template.upper-lower.name');
  assert.equal(addTemplate(base(), 'nope', texts, NOW).id, undefined);
});
