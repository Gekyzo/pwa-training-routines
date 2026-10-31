import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSyncer, loadSyncState, saveSyncState, loadQueue, saveQueue, tokenExpired, SYNC_KEY, QUEUE_KEY, DEBOUNCE_MS,
} from '#syncer';
import { PocketBaseError } from '#pocketbase';
import { saveSession, loadSession, SESSION_KEY } from '#session';
import { emptyTraining, normalizeTraining, sortedExercises, TRAINING_KEY } from '#training';
import { APP_SLUG } from '#config';
import { toRecords } from '#records';

const exercise = (id, name, over = {}) => ({
  id, name, categoryId: null, type: 'weight_reps', rest: null, archived: false,
  increment: null, bar: null, unit: null, equipment: null, notes: '', unilateral: false, ...over,
});
const withExercises = (exercises, over = {}) => ({ ...emptyTraining(), exercises, ...over });
const names = (doc) => sortedExercises(doc).map((e) => e.name);
const settingsOf = (over) => ({ ...emptyTraining().settings, ...over });
// The data of an exercise record: the exercise with no id, in the shape of version 2.
const exerciseData = (name, over = {}) => {
  const { id: _, ...data } = exercise('x', name, over);
  return data;
};

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
// A JWT whose `exp` is far in the future; the fake server reads the user id from it.
const tokenOf = (id, n = 0) => `${base64url({ alg: 'none' })}.${base64url({ id, exp: 4_000_000_000, n })}.sig`;
const sessionOf = (id, approved = true) => ({ token: tokenOf(id), user: { id, email: `${id}@example.test`, name: id, approved } });
const ownerOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).id;

const fakeStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    keys: () => [...map.keys()],
  };
};

// An in-memory server with increasing `updated` strings and the unique (owner, kind, key).
const fakeServer = () => {
  let clock = 0;
  const rows = [];
  const stamp = () => {
    clock += 1;
    return `2026-10-24 07:00:00.${String(clock).padStart(3, '0')}Z`;
  };
  return {
    rows,
    stamp,
    live: (owner) => rows.filter((row) => row.owner === owner && !row.deleted),
    keys: (owner) => rows.filter((row) => row.owner === owner && !row.deleted).map((row) => `${row.kind}:${row.key}`).sort(),
    add: (owner, kind, key, data) => rows.push({ id: `pb${rows.length + 1}`, owner, kind, key, data, deleted: false, updated: stamp() }),
  };
};

// PocketBase answers a refused rule as it answers a guest: a 400 with no field error.
const refusedRule = () => new PocketBaseError('invalid', 400, {});

const fakeClient = (server, { approved = true } = {}) => {
  const calls = [];
  const streams = [];
  const client = {
    calls,
    streams,
    failPush: null,
    failPull: null,
    failRefresh: null,
    hold: null,
    approved,
    pushes: 0,
    refresh: async (token) => {
      calls.push('refresh');
      if (client.failRefresh) throw client.failRefresh;
      const id = ownerOf(token);
      return { token: tokenOf(id, calls.length), user: { id, email: `${id}@example.test`, name: id, approved: client.approved } };
    },
    pull: async (token, since, owner) => {
      calls.push('pull');
      if (client.hold) await client.hold('pull');
      if (client.failPull) throw client.failPull;
      if (ownerOf(token) !== owner) throw refusedRule();
      return server.rows
        .filter((row) => row.owner === owner && (!since || row.updated >= since))
        .sort((a, b) => (a.updated < b.updated ? -1 : 1))
        .map(({ owner: _, ...row }) => ({ ...row, data: structuredClone(row.data) }));
    },
    push: async (token, change, owner) => {
      calls.push('push');
      if (client.hold) await client.hold('push');
      client.pushes += 1;
      const failure = client.failPush?.(client.pushes, change, token);
      if (failure) throw failure;
      if (ownerOf(token) !== owner) throw refusedRule();
      let row = server.rows.find((r) => r.owner === owner && r.kind === change.kind && r.key === change.key);
      if (!row && change.op === 'delete') return null;
      if (!row) {
        row = { id: `pb${server.rows.length + 1}`, owner, kind: change.kind, key: change.key };
        server.rows.push(row);
      }
      // SYNC-6: a tombstone keeps its data, as the server does.
      Object.assign(row, change.op === 'delete' ? { deleted: true } : { deleted: false, data: structuredClone(change.data) }, { updated: server.stamp() });
      const { owner: _, ...rec } = row;
      return { ...rec };
    },
    subscribe: (token, onChange, { onReconnect }) => {
      const stream = { token, onChange, onReconnect, closed: false };
      streams.push(stream);
      return () => {
        stream.closed = true;
      };
    },
  };
  return client;
};

const open = (client) => client.streams.filter((s) => !s.closed);

