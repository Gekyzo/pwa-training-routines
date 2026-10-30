import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, PocketBaseError } from '#pocketbase';
import { apiUrl, LOCAL_API, PRODUCTION_API } from '#config';

const URL_ = 'https://pb.test';
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
const userRecord = { id: 'user1', email: 'a@b.c', name: 'Ana' };
const auth = reply(200, { token: 'T', record: { ...userRecord, extra: 1 } });
// The access row of the user for this app (ACC-3); no status: no row.
const access = (status) => reply(200, { items: status ? [{ id: 'acc1', user: 'user1', app: 'app1', status }] : [], page: 1, totalPages: status ? 1 : 0 });
const app = reply(200, { items: [{ id: 'app1', slug: 'pwa-training-routines' }] });
const unique = reply(400, { data: { user: { code: 'validation_not_unique' }, app: { code: 'validation_not_unique' } } });
const methods = reply(200, {
  oauth2: { providers: [{ name: 'github', authURL: 'x' }, { name: 'google', state: 'S', codeVerifier: 'V', authURL: 'https://g.test/auth?redirect_uri=' }] },
});
const PENDING = { provider: 'google', state: 'S', codeVerifier: 'V' };

// A fake fetch that records each request and answers from a list of replies, in order.
const fake = (...replies) => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: new globalThis.URL(url), method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, client: createClient({ url: `${URL_}/`, fetch }) };
};

test('apiUrl gives the local server on a local host and the production one elsewhere', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) assert.equal(apiUrl(host), LOCAL_API);
  assert.equal(apiUrl('gekyzo.github.io'), PRODUCTION_API);
});

test('oauthStart appends the encoded redirect URL to the authURL of google', async () => {
  const { calls, client } = fake(methods);
  const started = await client.oauthStart('https://app.test/x?a=1');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url.href, 'https://pb.test/api/collections/users/auth-methods');
  assert.equal(started.url, 'https://g.test/auth?redirect_uri=https%3A%2F%2Fapp.test%2Fx%3Fa%3D1');
  assert.deepEqual(started.pending, PENDING);
});

test('oauthStart without a google provider is an invalid error', async () => {
  const { client } = fake(reply(200, { oauth2: { providers: [] } }));
  await assert.rejects(client.oauthStart('u'), { type: 'invalid' });
});

test('oauthFinish refuses a state that is not the one sent, with no request', async () => {
  const { calls, client } = fake();
  await assert.rejects(client.oauthFinish({ code: 'C', state: 'other' }, PENDING, 'u'), { type: 'state' });
  assert.equal(calls.length, 0);
});

test('oauthFinish exchanges the code and reads the approved access row of the app', async () => {
  const { calls, client } = fake(auth, access('approved'));
  const session = await client.oauthFinish({ code: 'C', state: 'S' }, PENDING, 'https://app.test/');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url.pathname, '/api/collections/users/auth-with-oauth2');
  assert.deepEqual(calls[0].body, { provider: 'google', code: 'C', codeVerifier: 'V', redirectURL: 'https://app.test/' });
  assert.equal(calls[1].url.pathname, '/api/collections/app_access/records');
  assert.equal(calls[1].url.searchParams.get('filter'), 'user = "user1" && app.slug = "pwa-training-routines"');
  assert.equal(calls[1].headers.Authorization, 'T');
  assert.deepEqual(session, { token: 'T', user: { ...userRecord, approved: true } });
});

test('a pending or revoked row is not approved', async () => {
  for (const status of ['pending', 'revoked']) {
    const { client } = fake(auth, access(status));
    const session = await client.oauthFinish({ code: 'C', state: 'S' }, PENDING, 'u');
    assert.equal(session.user.approved, false, status);
  }
});

