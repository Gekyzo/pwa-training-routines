// The client of the PocketBase server (ACC-3, ACC-4, ACC-6) and of the sync records (SYNC-3,
// SYNC-4, SYNC-6). `fetch` and `EventSource` are injected, so a test runs with no network. No SDK:
// the app calls the REST API of PocketBase directly.
import { APP_SLUG } from '#config';

const USERS = '/api/collections/users';
const ACCESS = '/api/collections/app_access/records';
const APPS = '/api/collections/apps/records';
// SYNC-1: the records of this app, one collection on the server.
export const COLLECTION = 'training_records';
const RECORDS = `/api/collections/${COLLECTION}/records`;
const PAGE = 500;

export class PocketBaseError extends Error {
  constructor(type, status = 0, fields = {}) {
    super(`PocketBase ${type} (${status})`);
    this.type = type;
    this.status = status;
    this.fields = fields;
  }
}

const typeOf = (status) => {
  if (status === 401 || status === 403) return 'auth';
  if (status === 400 || status === 404) return 'invalid';
  // The server limits the rate of requests: the request is fine, and it is worth a retry soon.
  if (status === 429) return 'rate';
  return 'server';
};

// PocketBase answers a duplicate row with a 400 whose field errors carry this code.
const isUniqueViolation = (error) =>
  error instanceof PocketBaseError &&
  error.status === 400 &&
  Object.values(error.fields).some((field) => field?.code === 'validation_not_unique');