// A device: its storage, its doc and the syncer. The timers only run when the test says so.
const device = ({ server, user = 'u1', doc = emptyTraining(), session = sessionOf(user), synced = true, approved, storage: given, lost, answers = {} } = {}) => {
  const storage = given ?? fakeStorage();
  const client = fakeClient(server, { approved });
  if (session && !given) saveSession(storage, session);
  if (session && synced && !given) saveSyncState(storage, { owner: session.user.id, cursor: '', server: new Map(), local: toRecords(doc) });
  const box = { doc, statuses: [], timers: [], exports: [], asked: [] };
  const syncer = createSyncer({
    client,
    storage,
    getState: () => box.doc,
    setState: (next) => {
      box.doc = next;
    },
    now: () => Date.parse('2026-10-24T08:00:00Z'),
    onStatus: (status) => box.statuses.push(status),
    setTimer: (fn, ms) => {
      box.timers.push({ fn, ms });
      return box.timers.length;
    },
    clearTimer: () => {},
    offerExport: async (state) => {
      box.exports.push(state);
    },
    confirmLogout: async (count) => {
      box.asked.push(count);
      return answers.logout ?? false;
    },
    lost,
  });
  const change = (next, options) => {
    box.doc = next;
    syncer.notify(next, options);
  };
  return { storage, client, syncer, box, change };
};

const restart = (a, server, options = {}) => device({ server, storage: a.storage, doc: emptyTraining(), ...options });

// Holds the next request of `op` until the test releases it; `waiting` resolves when it is held.
const holdOnce = (client, op) => {
  let release;
  let entered;
  const gate = new Promise((resolve) => (release = resolve));
  const waiting = new Promise((resolve) => (entered = resolve));
  client.hold = (name) => {
    if (name !== op) return null;
    client.hold = null;
    entered();
    return gate;
  };
  return { release, waiting };
};

const retryTimers = (box) => box.timers.filter(({ ms }) => ms !== DEBOUNCE_MS);

// ---- Storage ----

test('the keys of the sync are keys of this app (ENG-8)', () => {
  assert.equal(SYNC_KEY, `${APP_SLUG}.sync`);
  assert.equal(QUEUE_KEY, `${APP_SLUG}.queue`);
});

test('the sync state and the queue survive a save and a load, and a bad value gives the empty one', () => {
  const storage = fakeStorage();
  const sync = { owner: 'u1', cursor: 'c', server: new Map([['a', { id: 'x' }]]), local: new Map([['b', { kind: 'category' }]]), lastSync: 't' };
  saveSyncState(storage, sync);
  assert.deepEqual(loadSyncState(storage), sync);
  saveQueue(storage, [{ kind: 'category', key: 'c1', op: 'delete' }, { bad: 1 }]);
  assert.deepEqual(loadQueue(storage), [{ kind: 'category', key: 'c1', op: 'delete' }]);
  storage.setItem(SYNC_KEY, '{"owner":3}');
  storage.setItem(QUEUE_KEY, 'not json');
  assert.equal(loadSyncState(storage).owner, null);
  assert.deepEqual(loadQueue(storage), []);
});

test('a token counts as expired 60 s before its exp, or when it cannot be read (ACC-11)', () => {
  const token = `${base64url({})}.${base64url({ exp: 1000 })}.s`;
  assert.equal(tokenExpired(token, 939_000), false);
  assert.equal(tokenExpired(token, 940_000), true);
  assert.equal(tokenExpired('nonsense', 0), true);
  assert.equal(tokenExpired(`${base64url({})}.${base64url({})}.s`, 0), true);
});

// ---- Queue, push and pull ----

test('a save is queued, pushed, and the queue is empty after the run (SYNC-2, SYNC-8)', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.change(withExercises([exercise('e1', 'Squat')]));
  assert.deepEqual(loadQueue(a.storage).map((c) => `${c.op} ${c.kind}:${c.key}`), ['upsert exercise:e1']);
  assert.equal(a.box.timers.at(-1).ms, 1500);
  assert.equal(await a.syncer.run(), 'ok');
  assert.deepEqual(loadQueue(a.storage), []);
  assert.deepEqual(server.keys('u1'), ['exercise:e1']);
  assert.deepEqual(server.live('u1')[0].data, exerciseData('Squat'));
  assert.deepEqual(a.box.statuses.at(-1), { online: true, pending: 0, lastSync: '2026-10-24T08:00:00.000Z', auth: false, reached: 1 });
});

test('the debounce timer runs the sync', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.change(withExercises([exercise('e1', 'Squat')]));
  await a.box.timers.at(-1).fn();
  assert.deepEqual(server.keys('u1'), ['exercise:e1']);
});

test('a change of the settings sends the settings record only', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.change({ ...emptyTraining(), settings: { unit: 'lb', rest: 60 } });
  await a.syncer.run();
  assert.deepEqual(server.live('u1').map((row) => [row.kind, row.key, row.data]), [['settings', 'settings', { unit: 'lb', rest: 60 }]]);
});

test('two devices converge', async () => {
  const server = fakeServer();
  const a = device({ server });
  const b = device({ server });
  a.change(withExercises([exercise('e1', 'Squat')]));
  await a.syncer.run();
  await b.syncer.run();
  assert.deepEqual(b.box.doc, normalizeTraining(a.box.doc));
  a.change(withExercises([exercise('e1', 'Squat'), exercise('e2', 'Row')]));
  b.change(withExercises([exercise('e1', 'Squat', { rest: 120 })]));
  await a.syncer.run();
  await b.syncer.run();
  await a.syncer.run();
  assert.deepEqual(a.box.doc, b.box.doc);
  assert.deepEqual(sortedExercises(a.box.doc).map((e) => [e.name, e.rest]), [['Row', null], ['Squat', 120]]);
});

