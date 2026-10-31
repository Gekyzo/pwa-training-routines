import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTraining, normalizeTraining } from '#training';
import { BACKUP_KEY, mergeDocs, backupDue, normalizeBackupInfo, workoutText } from '#backup';

const set = (id, extra) => ({ id, weight: null, unit: 'kg', reps: null, seconds: null, meters: null, done: true, comment: '', kind: 'working', effort: null, at: null, ...extra });
const ex = (id, name, extra) => ({ id, name, categoryId: null, type: 'weight_reps', rest: null, archived: false, ...extra });
const workout = (id, entries, extra) => ({
  id, date: '2026-10-01', started: '2026-10-01T10:00:00.000Z', finished: '2026-10-01T11:00:00.000Z', routineId: null, dayId: null,
  routineName: '', dayName: '', comment: '', entries, ...extra,
});
const entry = (id, exerciseId, sets) => ({ id, exerciseId, sets, itemId: null, target: null, group: null, skipped: false, substituteFor: null });

const current = () => ({
  ...emptyTraining(),
  categories: [{ id: 'c1', name: 'Legs' }],
  exercises: [ex('e1', 'Squat', { categoryId: 'c1' })],
  workouts: [workout('w1', [])],
});

test('merge adds entities with new ids and keeps the settings', () => {
  const incoming = {
    ...emptyTraining(),
    settings: { ...emptyTraining().settings, unit: 'lb' },
    categories: [{ id: 'c1', name: 'Other' }, { id: 'c2', name: 'Back' }],
    exercises: [ex('e1', 'Changed'), ex('e2', 'Row', { categoryId: 'c2' })],
    workouts: [workout('w1', []), workout('w2', [entry('n', 'e2', [set('s', { weight: 1, reps: 1 })])])],
    bodies: [{ id: 'b', date: '2026-10-01', measure: 'weight', value: 80, unit: 'kg' }],
    goals: [{ id: 'g', kind: 'body', exerciseId: null, metric: null, weight: 70, unit: 'kg', reps: null, date: null, created: '2026-10-01T00:00:00.000Z' }],
  };
  const { state, added, skipped } = mergeDocs(current(), incoming);
  assert.deepEqual(added, { categories: 1, exercises: 1, routines: 0, workouts: 1, bodies: 1, goals: 1 });
  assert.equal(skipped, 0);
  assert.equal(state.settings.unit, 'kg');
  assert.equal(state.exercises.find((e) => e.id === 'e1').name, 'Squat');
  assert.ok(normalizeTraining(state));
});

test('a name clash is skipped, counted, and references point to the doc entity', () => {
  const incoming = {
    ...emptyTraining(),
    categories: [{ id: 'x1', name: 'legs' }],
    exercises: [ex('x2', ' SQUAT ', { categoryId: 'x1' }), ex('x3', 'Lunge', { categoryId: 'x1' })],
    routines: [{ id: 'r', name: 'A', created: '2026-10-01T00:00:00.000Z', archived: false, days: [{ id: 'd', name: 'D', items: [{ id: 'i', exerciseId: 'x2', sets: 3 }] }] }],
    workouts: [workout('w9', [entry('n', 'x2', [])])],
    goals: [{ id: 'g', kind: 'exercise', exerciseId: 'x2', metric: 'e1rm', weight: 100, unit: 'kg', reps: null, date: null, created: '2026-10-01T00:00:00.000Z' }],
  };
  const cur = { ...current(), routines: [{ id: 'r0', name: 'a', created: '2026-09-01T00:00:00.000Z', days: [] }] };
  const { state, added, skipped } = mergeDocs(cur, incoming);
  assert.equal(skipped, 3);
  assert.deepEqual([added.categories, added.exercises, added.routines], [0, 1, 0]);
  assert.equal(state.exercises.find((e) => e.id === 'x3').categoryId, 'c1');
  assert.equal(state.workouts.find((w) => w.id === 'w9').entries[0].exerciseId, 'e1');
  assert.equal(state.goals[0].exerciseId, 'e1');
});

test('merging a doc into itself adds nothing', () => {
  const { state, added, skipped } = mergeDocs(current(), current());
  assert.deepEqual(Object.values(added), [0, 0, 0, 0, 0, 0]);
  assert.equal(skipped, 0);
  assert.deepEqual(state, current());
});

const NOW = new Date('2026-12-01T10:00:00.000Z');
const info = (lastExport, workoutsAtExport) => ({ lastExport, workoutsAtExport });

test('the reminder: never with no finished workout', () => {
  assert.equal(backupDue(null, 0, NOW), false);
  assert.equal(backupDue(info('2020-01-01T00:00:00.000Z', 0), 0, NOW), false);
});

test('the reminder with no export needs 10 finished workouts', () => {
  assert.equal(backupDue(null, 9, NOW), false);
  assert.equal(backupDue(null, 10, NOW), true);
  assert.equal(backupDue('garbage', 10, NOW), true);
});

test('the reminder after an export: 10 more workouts, or 30 days and one more', () => {
  const last = '2026-11-01T10:00:00.000Z';
  assert.equal(backupDue(info('2026-11-20T10:00:00.000Z', 20), 29, NOW), false);
  assert.equal(backupDue(info('2026-11-20T10:00:00.000Z', 20), 30, NOW), true);
  assert.equal(backupDue(info('2026-11-01T10:00:01.000Z', 20), 21, NOW), false);
  assert.equal(backupDue(info(last, 20), 21, NOW), true);
  assert.equal(backupDue(info(last, 20), 20, NOW), false);
});

test('the backup info normalizes', () => {
  const ok = info('2026-11-01T10:00:00.000Z', 3);
  assert.deepEqual(normalizeBackupInfo({ ...ok, extra: 1 }), ok);
  for (const bad of [null, 3, [], {}, info('x', 1), info(ok.lastExport, -1), info(ok.lastExport, 1.5), info(5, 1)]) {
    assert.equal(normalizeBackupInfo(bad), null);
  }
  assert.match(BACKUP_KEY, /\.backup$/);
});

test('the text of a workout', () => {
  const s = {
    ...current(),
    exercises: [ex('e1', 'Squat'), ex('e2', 'Run', { type: 'distance_time' })],
    workouts: [workout('w', [
      entry('a', 'e1', [set('1', { weight: 100, reps: 5 }), set('2', { weight: 100, reps: 5, done: false }), set('3', { weight: 220.5, unit: 'lb', reps: 3 })]),
      entry('b', 'e2', [set('4', { meters: 5000, seconds: 1530 })]),
      entry('c', 'e1', [set('5', { done: false })]),
    ], { routineName: 'Legs', dayName: 'A', comment: 'Good' })],
  };
  const t = (key) => key;
  assert.equal(
    workoutText(s, 'w', t, 'kg'),
    'Legs · A\n2026-10-01\n\nSquat\n1. 100 kg × 5\n2. 100 kg × 3\n\nRun\n1. 5000 m × 25:30\n\nGood',
  );
  assert.equal(workoutText(s, 'w', t, 'lb').split('\n')[4], '1. 220.5 lb × 5');
  assert.equal(workoutText(s, 'nope', t, 'kg'), '');
  assert.equal(workoutText({ ...s, workouts: [workout('w', [])] }, 'w', t, 'kg'), 'workout.free\n2026-10-01');
});
