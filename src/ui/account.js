// The account screens (ACC-2): Sign in, with Google or offline, and Waiting for approval, over the
// whole app; the group Account of Settings (ACC-8); and the sync of the doc with the account
// (SYNC-1 to SYNC-13, ACC-11 to ACC-13).
import { createClient, PocketBaseError } from '#pocketbase';
import { createSyncer } from '#syncer';
import { exportJson, exportFilename } from '#storage';
import { loadSession, saveSession, dropSession, routeAtStart, savePending, takePending, loadOffline, saveOffline, dropOffline } from '#session';
import { apiUrl } from '#config';
import { $, storage, state, lost, lang, t, showToast, adopt, setOnSave } from '#ui/context';
import { download } from '#ui/controls';

const SCREENS = ['login', 'waiting'];

// The Google redirect keeps its state and verifier for one tab only (ACC-4).
const pendingStorage = (() => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
})();

// ACC-9: with no storage the app keeps no session, shows no account screen and works as before.
const client = storage
  ? createClient({ url: apiUrl(location.hostname), fetch: window.fetch.bind(window), EventSource: window.EventSource ?? null })
  : null;


// The screen in view, or null.
let screen = null;
// Use offline for this start, when the storage refused the flag (ACC-10).
let offlineNow = false;
// A refresh in progress, so that the start and an `online` event send one request.
let refreshing = null;

const sessionNow = () => (client ? loadSession(storage) : null);

// True while a session is saved: Delete all data then also logs out (SET-2).
export const signedIn = () => sessionNow() !== null;

const isOffline = () => offlineNow || loadOffline(storage);

// The last status of the sync: the offline note, the time of the last sync and an auth stop.
let sync = { online: true, pending: 0, lastSync: null, auth: false };

// True between the question of a logout and its export offer (ACC-13).
let leaving = false;

// ACC-12, ACC-13: a copy of the doc before the device clears it, when the user wants one.
const offerExport = (key) => async (doc) => {
  if (window.confirm(t(key))) download(exportFilename(new Date()), exportJson(doc));
};

const syncer = client
  ? createSyncer({
      client,
      storage,
      getState: () => state,
      setState: adopt,
      lost,
      onStatus: (status) => {
        sync = status;
        // ACC-11: an auth stop shows Sign in over the app.
        if (status.auth && screen === null) show('login');
        else renderAccount();
      },
      // The offer of a logout follows its question; the offer of a login of another user has none.
      offerExport: async (doc) => {
        await offerExport(leaving ? 'account.logoutExport' : 'account.exportAsk')(doc);
        leaving = false;
      },
      confirmLogout: async (count) => {
        leaving = window.confirm(t('account.logoutAsk', { count }));
        return leaving;
      },
    })
  : null;

// SYNC-2: each save queues its changes.
if (syncer) setOnSave((doc, options) => syncer.notify(doc, options));

// SYNC-13: Delete all data stops the sync and forgets the account on this device.
export const resetSync = () => syncer?.reset();

export const renderAccount = () => {
  $('account-group').hidden = !client;
  const session = sessionNow();
  $('account-row').hidden = !session;
  $('logout').hidden = !session;
  $('account-login').hidden = session !== null;
  $('account-email').textContent = session ? session.user.email || session.user.name : '';
  const time = sync.lastSync ? new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(sync.lastSync)) : null;
  $('account-sync').textContent = time ? t('account.lastSync', { time }) : t('account.neverSynced');
  // SYNC-11: the offline note, while a session is saved.
  $('subtitle').textContent = session && !sync.online ? t('account.offlineNote') : '';
};

const show = (name) => {
  screen = name;
  $('auth').hidden = name === null;
  for (const id of SCREENS) $(id).hidden = id !== name;
  if (name) {
    $('auth').setAttribute('aria-labelledby', `${name}-title`);
    $(`${name}-title`).focus();
  }
  renderAccount();
};

const showRoute = (session) => {
  const route = routeAtStart(session, isOffline());
  // ACC-10: an approved session that opens the app removes the flag.
  if (route === 'app' && session) {
    dropOffline(storage);
    offlineNow = false;
  }
  show(route === 'app' ? null : route);
};

const showError = (key) => {
  $('login-error').textContent = key ? t(key) : '';
  $('login-error').hidden = !key;
};

const errorKey = (error) => {
  if (error?.type === 'rate') return 'account.error.tooMany';
  if (!(error instanceof PocketBaseError) || error.type === 'network' || error.type === 'server') return 'account.error.network';
  return 'account.error.google';
};