test('a delete reaches the other device as a tombstone (SYNC-6)', async () => {
  const server = fakeServer();
  const a = device({ server });
  const b = device({ server });
  a.change(withExercises([exercise('e1', 'Squat'), exercise('e2', 'Row')]));
  await a.syncer.run();
  await b.syncer.run();
  a.change(withExercises([exercise('e2', 'Row')]));
  await a.syncer.run();
  await b.syncer.run();
  assert.deepEqual(names(b.box.doc), ['Row']);
  const row = server.rows.find((r) => r.key === 'e1');
  assert.equal(row.deleted, true);
  assert.equal(row.data.name, 'Squat');
});

test('a merged doc queues nothing by itself', async () => {
  const server = fakeServer();
  server.add('u1', 'exercise', 'e1', exerciseData('Squat', { type: 'reps' }));
  const a = device({ server });
  await a.syncer.run();
  assert.deepEqual(names(a.box.doc), ['Squat']);
  assert.deepEqual(loadQueue(a.storage), []);
  assert.equal(a.box.timers.length, 0);
});

test('a record of version 1 gets the defaults of version 2, and the server gets them too (TRN-2)', async () => {
  const server = fakeServer();
  server.add('u1', 'exercise', 'e1', { name: 'Squat', categoryId: null, type: 'reps', rest: null, archived: false });
  server.add('u1', 'body', 'b1', { date: '2026-10-01', measure: 'weight', value: 80, unit: 'kg' });
  const a = device({ server });
  await a.syncer.run();
  assert.deepEqual(a.box.doc.exercises, [exercise('e1', 'Squat', { type: 'reps' })]);
  assert.deepEqual(a.box.doc.bodies, [{ id: 'b1', date: '2026-10-01', measure: 'weight', value: 80, unit: 'kg' }]);
  assert.deepEqual(loadQueue(a.storage).map((c) => `${c.op} ${c.kind}:${c.key}`), ['upsert exercise:e1']);
  await a.syncer.run();
  assert.deepEqual(server.live('u1').find((row) => row.key === 'e1').data, exerciseData('Squat', { type: 'reps' }));
});

test('run stops at a network error and keeps what was not sent (SYNC-8)', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.client.failPush = (n) => (n === 3 ? new PocketBaseError('network') : null);
  a.change(withExercises(Array.from({ length: 5 }, (_, n) => exercise(`e${n}`, `Exercise ${n}`))));
  assert.equal(await a.syncer.run(), 'offline');
  assert.deepEqual(loadQueue(a.storage).map((c) => c.key), ['e2', 'e3', 'e4']);
  assert.equal(a.client.calls.includes('pull'), false);
  assert.equal(a.syncer.status().online, false);
  a.client.failPush = null;
  assert.equal(await a.syncer.run(), 'ok');
  assert.equal(server.live('u1').length, 5);
  assert.equal(server.rows.length, 5);
});

test('a network error schedules no retry: the online event does (SYNC-9)', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.client.failPull = new PocketBaseError('network');
  assert.equal(await a.syncer.run(), 'offline');
  assert.deepEqual(retryTimers(a.box), []);
});

test('a push with bad data drops that one change and goes on (SYNC-8)', async (t) => {
  t.mock.method(console, 'error', () => {});
  const server = fakeServer();
  const a = device({ server });
  a.client.failPush = (_, change) => (change.key === 'e1' ? new PocketBaseError('invalid', 400, { data: { code: 'too_big' } }) : null);
  a.change(withExercises([exercise('e1', 'Squat'), exercise('e2', 'Row')]));
  assert.equal(await a.syncer.run(), 'ok');
  assert.deepEqual(server.keys('u1'), ['exercise:e2']);
  assert.deepEqual(loadQueue(a.storage), []);
  assert.deepEqual(names(a.box.doc), ['Row', 'Squat']);
});

test('a push refused by a rule is an auth stop and keeps the queue (ACC-11)', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.client.failPush = () => refusedRule();
  a.change(withExercises([exercise('e1', 'Squat')]));
  assert.equal(await a.syncer.run(), 'auth');
  assert.equal(loadQueue(a.storage).length, 1);
  assert.equal(a.syncer.status().auth, true);
});

test('run is one run while a run is in progress', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.change(withExercises([exercise('e1', 'Squat')]));
  const first = a.syncer.run();
  const second = a.syncer.run();
  assert.equal(first, second);
  await first;
  assert.equal(a.client.calls.filter((c) => c === 'pull').length, 1);
});

test('a save during a push in progress is kept and sent', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.change(withExercises([exercise('e1', 'Squat')]));
  const held = holdOnce(a.client, 'push');
  const running = a.syncer.run();
  await held.waiting;
  a.change(withExercises([exercise('e1', 'Squat', { rest: 60 })]));
  held.release();
  assert.equal(await running, 'ok');
  assert.deepEqual(loadQueue(a.storage), []);
  assert.equal(server.live('u1')[0].data.rest, 60);
  assert.equal(a.box.doc.exercises[0].rest, 60);
});

test('a save during a pull in progress is kept and sent', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.change(withExercises([exercise('e1', 'Squat')]));
  await a.syncer.run();
  const held = holdOnce(a.client, 'pull');
  const running = a.syncer.run();
  await held.waiting;
  a.change(withExercises([exercise('e1', 'Squat'), exercise('e2', 'Row')]));
  held.release();
  assert.equal(await running, 'ok');
  assert.deepEqual(names(a.box.doc), ['Row', 'Squat']);
  await a.box.timers.at(-1).fn();
  assert.deepEqual(loadQueue(a.storage), []);
  assert.deepEqual(server.keys('u1'), ['exercise:e1', 'exercise:e2']);
});

