// The sync driver: it queues each save, sends the queue, pulls the account and merges it into the
// doc (SYNC-2 to SYNC-13), keeps the realtime stream open, and runs the login and the logout of the
// account (ACC-11 to ACC-13). It is the driver of the shopping list with one lane and no shares.
// The client, the storage, the clock and the timers are injected, so a test runs with no network.
import { toRecords, fromRecords, diffRecords, recordKey } from '#records';
import { enqueue, mergePulled, checkRecords, dedupe, cursorOf } from '#sync';
import { loadSession, saveSession, SESSION_KEY } from '#session';
import { PocketBaseError } from '#pocketbase';
import { emptyTraining, TRAINING_KEY } from '#training';
import { keyOf } from '#storage';

// 09-sync §Keys: the sync state and the queue of the changes not sent.
export const SYNC_KEY = keyOf('sync');
export const QUEUE_KEY = keyOf('queue');

// SYNC-9: a save starts a sync after this delay; a new save in that time starts the delay again.
export const DEBOUNCE_MS = 1500;
// SYNC-9: after a stop at the rate limit or at a server error, the next run starts after these
// delays in turn (the last one repeats); a run that reaches the server ends the series.
export const RETRY_MS = [5_000, 15_000, 30_000, 60_000];
// ACC-11: a token is refreshed at least this often, so that a lost approval stops the sync.
export const REFRESH_MS = 10 * 60_000;
// ACC-11: a token counts as expired this long before its `exp` claim.
const MARGIN_MS = 60_000;

const isObject = (value) => typeof value === 'object' && value !== null;