test('with no access row, a sign-in asks for access with a pending row (ACC-3)', async () => {
  const { calls, client } = fake(auth, access(null), app, reply(200, { id: 'acc1', status: 'pending' }));
  const session = await client.oauthFinish({ code: 'C', state: 'S' }, PENDING, 'u');
  assert.equal(calls[2].url.searchParams.get('filter'), 'slug = "pwa-training-routines"');
  assert.equal(calls[3].method, 'POST');
  assert.deepEqual(calls[3].body, { user: 'user1', app: 'app1', status: 'pending' });
  assert.equal(session.user.approved, false);
});

test('a duplicate access row made meanwhile is read again', async () => {
  const { client } = fake(auth, access(null), app, unique, access('approved'));
  const session = await client.oauthFinish({ code: 'C', state: 'S' }, PENDING, 'u');
  assert.equal(session.user.approved, true);
});

test('an app that the server does not list is an invalid error', async () => {
  const { client } = fake(auth, access(null), reply(200, { items: [] }));
  await assert.rejects(client.oauthFinish({ code: 'C', state: 'S' }, PENDING, 'u'), { type: 'invalid', status: 404 });
});

test('refresh posts the token and reads the access row again', async () => {
  const { calls, client } = fake(reply(200, { token: 'T2', record: userRecord }), access('revoked'));
  const session = await client.refresh('T');
  assert.equal(calls[0].url.pathname, '/api/collections/users/auth-refresh');
  assert.equal(calls[0].headers.Authorization, 'T');
  assert.deepEqual(session, { token: 'T2', user: { ...userRecord, approved: false } });
});

test('the errors have a type: network, auth, rate, server', async () => {
  const cases = [
    [new TypeError('offline'), 'network'],
    [reply(401, {}), 'auth'],
    [reply(403, {}), 'auth'],
    [reply(429, {}), 'rate'],
    [reply(500, {}), 'server'],
  ];
  for (const [answer, type] of cases) {
    const { client } = fake(answer);
    await assert.rejects(client.refresh('T'), (error) => error instanceof PocketBaseError && error.type === type);
  }
});

test('a body that is not JSON is a server error', async () => {
  const { client } = fake({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } });
  await assert.rejects(client.refresh('T'), { type: 'server' });
});

// ---- The sync records (SYNC-3, SYNC-4, SYNC-6) ----

const OWNER = 'user1';
const RECORDS = '/api/collections/training_records/records';
const serverRow = (over = {}) => ({
  id: 'r1', collectionId: 'c', owner: 'user1', kind: 'exercise', key: 'a', data: { n: 1 }, deleted: false,
  created: '2026-10-24 08:00:00.000Z', updated: '2026-10-24 08:00:00.000Z', ...over,
});
const found = (...rows) => reply(200, { items: rows, page: 1, totalPages: rows.length ? 1 : 0 });
const recordUnique = reply(400, {
  data: { key: { code: 'validation_not_unique' }, kind: { code: 'validation_not_unique' }, owner: { code: 'validation_not_unique' } },
});

test('pull follows every page, sorts by updated and sends the cursor in the filter', async () => {
  const { calls, client } = fake(
    reply(200, { items: [serverRow()], page: 1, totalPages: 2 }),
    reply(200, { items: [serverRow({ id: 'r2', key: 'b' })], page: 2, totalPages: 2 }),
  );
  const pulled = await client.pull('T', '2026-10-24 07:00:00.000Z', OWNER);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.pathname, RECORDS);
  assert.equal(calls[0].url.searchParams.get('filter'), 'owner = "user1" && updated >= "2026-10-24 07:00:00.000Z"');
  assert.equal(calls[0].url.searchParams.get('sort'), 'updated');
  assert.equal(calls[0].url.searchParams.get('perPage'), '500');
  assert.equal(calls[1].url.searchParams.get('page'), '2');
  assert.equal(calls[0].headers.Authorization, 'T');
  assert.deepEqual(pulled.map((r) => r.id), ['r1', 'r2']);
  assert.deepEqual(Object.keys(pulled[0]), ['id', 'kind', 'key', 'data', 'deleted', 'updated']);
});