test('a queued change wins over a pulled record (SYNC-5)', async () => {
  const server = fakeServer();
  const a = device({ server });
  const b = device({ server });
  a.change(withExercises([exercise('e1', 'Squat')]));
  await a.syncer.run();
  await b.syncer.run();
  b.change(withExercises([exercise('e1', 'Squat', { rest: 30 })]));
  a.change(withExercises([exercise('e1', 'Squat', { rest: 90 })]));
  // b pulls before it pushes: its queued change stays in its doc.
  b.client.failPush = () => new PocketBaseError('network');
  await a.syncer.run();
  await b.syncer.run();
  assert.equal(b.box.doc.exercises[0].rest, 30);
});

// ---- Merge checks (SYNC-7) ----

test('a pulled record that the check refuses is dropped and logged; the others go on (SYNC-7)', async (t) => {
  t.mock.method(console, 'error', () => {});
  const server = fakeServer();
  server.add('u1', 'exercise', 'bad', { name: '', type: 'reps' });
  server.add('u1', 'exercise', 'e1', exerciseData('Squat', { type: 'reps' }));
  server.add('u1', 'note', 'n1', { text: 'x' });
  const a = device({ server });
  assert.equal(await a.syncer.run(), 'ok');
  assert.deepEqual(names(a.box.doc), ['Squat']);
  assert.deepEqual(loadQueue(a.storage), []);
  assert.equal(console.error.mock.callCount(), 1);
  assert.equal(loadSyncState(a.storage).cursor, server.rows.at(-1).updated);
});

test('a workout that comes before its exercise is kept (TRN-5)', async () => {
  const server = fakeServer();
  server.add('u1', 'workout', 'w1', {
    date: '2026-10-02', started: '2026-10-02T18:00:00.000Z', finished: null, routineId: null, dayId: null,
    routineName: '', dayName: '', comment: '', entries: [{ id: 'n1', exerciseId: 'later', sets: [] }],
  });
  const a = device({ server });
  await a.syncer.run();
  assert.deepEqual(a.box.doc.workouts.map((w) => w.id), ['w1']);
});

test('of two exercises with one name the newer stays and the other gets a tombstone (SYNC-7)', async () => {
  const server = fakeServer();
  const a = device({ server });
  const b = device({ server });
  a.change(withExercises([exercise('ea', 'Squat')]));
  b.change(withExercises([exercise('eb', 'squat')]));
  await a.syncer.run();
  await b.syncer.run();
  assert.deepEqual(b.box.doc.exercises.map((e) => e.id), ['eb']);
  // The tombstone of the loser goes in a sync soon.
  assert.deepEqual(loadQueue(b.storage).map((c) => `${c.op} ${c.key}`), ['delete ea']);
  await b.box.timers.at(-1).fn();
  await a.syncer.run();
  assert.deepEqual(server.keys('u1'), ['exercise:eb']);
  assert.deepEqual(a.box.doc.exercises.map((e) => e.id), ['eb']);
});

// ---- Token and auth (ACC-11) ----

test('the token is refreshed before the first data request, and again after 10 minutes', async () => {
  const server = fakeServer();
  let clock = Date.parse('2026-10-24T08:00:00Z');
  const storage = fakeStorage();
  saveSession(storage, sessionOf('u1'));
  saveSyncState(storage, { owner: 'u1', cursor: '', server: new Map(), local: toRecords(emptyTraining()) });
  const client = fakeClient(server);
  const syncer = createSyncer({ client, storage, getState: emptyTraining, setState() {}, now: () => clock, setTimer() {}, clearTimer() {} });
  await syncer.run();
  assert.deepEqual(client.calls, ['refresh', 'pull']);
  clock += 5 * 60_000;
  await syncer.run();
  assert.deepEqual(client.calls.slice(2), ['pull']);
  clock += 6 * 60_000;
  await syncer.run();
  assert.deepEqual(client.calls.slice(3), ['refresh', 'pull']);
  assert.notEqual(loadSession(storage).token, sessionOf('u1').token);
});

test('a refresh that says the account is no longer approved makes no data request', async () => {
  const server = fakeServer();
  const a = device({ server, approved: false });
  a.change(withExercises([exercise('e1', 'Squat')]));
  assert.equal(await a.syncer.run(), 'ok');
  assert.deepEqual(a.client.calls, ['refresh']);
  assert.equal(loadSession(a.storage).user.approved, false);
  assert.equal(loadQueue(a.storage).length, 1);
});

test('with no session notify keeps no queue and run makes no request', async () => {
  const server = fakeServer();
  const a = device({ server, session: null });
  a.change(withExercises([exercise('e1', 'Squat')]));
  assert.deepEqual(loadQueue(a.storage), []);
  assert.equal(await a.syncer.run(), 'ok');
  assert.deepEqual(a.client.calls, []);
  assert.equal(a.syncer.status().reached, 0);
});