const read = (storage, key) => {
  try {
    const text = storage.getItem(key);
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
};

const write = (storage, key, value) => {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const emptySync = () => ({ owner: null, cursor: '', server: new Map(), local: new Map(), lastSync: null });

const MAPS = ['server', 'local'];
const isEntries = (list) => Array.isArray(list) && list.every((entry) => Array.isArray(entry) && entry.length === 2);

// 09-sync §Keys: the owner of the stored data, the cursor, the last known server records, the records of
// the last doc that the sync knows and the time of the last sync. A bad value gives the empty state.
export const loadSyncState = (storage) => {
  const data = read(storage, SYNC_KEY);
  const valid =
    isObject(data) &&
    (data.owner === null || typeof data.owner === 'string') &&
    typeof data.cursor === 'string' &&
    MAPS.every((name) => isEntries(data[name]));
  if (!valid) return emptySync();
  return {
    owner: data.owner,
    cursor: data.cursor,
    server: new Map(data.server),
    local: new Map(data.local),
    lastSync: typeof data.lastSync === 'string' ? data.lastSync : null,
  };
};

export const saveSyncState = (storage, sync) =>
  write(storage, SYNC_KEY, { owner: sync.owner, cursor: sync.cursor, server: [...sync.server], local: [...sync.local], lastSync: sync.lastSync ?? null });

const isChange = (change) =>
  isObject(change) && typeof change.kind === 'string' && typeof change.key === 'string' && ['upsert', 'delete'].includes(change.op);

export const loadQueue = (storage) => {
  const queue = read(storage, QUEUE_KEY);
  return Array.isArray(queue) ? queue.filter(isChange) : [];
};

export const saveQueue = (storage, queue) => write(storage, QUEUE_KEY, queue);

// ACC-11: true when the `exp` claim of the token is within 60 s of `now` (ms), or the token cannot be read.
export const tokenExpired = (token, now) => {
  try {
    const payload = token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    const { exp } = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return typeof exp !== 'number' || exp * 1000 - MARGIN_MS <= now;
  } catch {
    return true;
  }
};

// Why a request failed, as the result of the run. PocketBase answers a refused rule with a 400 and
// no field error (a token that is not valid counts as a guest), so that is an auth error too.
const stopOf = (error) => {
  if (error?.type === 'auth') return 'auth';
  if (error?.type === 'invalid' && Object.keys(error.fields ?? {}).length === 0) return 'auth';
  // SYNC-9, SYNC-11: a rate limit is not offline, and a server error is retried; both name their stop.
  if (error?.type === 'rate') return 'rate';
  if (error?.type === 'server') return 'server';
  return 'offline';
};

// An error that is not of the client is a bug: the run logs it and stops as offline.
const known = (error) => {
  if (!(error instanceof PocketBaseError)) throw error;
  return error;
};

const badData = (error) => error?.type === 'invalid' && Object.keys(error.fields ?? {}).length > 0;

const plain = ({ kind, key, data }) => ({ kind, key, data });

const listed = (rec) => rec.kind !== 'settings';

// SYNC-2: `records` hold none of the entities of `local`, and `local` holds some.
const holdsNone = (local, records) => {
  const entities = [...local.values()].filter(listed);
  return entities.length > 0 && entities.every((rec) => !records.has(recordKey(rec.kind, rec.key)));
};

// SYNC-10: the records that the server holds and that are not tombstones.
const liveServer = (server) => new Map([...server].filter(([, rec]) => !rec.deleted).map(([id, rec]) => [id, plain(rec)]));

// Returned by a run that a reset made stale: it stops with no save and no change of the doc.
const STALE = Symbol('stale');

export const createSyncer = ({
  client,
  storage,
  getState,
  // Puts a merged doc in place. The app saves it and renders, and does not call notify for it.
  setState,
  now = Date.now,
  onStatus = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  // ACC-12, ACC-13: offers the doc as an export file before the device clears it. Resolves when done.
  offerExport = async () => {},
  // ACC-13: asks whether to log out and lose `count` changes not sent. Resolves to true to go on.
  confirmLogout = async () => false,
  // SYNC-2: true when the start could not read the stored doc and fell back to the empty doc.
  lost = false,
}) => {
  let sync = loadSyncState(storage);
  let queue = loadQueue(storage);
  // SYNC-2: a lost doc is no base: the account is pulled again in full, so the lost doc deletes nothing.
  if (lost && sync.owner !== null) {
    sync = { ...sync, local: toRecords(emptyTraining()), cursor: '' };
    saveSyncState(storage, sync);
  }
  // The records of the last doc that the syncer saw: at the start, of a save, or that it put in place.
  let seen = toRecords(getState());

  let online = true;
  let lastRefresh = null;
  let running = null;
  let timer = null;
  // SYNC-9: the timer of the retry after a rate limit or a server error, and the delays used in a row.
  let retryTimer = null;
  let retries = 0;
  // A reset (a logout, Delete all data, a login that clears) starts a new generation: a run of an
  // older one is stale.
  let generation = 0;
  // ACC-11: after an auth stop no sync makes a request until a login, so the rate limit of the auth
  // endpoints stays free for that login.
  let authStopped = false;
  // SYNC-11: counts the runs that the server answered (ok, a rate limit, an auth error).
  let reached = 0;
  // SYNC-3: the close function of the realtime stream, or null.
  let stream = null;

  const persist = () => {
    saveQueue(storage, queue);
    saveSyncState(storage, sync);
  };

  // `auth` is true after an auth stop until the next login (ACC-11): the app then shows Sign in.
  const status = () => ({ online, pending: queue.length, lastSync: sync.lastSync ?? null, auth: authStopped, reached });
  const report = () => onStatus(status());

  const put = (next) => {
    seen = toRecords(next);
    setState(next);
  };

  // The run only syncs for the user that a finished login made the owner of the stored data.
  const activeSession = () => {
    const session = loadSession(storage);
    return session && session.user.approved === true && sync.owner === session.user.id ? session : null;
  };

  // SYNC-2: a doc that never held the entities of the account since the start (a doc that fell back
  // to the empty one) does not delete them. A user who deletes them one by one, or an import
  // (`explicit`, SYNC-10), still does.
  const refused = (records, explicit) => {
    if (explicit || !holdsNone(sync.local, records) || !holdsNone(sync.local, seen)) return false;
    console.error('sync: a doc with none of the entities of the account is not sent');
    return true;
  };

  // SYNC-2: the changes of `doc` against the last doc that the sync knows. An import (`explicit`)
  // also deletes each live record of the server that it does not hold (SYNC-10).
  const noted = (doc, explicit) => {
    const records = toRecords(doc);
    if (refused(records, explicit)) return false;
    seen = records;
    const base = explicit ? new Map([...liveServer(sync.server), ...sync.local]) : sync.local;
    queue = enqueue(queue, diffRecords(base, records));
    sync = { ...sync, local: records };
    persist();
    return true;
  };

  // SYNC-2: a save that notify did not queue (no approval, a login in progress) is queued at the
  // next run, so that the merge cannot overwrite it.
  const catchUp = () => {
    const doc = getState();
    if (doc !== null) noted(doc, false);
  };

  // ACC-11: refresh an expired token, and any token after REFRESH_MS. The answer carries `approved`.
  // Resolves to a token, or to the result of the run when there is none to use. `force` refreshes
  // any token (SYNC-6).
  const freshToken = async (session, live, { force = false } = {}) => {
    const recent = lastRefresh !== null && now() - lastRefresh <= REFRESH_MS;
    if (!force && recent && !tokenExpired(session.token, now())) return { token: session.token };
    let fresh;
    try {
      fresh = await client.refresh(session.token);
    } catch (error) {
      return { stop: live() ? stopOf(known(error)) : STALE };
    }
    if (!live()) return { stop: STALE };
    lastRefresh = now();
    saveSession(storage, fresh);
    // ACC-11: an account that is no longer approved makes no request for data.
    return fresh.user.approved === true ? { token: fresh.token } : { stop: 'ok' };
  };

  // SYNC-6: a delete that finds no record of a known live record: a token that is not valid finds
  // no record either. Only after a good refresh is the record gone for real.
  const knownLive = (change) => {
    const rec = sync.server.get(recordKey(change.kind, change.key));
    return rec !== undefined && !rec.deleted;
  };

  // SYNC-8: each change in order. A change leaves the queue only after the server took it, and the
  // queue is saved at once, so a run that stops sends no change twice as a new record.
  const pushAll = async (session, firstToken, live) => {
    let token = firstToken;
    for (let change = queue[0]; change; change = queue[0]) {
      let rec;
      try {
        rec = await client.push(token, change, session.user.id);
      } catch (error) {
        if (!live()) return STALE;
        if (!badData(known(error))) return stopOf(error);
        // SYNC-8: the server refuses this data (`rec` stays undefined): the change leaves the queue,
        // stays local, and the next changes go on.
        console.error('sync: the server refuses a change', recordKey(change.kind, change.key));
      }
      if (!live()) return STALE;
      if (rec === null && knownLive(change)) {
        const fresh = await freshToken(loadSession(storage) ?? session, live, { force: true });
        if (fresh.stop) return fresh.stop;
        token = fresh.token;
      }
      const id = recordKey(change.kind, change.key);
      const server = new Map(sync.server);
      if (rec) server.set(id, rec);
      else if (rec === null) server.delete(id);
      sync = { ...sync, server };
      // By identity: a save during the push may have replaced the change with a newer one.
      queue = queue.filter((queued) => queued !== change);
      persist();
    }
    return null;
  };

  // SYNC-5 to SYNC-8: the pulled records go into the doc; a queued change wins. Returns false when
  // the validation refuses the merged records: then the doc, the queue and the cursor stay, and the
  // next sync pulls those records again.
  const merge = (pulled) => {
    const merged = mergePulled({ local: sync.local, server: sync.server, queue, pulled });
    const checked = checkRecords(merged.local);
    if (checked.dropped.length > 0) console.error('sync: records that the validation refuses are dropped', checked.dropped);
    const deduped = dedupe(checked.local, merged.server);
    const next = fromRecords(deduped.local);
    if (next === null) return false;
    queue = enqueue(queue, deduped.removed);
    const nextRecords = toRecords(next);
    const current = getState();
    if (current === null || diffRecords(toRecords(current), nextRecords).length > 0) put(next);
    else seen = nextRecords;
    // The validation can fix a record (the settings): the server gets that too.
    queue = enqueue(queue, diffRecords(deduped.local, nextRecords));
    sync = { ...sync, server: merged.server, local: nextRecords, cursor: cursorOf(pulled, sync.cursor) };
    return true;
  };

  // Resolves to the result of the run and whether the merge queued changes to send soon.
  const syncOnce = async (live) => {
    const session = activeSession();
    // No finished login: nothing to sync, and the server was not asked.
    if (!session) return { result: 'ok', idle: true };
    catchUp();
    const { token, stop } = await freshToken(session, live);
    if (stop) return { result: stop };
    const stopped = await pushAll(session, token, live);
    if (stopped) return { result: stopped };
    let pulled;
    try {
      pulled = await client.pull(token, sync.cursor, session.user.id);
    } catch (error) {
      return { result: live() ? stopOf(known(error)) : STALE };
    }
    if (!live()) return { result: STALE };
    const merged = merge(pulled);
    sync = { ...sync, lastSync: new Date(now()).toISOString() };
    persist();
    return { result: 'ok', followUp: merged && queue.length > 0 };
  };

  const disconnect = () => {
    stream?.();
    stream = null;
  };

  // SYNC-3: the realtime stream starts a sync at each change of the account and at each connect
  // after the first. Only for a finished login, with no auth stop and no `offline` event.
  const connect = () => {
    disconnect();
    const session = activeSession();
    if (!session || !online || authStopped || typeof client.subscribe !== 'function') return;
    const onEvent = () => {
      run();
    };
    stream = client.subscribe(() => loadSession(storage)?.token ?? session.token, onEvent, { onReconnect: onEvent });
  };

  const cancelRetry = () => {
    if (retryTimer !== null) clearTimer(retryTimer);
    retryTimer = null;
  };

  const scheduleRetry = () => {
    cancelRetry();
    const delay = RETRY_MS[Math.min(retries, RETRY_MS.length - 1)];
    retries += 1;
    retryTimer = setTimer(() => {
      retryTimer = null;
      return run();
    }, delay);
  };

  const schedule = () => {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      return run();
    }, DEBOUNCE_MS);
  };

  // A run while one of the same generation is in progress gets the promise of that run. Resolves to
  // 'ok', 'offline', 'rate' or 'auth'.
  const run = () => {
    if (authStopped) {
      report();
      return Promise.resolve('auth');
    }
    if (running?.generation === generation) return running.promise;
    const mine = { generation };
    const live = () => mine.generation === generation;
    mine.promise = (async () => {
      let outcome;
      try {
        outcome = await syncOnce(live);
      } catch (error) {
        console.error(error);
        outcome = { result: 'offline' };
      } finally {
        if (running === mine) running = null;
      }
      let { result } = outcome;
      if (result === STALE || !live()) return 'ok';
      if (result === 'auth') {
        authStopped = true;
        disconnect();
      }
      const retry = result === 'rate' || result === 'server';
      if (result === 'server') result = 'offline';
      // SYNC-11: only a stop at the network or at a server error counts as offline; a rate limit
      // keeps the queue and the online status.
      if (!outcome.idle) online = result !== 'offline';
      if (online && !outcome.idle) {
        reached += 1;
        // SYNC-3: a run that reached the server opens the stream again.
        if (stream === null && !authStopped) connect();
      }
      if (retry) scheduleRetry();
      else {
        cancelRetry();
        if (result === 'ok') retries = 0;
      }
      // SYNC-7: the merge can queue a tombstone or a fix of the validation: a sync soon sends it.
      if (outcome.followUp) schedule();
      report();
      return result;
    })();
    running = mine;
    return mine.promise;
  };

  // SYNC-2: each save of the doc. The syncer never calls it for its own setState. A device with no
  // finished login keeps no queue. After an auth stop the change waits in the queue for the login
  // (ACC-11). `explicit` marks an import (SYNC-10).
  const notify = (doc, { explicit = false } = {}) => {
    if (!activeSession()) return;
    noted(doc, explicit);
    report();
    if (!authStopped) schedule();
  };

  // SYNC-13, ACC-12, ACC-13: the sync stops and the device forgets the account. A run in progress
  // becomes stale: it saves nothing and changes no doc after this.
  const clear = () => {
    generation += 1;
    if (timer !== null) clearTimer(timer);
    timer = null;
    cancelRetry();
    retries = 0;
    disconnect();
    sync = emptySync();
    queue = [];
    lastRefresh = null;
    authStopped = false;
    try {
      [SESSION_KEY, SYNC_KEY, QUEUE_KEY, TRAINING_KEY].forEach((key) => storage.removeItem(key));
    } catch {
      // Storage is not available: nothing is stored either.
    }
    put(emptyTraining());
  };

  // ACC-12, SYNC-8: the login of an approved session. Another user than the owner of the stored
  // data clears the device first, after an export offer when the queue is not empty. The first
  // login of a device merges: the base of the sync is the empty doc, so each local entity is queued.
  // Resolves to 'waiting' for an account that is not approved, else 'synced'.
  const login = async (session) => {
    authStopped = false;
    saveSession(storage, session);
    lastRefresh = now();
    // ACC-11: no request for data, and the local doc stays as it is.
    if (session.user.approved !== true) {
      report();
      return 'waiting';
    }
    const userId = session.user.id;
    // A queue with no owner is the queue of an unknown user.
    const another = (sync.owner !== null && sync.owner !== userId) || (sync.owner === null && queue.length > 0);
    if (another) {
      if (queue.length > 0) await offerExport(getState());
      clear();
      saveSession(storage, session);
      lastRefresh = now();
    }
    if (sync.owner !== userId) {
      const records = toRecords(getState());
      queue = enqueue(queue, diffRecords(toRecords(emptyTraining()), records));
      sync = { ...emptySync(), owner: userId, local: records };
      seen = records;
      persist();
    }
    // A run in progress uses the token of before the login: it becomes stale, so that its auth
    // error cannot stop the sync of this login, and the login starts a run of its own.
    generation += 1;
    await run();
    return 'synced';
  };

  // ACC-13: online, the queue goes first. Changes that are still not sent need a yes, then an
  // export offer. Resolves to 'done', or 'kept' when the user keeps the session.
  // A session that does not own the stored data (it waits for approval, or its login is not
  // finished) never synced the doc: only the session goes, and the doc stays.
  const logout = async ({ online: isOnline = online } = {}) => {
    const session = loadSession(storage);
    if (session === null || sync.owner !== session.user.id) {
      try {
        storage.removeItem(SESSION_KEY);
      } catch {
        // Nothing more to remove.
      }
      report();
      return 'done';
    }
    if (isOnline && activeSession()) await run();
    if (queue.length > 0) {
      if (!(await confirmLogout(queue.length))) return 'kept';
      await offerExport(getState());
    }
    clear();
    online = true;
    report();
    return 'done';
  };

  // SYNC-13: Delete all data. The sync stops, the queue is dropped, and the device forgets the
  // account; nothing is sent and the account keeps its data.
  const reset = () => {
    clear();
    online = true;
    report();
  };

  // ACC-12: a saved approved session whose login is not finished (the app closed during the export
  // offer) refreshes its token before that login goes on: a token that is no longer valid would pull
  // nothing. An auth error removes the session; a network error waits for the next start.
  const resume = async (session) => {
    let fresh;
    try {
      fresh = await client.refresh(session.token);
    } catch (error) {
      if (!(error instanceof PocketBaseError)) {
        console.error(error);
        return 'offline';
      }
      if (error.type !== 'auth') return stopOf(error) === 'server' ? 'offline' : stopOf(error);
      try {
        storage.removeItem(SESSION_KEY);
      } catch {
        // Nothing more to remove.
      }
      report();
      return 'auth';
    }
    const result = await login(fresh);
    return result === 'waiting' ? 'waiting' : 'ok';
  };

  // SYNC-3: the start of the app. A sync, then the stream. Resolves to the result of the run.
  const start = async () => {
    const session = loadSession(storage);
    if (session?.user.approved === true && sync.owner !== session.user.id) return resume(session);
    const result = await run();
    connect();
    return result;
  };

  // SYNC-3, SYNC-11: the `online` event. The offline note goes, a sync starts, then the stream opens.
  const goOnline = async () => {
    online = true;
    report();
    return start();
  };

  // SYNC-3, SYNC-11: the `offline` event closes the stream and shows the offline note.
  const goOffline = () => {
    online = false;
    disconnect();
    report();
  };

  // SYNC-11: the app shows again (`visibilitychange` to visible). Some phones send no `online`
  // event, so a browser that says it is online counts as one.
  const goVisible = (browserOnline) => (browserOnline ? goOnline() : Promise.resolve('offline'));

  return { notify, run, start, login, logout, reset, status, goOnline, goOffline, goVisible, connect, disconnect };
};