const quoted = (text) => `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// `approved` is the access row of this app (ACC-3), not a field of the user.
const sessionOf = ({ token, record }, approved) => ({
  token,
  user: { id: record.id, email: record.email, name: record.name ?? '', approved },
});

// The fields of a server record that the app keeps.
const serverRecOf = ({ id, kind, key, data, deleted, updated }) => ({ id, kind, key, data, deleted: deleted === true, updated });

// Every request for records names the owner: with no owner nothing is sent.
const ofOwner = (owner) => {
  if (!owner) throw new PocketBaseError('auth');
  return `owner = ${quoted(owner)}`;
};

// SYNC-6: a tombstone keeps its data, so only the flag changes.
const bodyOf = ({ op, data }) => (op === 'delete' ? { deleted: true } : { deleted: false, data });

export const createClient = ({ url, fetch, EventSource = null }) => {
  const base = url.replace(/\/+$/, '');

  const call = async (method, path, { token, body, query } = {}) => {
    let response;
    try {
      response = await fetch(`${base}${path}${query ? `?${new URLSearchParams(query)}` : ''}`, {
        method,
        cache: 'no-store',
        headers: {
          ...(token ? { Authorization: token } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new PocketBaseError('network');
    }
    let json = null;
    try {
      json = await response.json();
    } catch {
      // An empty body (204) or a body that is not JSON.
    }
    if (!response.ok) throw new PocketBaseError(typeOf(response.status), response.status, json?.data ?? {});
    if (json === null && response.status !== 204) throw new PocketBaseError('server', response.status);
    return json;
  };

  const findAccess = async (token, userId) => (await call('GET', ACCESS, {
    token,
    query: { filter: `user = ${quoted(userId)} && app.slug = ${quoted(APP_SLUG)}`, perPage: '1' },
  })).items[0] ?? null;

  // ACC-3: with no row, signing in asks for access with a pending row. A row made meanwhile by
  // another device (a duplicate) is read again.
  const accessOf = async (token, userId) => {
    const found = await findAccess(token, userId);
    if (found) return found.status;
    const app = (await call('GET', APPS, { token, query: { filter: `slug = ${quoted(APP_SLUG)}`, perPage: '1' } })).items[0];
    if (!app) throw new PocketBaseError('invalid', 404);
    try {
      return (await call('POST', ACCESS, { token, body: { user: userId, app: app.id, status: 'pending' } })).status;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return (await findAccess(token, userId))?.status ?? 'pending';
    }
  };

  const withAccess = async (auth) => sessionOf(auth, (await accessOf(auth.token, auth.record.id)) === 'approved');

  const findRecord = async (token, { kind, key }, owner) => {
    const page = await call('GET', RECORDS, {
      token,
      query: { filter: `${ofOwner(owner)} && kind = ${quoted(kind)} && key = ${quoted(key)}`, perPage: '1' },
    });
    return page.items[0] ? serverRecOf(page.items[0]) : null;
  };

  const patch = async (token, id, body) => serverRecOf(await call('PATCH', `${RECORDS}/${id}`, { token, body }));

  // A create that the unique index `(owner, kind, key)` refuses (another device made the record
  // meanwhile) patches the record that it finds.
  const create = async (token, change, owner) => {
    try {
      return serverRecOf(await call('POST', RECORDS, { token, body: { owner, kind: change.kind, key: change.key, ...bodyOf(change) } }));
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const found = await findRecord(token, change, owner);
      if (!found) throw error;
      return patch(token, found.id, bodyOf(change));
    }
  };

  // Keyset pages: each request asks for the records after the last one received, by (updated, id),
  // not for a page number. A record edited during the walk moves to the end and is read again; with
  // numbered pages it shifts the others back by one, and the record at the page border is skipped
  // for good (SYNC-4).
  const keyset = async (token, path, base, first, map) => {
    const all = [];
    let filter = first;
    for (;;) {
      const result = await call('GET', path, { token, query: { filter, sort: 'updated,id', perPage: String(PAGE), page: '1' } });
      all.push(...result.items.map(map));
      const last = result.items.at(-1);
      if (!(result.totalPages > 1) || !last) return all;
      const at = quoted(last.updated);
      filter = `${base} && (updated > ${at} || (updated = ${at} && id > ${quoted(last.id)}))`;
    }
  };

  return {
    oauthStart: async (redirectUrl) => {
      const methods = await call('GET', `${USERS}/auth-methods`);
      const provider = methods.oauth2?.providers?.find(({ name }) => name === 'google');
      if (!provider) throw new PocketBaseError('invalid', 404);
      return {
        url: provider.authURL + encodeURIComponent(redirectUrl),
        pending: { provider: provider.name, state: provider.state, codeVerifier: provider.codeVerifier },
      };
    },

    // The body carries no createData: access is a row of its own (ACC-3).
    oauthFinish: async ({ code, state }, pending, redirectUrl) => {
      if (state !== pending.state) throw new PocketBaseError('state');
      return withAccess(
        await call('POST', `${USERS}/auth-with-oauth2`, {
          body: { provider: pending.provider, code, codeVerifier: pending.codeVerifier, redirectURL: redirectUrl },
        }),
      );
    },

    refresh: async (token) => withAccess(await call('POST', `${USERS}/auth-refresh`, { token })),

    // SYNC-4: every record of the owner with `updated` at or after the cursor, oldest first; an
    // empty cursor pulls every record.
    pull: async (token, since, owner) => {
      const filter = since ? `${ofOwner(owner)} && updated >= ${quoted(since)}` : ofOwner(owner);
      return keyset(token, RECORDS, ofOwner(owner), filter, serverRecOf);
    },

    // SYNC-6: the record of `(kind, key)` is patched, or created for an upsert. A delete never
    // creates: with no record on the server it resolves to null.
    push: async (token, change, owner) => {
      const found = await findRecord(token, change, owner);
      if (found) return patch(token, found.id, bodyOf(change));
      if (change.op === 'delete') return null;
      return create(token, change, owner);
    },

    // SYNC-3: the returned function closes the stream. A failed subscription is silent: the sync
    // also runs at the start, at `online` and after a save, so the stream only makes a sync sooner.
    // `token` is a text or a function that gives the token at each connect, since the browser
    // connects again by itself and by then the token may be a refreshed one. `onReconnect` runs at
    // each connect after the first: the stream missed the changes of the time between.
    subscribe: (token, onChange, { onReconnect = () => {} } = {}) => {
      // With no EventSource (an old browser, or a test) there is no stream: the other syncs remain.
      if (typeof EventSource !== 'function') return () => {};
      const tokenOf = typeof token === 'function' ? token : () => token;
      const source = new EventSource(`${base}/api/realtime`);
      let connects = 0;
      source.addEventListener('PB_CONNECT', async (event) => {
        connects += 1;
        if (connects > 1) onReconnect();
        try {
          const { clientId } = JSON.parse(event.data);
          await call('POST', '/api/realtime', { token: tokenOf(), body: { clientId, subscriptions: [COLLECTION] } });
        } catch {
          // See above.
        }
      });
      source.addEventListener(COLLECTION, (event) => {
        let rec;
        try {
          const { action, record } = JSON.parse(event.data);
          rec = serverRecOf(action === 'delete' ? { ...record, deleted: true } : record);
        } catch {
          return; // A malformed event is dropped.
        }
        onChange(rec);
      });
      return () => source.close();
    },
  };
};