test('after an auth stop a save is queued but no request goes until a login (ACC-11)', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.change(withExercises([exercise('e1', 'Squat')]));
  a.client.failRefresh = new PocketBaseError('auth', 401);
  assert.equal(await a.syncer.run(), 'auth');
  a.client.failRefresh = null;
  const timers = a.box.timers.length;
  a.change(withExercises([exercise('e1', 'Squat'), exercise('e2', 'Row')]));
  assert.equal(a.box.timers.length, timers);
  assert.equal(await a.syncer.run(), 'auth');
  assert.deepEqual(a.client.calls, ['refresh']);
  assert.equal(loadQueue(a.storage).length, 2);
  assert.equal(a.syncer.status().auth, true);
  assert.equal(await a.syncer.login(sessionOf('u1')), 'synced');
  assert.equal(a.syncer.status().auth, false);
  assert.deepEqual(loadQueue(a.storage), []);
  assert.deepEqual(server.keys('u1'), ['exercise:e1', 'exercise:e2']);
});

test('a delete that finds no record of a known live record checks the token first (SYNC-6)', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.change(withExercises([exercise('e1', 'Squat')]));
  await a.syncer.run();
  // A token that is not valid finds no record: the push answers null.
  a.client.failPush = () => null;
  const push = a.client.push;
  a.client.push = async (token, change, owner) => (change.op === 'delete' ? null : push(token, change, owner));
  a.client.failRefresh = new PocketBaseError('auth', 401);
  a.change(emptyTraining());
  assert.equal(await a.syncer.run(), 'auth');
  assert.deepEqual(loadQueue(a.storage).map((c) => `${c.op} ${c.key}`), ['delete e1']);
});

test('after a good refresh a delete of a record that is gone leaves the queue (SYNC-6)', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.change(withExercises([exercise('e1', 'Squat')]));
  await a.syncer.run();
  server.rows.length = 0;
  a.change(emptyTraining());
  const refreshes = a.client.calls.filter((c) => c === 'refresh').length;
  assert.equal(await a.syncer.run(), 'ok');
  assert.equal(a.client.calls.filter((c) => c === 'refresh').length, refreshes + 1);
  assert.deepEqual(loadQueue(a.storage), []);
  assert.equal(server.rows.length, 0);
});

test('an error that is not of the client is logged and the run stops as offline', async () => {
  const server = fakeServer();
  const a = device({ server });
  const logged = mock.method(console, 'error', () => {});
  try {
    a.client.pull = async () => {
      throw new TypeError('bug');
    };
    assert.equal(await a.syncer.run(), 'offline');
    assert.equal(logged.mock.callCount(), 1);
    assert.equal(a.box.statuses.at(-1).online, false);
  } finally {
    logged.mock.restore();
  }
});

// ---- Retry (SYNC-9) and offline (SYNC-11) ----

test('a rate limit mid-push keeps the queue, stays online and the retry sends the rest', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.client.failPush = (n) => (n === 2 ? new PocketBaseError('rate', 429) : null);
  a.change(withExercises([exercise('e1', 'A'), exercise('e2', 'B'), exercise('e3', 'C')]));
  assert.equal(await a.syncer.run(), 'rate');
  assert.equal(a.syncer.status().online, true);
  assert.equal(loadQueue(a.storage).length, 2);
  assert.deepEqual(retryTimers(a.box).map((t) => t.ms), [5000]);
  assert.equal(await retryTimers(a.box).at(-1).fn(), 'ok');
  assert.equal(server.live('u1').length, 3);
});

test('the retry delay grows with each stop and starts again after a good run', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.client.failPull = new PocketBaseError('server', 503);
  for (let n = 0; n < 5; n += 1) await a.syncer.run();
  assert.deepEqual(retryTimers(a.box).map((t) => t.ms), [5000, 15000, 30000, 60000, 60000]);
  a.client.failPull = null;
  await a.syncer.run();
  a.client.failPull = new PocketBaseError('rate', 429);
  await a.syncer.run();
  assert.equal(retryTimers(a.box).at(-1).ms, 5000);
});

test('a server error counts as offline and schedules a retry (SYNC-9, SYNC-11)', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.client.failPull = new PocketBaseError('server', 500);
  assert.equal(await a.syncer.run(), 'offline');
  assert.equal(a.syncer.status().online, false);
  assert.equal(retryTimers(a.box).length, 1);
});

test('the status counts a run only when the server answered it (SYNC-11)', async () => {
  const server = fakeServer();
  const a = device({ server });
  await a.syncer.run();
  a.client.failPull = new PocketBaseError('network');
  await a.syncer.run();
  a.client.failPull = new PocketBaseError('rate', 429);
  await a.syncer.run();
  assert.equal(a.syncer.status().reached, 2);
});

// ---- Stream (SYNC-3) ----

test('start syncs, then opens the stream; an event and a reconnect start a sync', async () => {
  const server = fakeServer();
  const a = device({ server });
  assert.equal(await a.syncer.start(), 'ok');
  assert.equal(open(a.client).length, 1);
  const stream = open(a.client)[0];
  assert.equal(stream.token(), loadSession(a.storage).token);
  server.add('u1', 'category', 'c1', { name: 'Legs' });
  await stream.onChange({});
  await a.syncer.run();
  assert.deepEqual(a.box.doc.categories, [{ id: 'c1', name: 'Legs', weekMin: null, weekMax: null }]);
  const pulls = a.client.calls.filter((c) => c === 'pull').length;
  await stream.onReconnect();
  await a.syncer.run();
  assert.ok(a.client.calls.filter((c) => c === 'pull').length > pulls);
});

