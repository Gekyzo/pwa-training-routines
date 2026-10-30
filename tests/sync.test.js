import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, mergePulled, validRecord, checkRecords, dedupe, cursorOf } from '#sync';
import { recordKey, fromRecords } from '#records';

const rec = (kind, key, data = {}) => ({ kind, key, data });
const category = (key, name) => rec('category', key, { name });
const exercise = (key, name) => rec('exercise', key, { name, categoryId: null, type: 'reps', rest: null, archived: false });
const routine = (key, name) => rec('routine', key, { name, created: '2026-10-01T10:00:00.000Z', days: [] });
const workout = (key, exerciseId) =>
  rec('workout', key, {
    date: '2026-10-02', started: '2026-10-02T18:00:00.000Z', finished: null, routineId: 'gone', dayId: 'gone',
    routineName: 'Push', dayName: 'A', comment: '',
    entries: [{ id: 'n1', exerciseId, sets: [{ id: 's1', weight: null, unit: 'kg', reps: 5, seconds: null, meters: null, done: true, comment: '' }] }],
  });
const serverRec = (base, updated, deleted = false) => ({ ...base, id: `pb-${base.key}`, deleted, updated });
const mapOf = (recs) => new Map(recs.map((r) => [recordKey(r.kind, r.key), r]));

test('enqueue keeps one change per record, the last one, at the end', () => {
  const queue = [
    { kind: 'exercise', key: 'a', op: 'upsert', data: { n: 1 } },
    { kind: 'exercise', key: 'b', op: 'upsert', data: { n: 2 } },
  ];
  const next = enqueue(queue, [{ kind: 'exercise', key: 'a', op: 'delete' }, { kind: 'routine', key: 'a', op: 'upsert', data: {} }]);
  assert.deepEqual(next.map((c) => `${c.kind}:${c.key}:${c.op}`), ['exercise:b:upsert', 'exercise:a:delete', 'routine:a:upsert']);
  assert.equal(queue.length, 2);
});

test('mergePulled takes a pulled record that has no queued change, with no server fields', () => {
  const pulled = [serverRec(category('c1', 'Chest'), '2026-10-24 07:00:00.000Z')];
  const { local, server } = mergePulled({ local: new Map(), server: new Map(), queue: [], pulled });
  assert.deepEqual(local.get('category:c1'), category('c1', 'Chest'));
  assert.equal(server.get('category:c1').id, 'pb-c1');
});

test('mergePulled keeps a local record whose change is still queued (SYNC-5)', () => {
  const mine = category('c1', 'Mine');
  const local = mapOf([mine]);
  const queue = [{ kind: 'category', key: 'c1', op: 'upsert', data: mine.data }];
  const pulled = [serverRec(category('c1', 'Theirs'), '2026-10-24 07:00:00.000Z')];
  const merged = mergePulled({ local, server: new Map(), queue, pulled });
  assert.equal(merged.local.get('category:c1').data.name, 'Mine');
  assert.equal(merged.server.get('category:c1').data.name, 'Theirs');
});

test('mergePulled removes a record pulled as deleted and leaves its inputs alone (SYNC-6)', () => {
  const local = mapOf([category('c1', 'Chest'), category('c2', 'Back')]);
  const pulled = [serverRec(category('c1', 'Chest'), '2026-10-24 07:00:00.000Z', true)];
  const merged = mergePulled({ local, server: new Map(), queue: [], pulled });
  assert.deepEqual([...merged.local.keys()], ['category:c2']);
  assert.equal(merged.server.get('category:c1').deleted, true);
  assert.equal(local.size, 2);
});

test('a record is valid alone, also with a reference to an entity that is not there (TRN-5)', () => {
  assert.equal(validRecord(workout('w1', 'missing')), true);
  assert.equal(validRecord(exercise('e1', 'Squat')), true);
  assert.equal(validRecord(rec('settings', 'settings', { unit: 'lb', rest: 60 })), true);
});

test('a record of an unknown kind, a bad entity or a settings record of another key is not valid', () => {
  assert.equal(validRecord(rec('note', 'n1', { text: 'x' })), false);
  assert.equal(validRecord(category('c1', '')), false);
  assert.equal(validRecord(rec('exercise', 'e1', { name: 'Squat', type: 'yoga' })), false);
  assert.equal(validRecord(rec('category', 'x'.repeat(65), { name: 'Long' })), false);
  assert.equal(validRecord(rec('category', 'c1', null)), false);
  assert.equal(validRecord(rec('settings', 'other', {})), false);
  assert.equal(validRecord(null), false);
});

test('checkRecords drops each record that is not valid alone and keeps the others (SYNC-7)', () => {
  const records = mapOf([category('c1', 'Chest'), category('c2', ''), workout('w1', 'e9'), rec('exercise', 'e1', { name: 'X' })]);
  const { local, dropped } = checkRecords(records);
  assert.deepEqual([...local.keys()], ['category:c1', 'workout:w1']);
  assert.deepEqual(dropped, ['category:c2', 'exercise:e1']);
  assert.equal(records.size, 4);
  assert.notEqual(fromRecords(local), null);
});

test('dedupe keeps the newer of two exercises named Squat and squat, and deletes the other (SYNC-7)', () => {
  const a = exercise('a', 'Squat');
  const b = exercise('b', ' squat ');
  const local = mapOf([a, b, exercise('c', 'Row')]);
  const server = mapOf([serverRec(a, '2026-10-24 08:00:00.000Z'), serverRec(b, '2026-10-24 07:00:00.000Z')]);
  const result = dedupe(local, server);
  assert.deepEqual(result.removed, [{ kind: 'exercise', key: 'b', op: 'delete' }]);
  assert.deepEqual([...result.local.keys()].sort(), ['exercise:a', 'exercise:c']);
  assert.equal(local.size, 3);
});

test('dedupe counts a record that is not on the server as the newest', () => {
  const a = routine('a', 'Push');
  const b = routine('b', 'push');
  const result = dedupe(mapOf([a, b]), mapOf([serverRec(a, '2026-10-24 08:00:00.000Z')]));
  assert.deepEqual(result.removed, [{ kind: 'routine', key: 'a', op: 'delete' }]);
});

test('dedupe with equal ages keeps the greater key', () => {
  const result = dedupe(mapOf([category('b', 'Legs'), category('a', 'legs')]), new Map());
  assert.deepEqual(result.removed, [{ kind: 'category', key: 'a', op: 'delete' }]);
});

test('dedupe compares names within one kind only, and never workouts', () => {
  const local = mapOf([category('x', 'Squat'), exercise('x', 'Squat'), routine('x', 'Squat'), workout('w1', 'x'), workout('w2', 'x')]);
  const result = dedupe(local, new Map());
  assert.deepEqual(result.removed, []);
  assert.equal(result.local.size, 5);
});

test('the merged doc of checkRecords and dedupe is always valid', () => {
  const records = mapOf([exercise('a', 'Squat'), exercise('b', 'SQUAT'), category('c', ''), workout('w', 'a')]);
  const { local } = dedupe(checkRecords(records).local, new Map());
  assert.notEqual(fromRecords(local), null);
});

test('cursorOf gives the greatest updated, or the previous cursor', () => {
  const pulled = [serverRec(category('a', 'A'), '2026-10-24 07:00:00.000Z'), serverRec(category('b', 'B'), '2026-10-24 09:00:00.000Z')];
  assert.equal(cursorOf(pulled, '2026-10-24 08:00:00.000Z'), '2026-10-24 09:00:00.000Z');
  assert.equal(cursorOf([], '2026-10-24 08:00:00.000Z'), '2026-10-24 08:00:00.000Z');
});