// The buttons of a screen wait for its request, so that a second tap sends nothing (rate limit).
const busy = async (name, task) => {
  const buttons = [...$(name).querySelectorAll('button')];
  buttons.forEach((button) => {
    button.disabled = true;
  });
  try {
    await task();
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
};

const redirectUrl = () => `${location.origin}${location.pathname}`;

// ACC-12: an approved session logs in to the sync, which merges or clears first.
const enter = async (session) => {
  if (session.user.approved === true && syncer) await syncer.login(session);
  else saveSession(storage, session);
  showRoute(session);
};

// ACC-13: the queue goes first; changes still not sent need a yes. A device with the offline flag
// goes back to the app.
const logout = async () => {
  if (syncer && (await syncer.logout({ online: navigator.onLine })) === 'kept') return;
  dropSession(storage);
  showError(null);
  showRoute(null);
};

// ACC-6: an auth error of a refresh ends the session only; the doc and the queue stay (ACC-11).
const dropAuth = () => {
  dropSession(storage);
  showError(null);
  showRoute(null);
};

// ACC-10: Use offline opens the app, for this start too when the storage refuses the flag.
const useOffline = () => {
  offlineNow = !saveOffline(storage);
  showError(null);
  show(null);
};

// ACC-8: Sign in with Google of Settings, on a device that works offline.
const openLogin = () => {
  showError(null);
  show('login');
};

// ACC-4: the server gives the URL of Google; the state and the verifier wait in sessionStorage.
const google = () =>
  busy('login', async () => {
    showError(null);
    try {
      const { url, pending } = await client.oauthStart(redirectUrl());
      if (!savePending(pendingStorage, pending)) throw new PocketBaseError('storage');
      location.assign(url);
    } catch (error) {
      showError(errorKey(error));
    }
  });

// ACC-4: the return from Google. app.js has removed `code`, `state` and `error` from the URL already.
const finishOAuth = async ({ code, state }) => {
  const pending = takePending(pendingStorage);
  show('login');
  if (!pending || !code) {
    showError('account.error.google');
    return;
  }
  await busy('login', async () => {
    try {
      await enter(await client.oauthFinish({ code, state }, pending, redirectUrl()));
    } catch (error) {
      showError(errorKey(error));
    }
  });
};

// ACC-6: a fresh session carries `approved`. An auth error ends the session; any other error keeps
// it, and the next start or `online` event tries again. Resolves to the fresh session, or null.
const refresh = () => {
  const session = sessionNow();
  if (!session) return Promise.resolve(null);
  refreshing ??= client
    .refresh(session.token)
    .then(async (fresh) => {
      // A logout during the request: the answer saves nothing.
      if (sessionNow()?.token !== session.token) return null;
      await enter(fresh);
      return fresh;
    })
    .catch((error) => {
      if (error?.type === 'auth') dropAuth();
      else if (screen === 'waiting') showToast(t(errorKey(error)));
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
};

// ACC-7: Check again.
const checkAgain = () =>
  busy('waiting', async () => {
    const fresh = await refresh();
    if (fresh && fresh.user.approved !== true) showToast(t('account.waiting.still'));
  });

// ACC-1 and ACC-6: a saved session opens at once, offline too; online, it is refreshed after.
export const startAccount = (oauth) => {
  if (!client) return;
  if (oauth) {
    finishOAuth(oauth);
    return;
  }
  const session = sessionNow();
  showRoute(session);
  // SYNC-3: a sync at the start; a session of before is refreshed first (ACC-6).
  if (session && navigator.onLine) refresh().then(() => syncer.start());
  else if (session) syncer.goOffline();
};

export const goOnline = () => {
  if (client && screen !== 'login') refresh().then(() => syncer.goOnline());
};

export const isAccountOpen = () => screen !== null;

// ACC-2: Sign in over an open app (the offline flag is set) closes with Escape, as Use offline.
export const closeAccount = () => {
  if (screen === 'login' && isOffline()) show(null);
};

export const bind = () => {
  if (!client) return;
  $('login-google').addEventListener('click', google);
  $('waiting-check').addEventListener('click', checkAgain);
  $('waiting-logout').addEventListener('click', logout);
  $('logout').addEventListener('click', logout);
  $('login-offline').addEventListener('click', useOffline);
  $('account-login').addEventListener('click', openLogin);
  window.addEventListener('offline', () => syncer.goOffline());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && sessionNow()) syncer.goVisible(navigator.onLine);
  });
};