test('the offline event closes the stream; the online event syncs and opens it again (SYNC-3, SYNC-11)', async () => {
  const server = fakeServer();
  const a = device({ server });
  await a.syncer.start();
  a.syncer.goOffline();
  assert.equal(open(a.client).length, 0);
  assert.equal(a.syncer.status().online, false);
  assert.equal(await a.syncer.goOnline(), 'ok');
  assert.equal(open(a.client).length, 1);
  assert.equal(a.syncer.status().online, true);
});

test('a visible app that the browser says is online syncs; else nothing happens (SYNC-11)', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.syncer.goOffline();
  assert.equal(await a.syncer.goVisible(false), 'offline');
  assert.deepEqual(a.client.calls, []);
  assert.equal(await a.syncer.goVisible(true), 'ok');
  assert.ok(a.client.calls.includes('pull'));
});

test('a run that reaches the server opens the stream again with no online event (SYNC-11)', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.client.failPull = new PocketBaseError('network');
  await a.syncer.start();
  assert.equal(open(a.client).length, 0);
  a.client.failPull = null;
  await a.syncer.run();
  assert.equal(open(a.client).length, 1);
});

test('an auth stop closes the stream (ACC-11)', async () => {
  const server = fakeServer();
  const a = device({ server });
  await a.syncer.start();
  a.client.failPull = refusedRule();
  assert.equal(await a.syncer.run(), 'auth');
  assert.equal(open(a.client).length, 0);
});

test('a session that waits for approval opens no stream and makes no request for data', async () => {
  const server = fakeServer();
  const a = device({ server, synced: false, session: sessionOf('u1', false) });
  await a.syncer.goOnline();
  assert.equal(a.client.streams.length, 0);
  assert.equal(a.client.calls.includes('pull'), false);
});

// ---- Login (SYNC-12, ACC-11, ACC-12) ----

test('the first login merges the local doc into the account (SYNC-12)', async () => {
  const server = fakeServer();
  server.add('u1', 'exercise', 'k1', exerciseData('Row', { type: 'reps' }));
  const a = device({ server, session: null, doc: withExercises([exercise('e1', 'Squat')]) });
  assert.equal(await a.syncer.login(sessionOf('u1')), 'synced');
  assert.deepEqual(names(a.box.doc), ['Row', 'Squat']);
  assert.deepEqual(server.keys('u1'), ['exercise:e1', 'exercise:k1']);
  assert.equal(loadSyncState(a.storage).owner, 'u1');
  assert.deepEqual(loadQueue(a.storage), []);
});

test('the first login of a device with the default settings keeps the settings of the account', async () => {
  const server = fakeServer();
  server.add('u1', 'settings', 'settings', settingsOf({ unit: 'lb', rest: 45 }));
  const a = device({ server, session: null });
  await a.syncer.login(sessionOf('u1'));
  assert.deepEqual(a.box.doc.settings, settingsOf({ unit: 'lb', rest: 45 }));
  assert.equal(server.rows.length, 1);
  assert.deepEqual(server.rows[0].data, settingsOf({ unit: 'lb', rest: 45 }));
});

test('the first login sends local settings that are not the defaults: the device wins', async () => {
  const server = fakeServer();
  server.add('u1', 'settings', 'settings', settingsOf({ unit: 'lb', rest: 45 }));
  const a = device({ server, session: null, doc: { ...emptyTraining(), settings: settingsOf({ unit: 'kg', rest: 30 }) } });
  await a.syncer.login(sessionOf('u1'));
  assert.deepEqual(a.box.doc.settings, settingsOf({ unit: 'kg', rest: 30 }));
  assert.deepEqual(server.rows[0].data, settingsOf({ unit: 'kg', rest: 30 }));
});

test('an entity on both sides keeps the copy of the device (SYNC-12)', async () => {
  const server = fakeServer();
  server.add('u1', 'exercise', 'e1', exerciseData('Squat', { rest: 30 }));
  const a = device({ server, session: null, doc: withExercises([exercise('e1', 'Squat', { rest: 90 })]) });
  await a.syncer.login(sessionOf('u1'));
  assert.equal(a.box.doc.exercises[0].rest, 90);
  assert.equal(server.live('u1')[0].data.rest, 90);
});

test('a login of an account that is not approved keeps the session and makes no request', async () => {
  const server = fakeServer();
  const a = device({ server, session: null, doc: withExercises([exercise('e1', 'Squat')]) });
  assert.equal(await a.syncer.login(sessionOf('u1', false)), 'waiting');
  assert.deepEqual(a.client.calls, []);
  assert.equal(loadSession(a.storage).user.id, 'u1');
  assert.equal(loadSyncState(a.storage).owner, null);
});

test('a save while the account waits for approval is sent at the login', async () => {
  const server = fakeServer();
  const a = device({ server, session: null });
  await a.syncer.login(sessionOf('u1', false));
  a.change(withExercises([exercise('e1', 'Squat')]));
  assert.deepEqual(loadQueue(a.storage), []);
  assert.equal(await a.syncer.login(sessionOf('u1')), 'synced');
  assert.deepEqual(server.keys('u1'), ['exercise:e1']);
});

test('a login of the same user continues the sync and clears nothing', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.change(withExercises([exercise('e1', 'Squat')]));
  assert.equal(await a.syncer.login(sessionOf('u1')), 'synced');
  assert.deepEqual(names(a.box.doc), ['Squat']);
  assert.deepEqual(a.box.exports, []);
  assert.deepEqual(server.keys('u1'), ['exercise:e1']);
});