test('pull with an empty cursor filters by the owner only, and stops with no totalPages', async () => {
  const { calls, client } = fake(reply(200, { items: [serverRow()] }));
  assert.equal((await client.pull('T', '', OWNER)).length, 1);
  assert.equal(calls[0].url.searchParams.get('filter'), 'owner = "user1"');
  assert.equal(calls.length, 1);
});

test('pull and push with no owner are an auth error and send nothing', async () => {
  const { calls, client } = fake();
  await assert.rejects(client.pull('T', '', ''), { type: 'auth' });
  await assert.rejects(client.push('T', { kind: 'exercise', key: 'a', op: 'upsert', data: {} }, null), { type: 'auth' });
  assert.equal(calls.length, 0);
});

test('push of an upsert with no record on the server creates it with the owner', async () => {
  const { calls, client } = fake(found(), reply(200, serverRow()));
  const rec = await client.push('T', { kind: 'exercise', key: 'a', op: 'upsert', data: { n: 1 } }, OWNER);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url.searchParams.get('filter'), 'owner = "user1" && kind = "exercise" && key = "a"');
  assert.equal(calls[1].method, 'POST');
  assert.deepEqual(calls[1].body, { owner: 'user1', kind: 'exercise', key: 'a', deleted: false, data: { n: 1 } });
  assert.deepEqual(rec, { id: 'r1', kind: 'exercise', key: 'a', data: { n: 1 }, deleted: false, updated: '2026-10-24 08:00:00.000Z' });
});

test('push of an upsert patches the record found by kind and key, also a tombstone', async () => {
  const { calls, client } = fake(found(serverRow({ deleted: true })), reply(200, serverRow({ data: { n: 2 } })));
  const rec = await client.push('T', { kind: 'exercise', key: 'a', op: 'upsert', data: { n: 2 } }, OWNER);
  assert.equal(calls[1].method, 'PATCH');
  assert.equal(calls[1].url.pathname, `${RECORDS}/r1`);
  assert.deepEqual(calls[1].body, { deleted: false, data: { n: 2 } });
  assert.deepEqual(rec.data, { n: 2 });
});

test('a delete is a patch with deleted true and keeps the data (SYNC-6)', async () => {
  const { calls, client } = fake(found(serverRow()), reply(200, serverRow({ deleted: true })));
  const rec = await client.push('T', { kind: 'exercise', key: 'a', op: 'delete' }, OWNER);
  assert.equal(calls[1].method, 'PATCH');
  assert.deepEqual(calls[1].body, { deleted: true });
  assert.equal(rec.deleted, true);
});

test('a delete with no record on the server resolves null and creates nothing (SYNC-6)', async () => {
  const { calls, client } = fake(found());
  assert.equal(await client.push('T', { kind: 'exercise', key: 'a', op: 'delete' }, OWNER), null);
  assert.equal(calls.length, 1);
});

test('a create that the unique index refuses patches the record that another device made', async () => {
  const { calls, client } = fake(found(), recordUnique, found(serverRow({ id: 'r7' })), reply(200, serverRow({ id: 'r7', data: { n: 3 } })));
  const rec = await client.push('T', { kind: 'exercise', key: 'a', op: 'upsert', data: { n: 3 } }, OWNER);
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'POST', 'GET', 'PATCH']);
  assert.equal(calls[3].url.pathname, `${RECORDS}/r7`);
  assert.deepEqual(rec.data, { n: 3 });
});

test('a create refused with no field error is an invalid error, not a duplicate', async () => {
  const { calls, client } = fake(found(), reply(400, { data: {} }));
  await assert.rejects(client.push('T', { kind: 'exercise', key: 'a', op: 'upsert', data: {} }, OWNER), { type: 'invalid', status: 400 });
  assert.equal(calls.length, 2);
});

test('a refused create keeps the field errors of the server', async () => {
  const { client } = fake(found(), reply(400, { data: { data: { code: 'validation_json_size_limit' } } }));
  await assert.rejects(
    client.push('T', { kind: 'exercise', key: 'a', op: 'upsert', data: {} }, OWNER),
    (error) => error.fields.data.code === 'validation_json_size_limit',
  );
});

