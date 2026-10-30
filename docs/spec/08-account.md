# Account

The account and the approval gate. The server is the PocketBase server of `pwa-server`: one
account serves every app, and the administrator approves access per app. The app talks to it
with `fetch` and `EventSource`, with no SDK. The doc stays on the device, and a device with an
approved account also syncs it ([09-sync.md](09-sync.md)). The user picks one of two ways in:
**Continue with Google**, or **Use offline** with no account.

## Rules

- **ACC-1** The start routes by the saved session, then by the offline flag (ACC-10): a session
  that is not approved opens **Waiting for approval**; an approved session opens the app; no
  session and the flag opens the app; no session and no flag opens **Sign in**. The route never
  reads the clock.
- **ACC-2** **Sign in** has the app icon, the title, one line of text, **Continue with
  Google** and **Use offline**. **Waiting for approval** has **Check again** and **Log out**. Both
  cover the whole app, the walkthrough too. **Use offline** closes **Sign in** (ACC-10); with the
  offline flag set, `Escape` closes it too. Else `Escape` does nothing while one is open. An
  error shows below the button: `account.error.google`, `account.error.network` or
  `account.error.tooMany`. A button waits for its request, so a second tap sends nothing.
- **ACC-3** "Approved" is the `app_access` row of the app `APP_SLUG` with the status
  `approved`. Each sign-in and each refresh reads it. With no row, the app creates a `pending`
  one; a duplicate row that another device made meanwhile is read again. The server URL is
  `http://localhost:8090` on a local host, else `https://artisandevs.duckdns.org`.
- **ACC-4** Google sign-in is a redirect. The app asks the server for the URL of the provider,
  keeps the state and the verifier in `sessionStorage` (`pwa-training-routines.oauth`), and sends the browser
  there with the URL of the app as the return address. On return the app removes `code`, `state`
  and `error` from the URL at once and keeps each other parameter. A return with no `code` (a
  cancel at Google), with no pending sign-in or with another `state` shows **Sign in** with
  `account.error.google`.
- **ACC-5** The session, the token and the user, is stored in `pwa-training-routines.session`.
- **ACC-6** At the start when online, and at the `online` event, the app refreshes a saved
  session. An approved session keeps the app open; a session that is no longer approved opens
  **Waiting for approval**; an auth error removes the session and opens **Sign in**. A network or
  server error changes nothing. A logout during the request makes the answer save nothing.
- **ACC-7** **Check again** refreshes the session as ACC-6. A session that is still not approved
  shows the toast `account.waiting.still`.
- **ACC-8** Settings has the group **Account**: with a session, the email and **Log out**; with
  none, **Sign in with Google**, which opens **Sign in**. **Log out** follows ACC-13; the
  preferences stay. It then routes as ACC-1: with the offline flag the app stays open, else
  **Sign in** shows. Under the email the group shows the time of the last sync
  (`account.lastSync`, or `account.neverSynced` before the first one).
- **ACC-9** With no `localStorage` the app shows no account screen and works as before.
- **ACC-10** The offline flag is `pwa-training-routines.offline` = `1` in `localStorage`. **Use offline**
  writes it; an approved session that opens the app removes it. A storage that refuses the
  write still opens the app for this start.
- **ACC-11** A token counts as expired 60 s before its `exp` claim, or when the app cannot read it.
  Before the first request for data of a sync, the app refreshes the token when it is expired or
  when the last refresh is more than 10 minutes old. Each refresh reads the access row again
  (ACC-3): an account that is no longer approved makes no request for data. After an auth error
  the sync stops and the app shows **Sign in**; it keeps the doc and the queue. Until the next
  login a save goes into the queue and no sync makes a request, so the rate limit of the auth
  endpoints stays free for that login. A login of the same user continues the sync.
- **ACC-12** A login of another user than the owner of the stored data first clears the doc, the
  queue and the sync state of the previous user, never a device preference. When the queue is not
  empty, the app first offers an export (`account.exportAsk`); after the export, or when the user
  declines it, the login clears and goes on. A queue with no stored owner counts as the queue of
  another user. A device with no stored owner and no queue clears nothing: its first login merges
  (SYNC-12). A saved approved session whose login is not finished (the app closed during the
  offer) refreshes its token at the next start, then the login goes on; an auth error removes the
  session, and a network error waits for the next start.
- **ACC-13** **Log out** when online sends the queue first, then clears the doc, the queue, the
  sync state and the session. When the queue is still not empty after that (offline, or the sync
  stopped), the app warns that the changes not sent are lost and asks `account.logoutAsk`: a no
  stops the logout and changes nothing. A yes then offers an export (`account.logoutExport`).
  After the export, or when the user declines it, the logout clears the same data. A session that
  does not own the stored data (it waits for approval) removes only the session, and the doc stays.
  A sync in progress at the logout, or at a login that clears, saves nothing and changes no doc
  after it.

## Set-up outside the app

- The server has a row in `apps`: slug `pwa-training-routines`, url `https://gekyzo.github.io/pwa-training-routines/`.
- The Google OAuth client has the redirect URIs `https://gekyzo.github.io/pwa-training-routines/` and
  `http://localhost:8080/` (`npm run serve`).