test('another user with a queue: the export is offered, then the device clears and syncs (ACC-12)', async () => {
  const server = fakeServer();
  server.add('u2', 'category', 'c9', { name: 'Back' });
  const a = device({ server });
  a.storage.setItem(`${APP_SLUG}.theme`, 'dark');
  const doc = withExercises([exercise('e1', 'Squat')]);
  a.change(doc);
  assert.equal(await a.syncer.login(sessionOf('u2')), 'synced');
  assert.deepEqual(a.box.exports, [doc]);
  assert.deepEqual(a.box.doc.exercises, []);
  assert.deepEqual(a.box.doc.categories, [{ id: 'c9', name: 'Back', weekMin: null, weekMax: null }]);
  assert.equal(loadSyncState(a.storage).owner, 'u2');
  assert.equal(loadSession(a.storage).user.id, 'u2');
  assert.equal(a.storage.getItem(`${APP_SLUG}.theme`), 'dark');
  // Nothing of the previous user reaches the account of the new one.
  assert.deepEqual(server.keys('u2'), ['category:c9']);
  assert.deepEqual(server.keys('u1'), []);
});

test('another user with no queue: the device clears with no export offer (ACC-12)', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.change(withExercises([exercise('e1', 'Squat')]));
  await a.syncer.run();
  assert.equal(await a.syncer.login(sessionOf('u2')), 'synced');
  assert.deepEqual(a.box.exports, []);
  assert.deepEqual(a.box.doc, emptyTraining());
  assert.deepEqual(server.keys('u2'), []);
});

test('a queue with no owner counts as the queue of another user (ACC-12)', async () => {
  const server = fakeServer();
  const storage = fakeStorage();
  saveQueue(storage, [{ kind: 'category', key: 'c1', op: 'delete' }]);
  const exports = [];
  const syncer = createSyncer({
    client: fakeClient(server), storage, getState: emptyTraining, setState() {}, now: () => 0, setTimer() {}, clearTimer() {},
    offerExport: async (doc) => exports.push(doc),
  });
  assert.equal(await syncer.login(sessionOf('u1')), 'synced');
  assert.equal(exports.length, 1);
  assert.deepEqual(server.rows, []);
});

test('a run in progress with the old token cannot stop the sync after a login', async () => {
  const server = fakeServer();
  const a = device({ server });
  const held = holdOnce(a.client, 'pull');
  a.client.failPull = refusedRule();
  const running = a.syncer.run();
  await held.waiting;
  a.client.failPull = null;
  const login = a.syncer.login(sessionOf('u1'));
  held.release();
  assert.equal(await running, 'ok');
  assert.equal(await login, 'synced');
  assert.equal(a.syncer.status().auth, false);
});

test('start resumes a login that the app left at the export offer', async () => {
  const server = fakeServer();
  server.add('u2', 'category', 'c9', { name: 'Back' });
  const a = device({ server });
  a.change(withExercises([exercise('e1', 'Squat')]));
  // The app closed during the offer: the session of u2 is saved, the data is still of u1.
  saveSession(a.storage, sessionOf('u2'));
  const again = device({ server, storage: a.storage, doc: a.box.doc });
  assert.equal(await again.syncer.start(), 'ok');
  assert.deepEqual(again.client.calls.slice(0, 1), ['refresh']);
  assert.equal(again.box.exports.length, 1);
  assert.deepEqual(again.box.doc.categories, [{ id: 'c9', name: 'Back', weekMin: null, weekMax: null }]);
  assert.equal(loadSyncState(again.storage).owner, 'u2');
});

test('start of a pending login whose refresh is refused removes the session', async () => {
  const server = fakeServer();
  const a = device({ server, synced: false });
  a.client.failRefresh = new PocketBaseError('auth', 401);
  assert.equal(await a.syncer.start(), 'auth');
  assert.equal(loadSession(a.storage), null);
  a.client.failRefresh = new PocketBaseError('network');
  saveSession(a.storage, sessionOf('u1'));
  assert.equal(await a.syncer.start(), 'offline');
  assert.notEqual(loadSession(a.storage), null);
});

// ---- Logout (ACC-13) and reset (SYNC-13) ----

test('a logout online sends the queue, then clears the doc, the queue, the sync and the session', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.storage.setItem(`${APP_SLUG}.theme`, 'dark');
  a.storage.setItem(TRAINING_KEY, '{}');
  a.change(withExercises([exercise('e1', 'Squat')]));
  await a.syncer.start();
  assert.equal(await a.syncer.logout({ online: true }), 'done');
  assert.deepEqual(server.keys('u1'), ['exercise:e1']);
  assert.deepEqual(a.storage.keys(), [`${APP_SLUG}.theme`]);
  assert.deepEqual(a.box.doc, emptyTraining());
  assert.deepEqual(a.box.asked, []);
  assert.equal(open(a.client).length, 0);
});

test('a logout with changes not sent asks; a no keeps everything', async () => {
  const server = fakeServer();
  const a = device({ server });
  const doc = withExercises([exercise('e1', 'Squat')]);
  a.change(doc);
  assert.equal(await a.syncer.logout({ online: false }), 'kept');
  assert.deepEqual(a.box.asked, [1]);
  assert.deepEqual(a.client.calls, []);
  assert.equal(a.box.doc, doc);
  assert.equal(loadQueue(a.storage).length, 1);
  assert.notEqual(a.storage.getItem(SESSION_KEY), null);
  assert.deepEqual(a.box.exports, []);
});