test('a 429 of a push is a rate error, a 5xx of a pull a server error', async () => {
  const { client } = fake(reply(429, {}), reply(503, {}));
  await assert.rejects(client.push('T', { kind: 'exercise', key: 'a', op: 'upsert', data: {} }, OWNER), { type: 'rate', status: 429 });
  await assert.rejects(client.pull('T', '', OWNER), { type: 'server', status: 503 });
});

class FakeSource {
  static last;
  constructor(url) {
    this.url = url;
    this.listeners = {};
    this.closed = false;
    FakeSource.last = this;
  }
  addEventListener(name, listener) {
    this.listeners[name] = listener;
  }
  emit(name, data) {
    return this.listeners[name]({ data: JSON.stringify(data) });
  }
  close() {
    this.closed = true;
  }
}

test('subscribe posts the clientId of PB_CONNECT and passes record events on (SYNC-3)', async () => {
  const seen = [];
  const log = [];
  const fetch = async (url, init) => {
    log.push({ url, method: init.method, headers: init.headers, body: JSON.parse(init.body) });
    return reply(204, null);
  };
  const client = createClient({ url: URL_, fetch, EventSource: FakeSource });
  const stop = client.subscribe('T', (rec) => seen.push(rec));
  assert.equal(FakeSource.last.url, `${URL_}/api/realtime`);
  await FakeSource.last.emit('PB_CONNECT', { clientId: 'cid' });
  assert.equal(log[0].method, 'POST');
  assert.equal(log[0].url, `${URL_}/api/realtime`);
  assert.equal(log[0].headers.Authorization, 'T');
  assert.deepEqual(log[0].body, { clientId: 'cid', subscriptions: ['training_records'] });
  FakeSource.last.emit('training_records', { action: 'update', record: serverRow() });
  FakeSource.last.emit('training_records', { action: 'delete', record: serverRow({ id: 'r2' }) });
  assert.deepEqual(seen.map((r) => [r.id, r.deleted]), [['r1', false], ['r2', true]]);
  stop();
  assert.equal(FakeSource.last.closed, true);
});

test('subscribe drops a malformed event but does not swallow an error of the consumer', () => {
  const client = createClient({ url: URL_, fetch: async () => reply(204, null), EventSource: FakeSource });
  const seen = [];
  client.subscribe('T', (rec) => {
    seen.push(rec);
    throw new Error('consumer');
  });
  FakeSource.last.listeners.training_records({ data: 'not json' });
  assert.equal(seen.length, 0);
  assert.throws(() => FakeSource.last.emit('training_records', { action: 'update', record: serverRow() }), /consumer/);
});

test('a failed subscription is silent', async () => {
  const fetch = async () => {
    throw new TypeError('offline');
  };
  const client = createClient({ url: URL_, fetch, EventSource: FakeSource });
  client.subscribe('T', () => {});
  await FakeSource.last.emit('PB_CONNECT', { clientId: 'cid' });
  await FakeSource.last.listeners.PB_CONNECT({ data: 'not json' });
});

test('subscribe reads the token at each PB_CONNECT and calls onReconnect at each one after the first', async () => {
  const tokens = [];
  const fetch = async (url, init) => {
    tokens.push(init.headers.Authorization);
    return reply(204, null);
  };
  const client = createClient({ url: URL_, fetch, EventSource: FakeSource });
  let token = 'first';
  let reconnects = 0;
  client.subscribe(() => token, () => {}, { onReconnect: () => { reconnects += 1; } });
  await FakeSource.last.emit('PB_CONNECT', { clientId: 'a' });
  assert.equal(reconnects, 0);
  token = 'second';
  await FakeSource.last.emit('PB_CONNECT', { clientId: 'b' });
  assert.deepEqual(tokens, ['first', 'second']);
  assert.equal(reconnects, 1);
});
