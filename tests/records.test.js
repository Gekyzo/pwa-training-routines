import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRecords, fromRecords, diffRecords, recordKey, KINDS } from '#records';
import { emptyTraining, normalizeTraining } from '#training';

const set = (over = {}) => ({ id: 's1', weight: 60, unit: 'kg', reps: 5, seconds: null, meters: null, done: true, comment: '', ...over });

const full = () => ({
  version: 1,
  settings: { unit: 'lb', rest: 120 },
  categories: [{ id: 'c1', name: 'Chest' }],
  exercises: [
    { id: 'e2', name: 'Squat', categoryId: null, type: 'weight_reps', rest: null, archived: false },
    { id: 'e1', name: 'Bench press', categoryId: 'c1', type: 'weight_reps', rest: 60, archived: false },
  ],
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

// The lists of a doc in the order of their ids, as fromRecords gives them.
const byId = (doc) => {
  const sort = (list) => [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
  return { ...doc, categories: sort(doc.categories), exercises: sort(doc.exercises), routines: sort(doc.routines), workouts: sort(doc.workouts) };
};

test('the kinds are the four lists and the settings', () => {
  assert.deepEqual(KINDS, ['category', 'exercise', 'routine', 'workout', 'settings']);
});

test('toRecords gives one record for each entity and one settings record (SYNC-1)', () => {
  const records = toRecords(full());
  assert.deepEqual([...records.keys()].sort(), ['category:c1', 'exercise:e1', 'exercise:e2', 'routine:r1', 'settings:settings', 'workout:w1']);
  assert.deepEqual(records.get('settings:settings'), { kind: 'settings', key: 'settings', data: { unit: 'lb', rest: 120 } });
  assert.deepEqual(records.get(recordKey('category', 'c1')), { kind: 'category', key: 'c1', data: { name: 'Chest' } });
});

test('the data of a record is the entity without its id, and carries no position', () => {
  const data = toRecords(full()).get('exercise:e1').data;
  assert.equal('id' in data, false);
  assert.equal('position' in data, false);
  assert.equal(data.name, 'Bench press');
});

test('toRecords leaves the doc unchanged', () => {
  const doc = full();
  toRecords(doc).get('settings:settings').data.unit = 'kg';
  assert.deepEqual(doc, full());
});

test('the empty doc has only the settings record', () => {
  assert.deepEqual([...toRecords(emptyTraining()).keys()], ['settings:settings']);
});

test('fromRecords of toRecords gives the same doc, each list by id', () => {
  assert.deepEqual(fromRecords(toRecords(full())), byId(normalizeTraining(full())));
});

test('fromRecords takes the records in any order', () => {
  const records = [...toRecords(full()).entries()].reverse();
  assert.deepEqual(fromRecords(new Map(records)), byId(full()));
});

test('fromRecords with no settings record gives the default settings', () => {
  const records = toRecords(full());
  records.delete('settings:settings');
  assert.deepEqual(fromRecords(records).settings, emptyTraining().settings);
});

test('the id of a record is its key, also when its data holds another id', () => {
  const records = toRecords(full());
  records.set('category:c1', { kind: 'category', key: 'c1', data: { id: 'other', name: 'Chest' } });
  assert.deepEqual(fromRecords(records).categories, [{ id: 'c1', name: 'Chest' }]);
});

test('fromRecords gives null when the validation refuses the records', () => {
  const records = toRecords(full());
  records.set('category:c2', { kind: 'category', key: 'c2', data: { name: 'chest' } });
  assert.equal(fromRecords(records), null);
});

test('diffRecords of equal maps is empty', () => {
  assert.deepEqual(diffRecords(toRecords(full()), toRecords(full())), []);
});

test('diffRecords gives the deletes first, then the upserts, each by record id', () => {
  const next = full();
  next.categories = [];
  next.exercises[1] = { ...next.exercises[1], name: 'Bench' };
  next.workouts = [];
  next.routines.push({ id: 'r0', name: 'Pull', created: '2026-10-03T10:00:00.000Z', days: [] });
  const changes = diffRecords(toRecords(full()), toRecords(next));
  assert.deepEqual(changes.map(({ kind, key, op }) => `${op} ${kind}:${key}`), [
    'delete category:c1',
    'delete workout:w1',
    'upsert exercise:e1',
    'upsert routine:r0',
  ]);
  assert.equal('data' in changes[0], false);
  assert.equal(changes[2].data.name, 'Bench');
});

test('diffRecords of a doc with its lists in another order is empty', () => {
  assert.deepEqual(diffRecords(toRecords(full()), toRecords(byId(full()))), []);
});

test('diffRecords ignores the order of the keys of data', () => {
  const a = new Map([['category:x', { kind: 'category', key: 'x', data: { p: 1, q: { r: 2, s: 3 } } }]]);
  const b = new Map([['category:x', { kind: 'category', key: 'x', data: { q: { s: 3, r: 2 }, p: 1 } }]]);
  assert.deepEqual(diffRecords(a, b), []);
});