test('a logout with changes not sent and a yes offers the export, then clears', async () => {
  const server = fakeServer();
  const a = device({ server, answers: { logout: true } });
  const doc = withExercises([exercise('e1', 'Squat')]);
  a.change(doc);
  a.client.failPush = () => new PocketBaseError('network');
  assert.equal(await a.syncer.logout({ online: true }), 'done');
  assert.deepEqual(a.box.exports, [doc]);
  assert.equal(a.storage.getItem(SESSION_KEY), null);
  assert.deepEqual(loadQueue(a.storage), []);
  assert.deepEqual(a.box.doc, emptyTraining());
});

test('a logout during a run in progress leaves the storage cleared, and the stale run saves nothing', async () => {
  const server = fakeServer();
  server.add('u2', 'category', 'c9', { name: 'Back' });
  const a = device({ server, answers: { logout: true } });
  a.change(withExercises([exercise('e1', 'Squat')]));
  const held = holdOnce(a.client, 'push');
  const running = a.syncer.run();
  await held.waiting;
  assert.equal(await a.syncer.logout({ online: false }), 'done');
  held.release();
  await running;
  assert.deepEqual(a.storage.keys(), []);
  assert.deepEqual(a.box.doc, emptyTraining());
  assert.equal(await a.syncer.login(sessionOf('u2')), 'synced');
  assert.deepEqual(a.box.doc.categories, [{ id: 'c9', name: 'Back', weekMin: null, weekMax: null }]);
  assert.equal(loadSyncState(a.storage).owner, 'u2');
});

test('reset stops the sync, clears this device only and sends nothing (SYNC-13)', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.change(withExercises([exercise('e1', 'Squat')]));
  await a.syncer.start();
  a.change(withExercises([exercise('e1', 'Squat'), exercise('e2', 'Row')]));
  const calls = a.client.calls.length;
  a.syncer.reset();
  assert.equal(await a.box.timers.at(-1).fn(), 'ok');
  assert.equal(a.client.calls.length, calls);
  assert.deepEqual(a.storage.keys(), []);
  assert.deepEqual(a.box.doc, emptyTraining());
  assert.equal(open(a.client).length, 0);
  assert.deepEqual(server.keys('u1'), ['exercise:e1']);
});

// ---- The guard of SYNC-2 and the import (SYNC-10) ----

test('a start whose doc was lost pulls the account again and deletes nothing (SYNC-2)', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.change(withExercises([exercise('e1', 'Squat'), exercise('e2', 'Row')]));
  await a.syncer.run();
  const again = restart(a, server, { lost: true });
  assert.equal(loadSyncState(again.storage).cursor, '');
  await again.syncer.run();
  assert.deepEqual(server.keys('u1'), ['exercise:e1', 'exercise:e2']);
  assert.deepEqual(names(again.box.doc), ['Row', 'Squat']);
});

test('a sync whose doc holds none of the entities of the account deletes nothing (SYNC-2)', async (t) => {
  t.mock.method(console, 'error', () => {});
  const server = fakeServer();
  const a = device({ server });
  a.change(withExercises([exercise('e1', 'Squat'), exercise('e2', 'Row')]));
  await a.syncer.run();
  const again = restart(a, server);
  again.change(withExercises([exercise('e9', 'Press')]));
  assert.deepEqual(loadQueue(again.storage).filter((c) => c.op === 'delete'), []);
  await again.syncer.run();
  assert.deepEqual(server.keys('u1'), ['exercise:e1', 'exercise:e2']);
  assert.ok(console.error.mock.callCount() >= 1);
  assert.deepEqual(names(again.box.doc), ['Row', 'Squat']);
});

test('the user can still delete every entity one by one (SYNC-2)', async () => {
  const server = fakeServer();
  const a = device({ server });
  a.change(withExercises([exercise('e1', 'Squat')]));
  await a.syncer.run();
  a.change(emptyTraining());
  await a.syncer.run();
  assert.deepEqual(server.keys('u1'), []);
});

test('an import replaces the account, also records that the doc never held (SYNC-10)', async (t) => {
  t.mock.method(console, 'error', () => {});
  const server = fakeServer();
  server.add('u1', 'exercise', 'bad', { name: '' });
  const a = device({ server });
  a.change(withExercises([exercise('e1', 'Squat'), exercise('e2', 'Row')]));
  await a.syncer.run();
  const b = restart(a, server);
  b.change(withExercises([exercise('e5', 'Press')]), { explicit: true });
  await b.syncer.run();
  assert.deepEqual(server.keys('u1'), ['exercise:e5']);
  assert.deepEqual(names(b.box.doc), ['Press']);
});

test('a logout of a session that does not own the data removes only the session (ACC-13)', async () => {
  const server = fakeServer();
  const doc = withExercises([exercise('e1', 'Squat')]);
  const a = device({ server, session: null, doc });
  await a.syncer.login(sessionOf('u1', false));
  assert.equal(await a.syncer.logout({ online: true }), 'done');
  assert.equal(loadSession(a.storage), null);
  assert.equal(a.box.doc, doc);
  assert.deepEqual(a.client.calls, []);
});
