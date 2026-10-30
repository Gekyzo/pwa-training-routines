# Sync between devices

The training doc lives on each device for offline use. A device signed in to an approved account
also syncs it with the PocketBase server of `pwa-server`. The rules copy the sync of
`pwa-shopping-list` with no shares; the account rules of the sync are ACC-11 to ACC-13. Its pure modules are `src/records.js` and `src/sync.js`; the
driver `src/syncer.js` takes the client, the storage, the clock and the timers as parameters. Each
has a test file of the same name.

## Records

- **SYNC-1** The server holds one record for each category, each exercise, each routine, each
  workout and one for the settings. A record has `owner`, `kind` (`category`, `exercise`,
  `routine`, `workout` or `settings`), `key`, `data`, `deleted` and `updated`. The key is the `id`
  of the entity, and `settings` for the settings. `data` is the entity without its `id`; for the
  settings it is `{ unit, rest }`. In the app a record is named `<kind>:<key>`. A record carries no
  position: the app sorts each list when it reads it (TRN-3), so an add sends one record. The doc
  of a set of records is valid by TRN-2, its lists in any order; with no settings record it has the
  default settings. A device preference does not sync: the language, the hand, the theme, the
  modules, the walkthrough and the seen version. The rest timer and the workout in view do not
  sync either.
- **SYNC-2** Each save of the doc is compared with the last doc that the sync knows: the doc of
  the last save or of the last merge. The diff gives the deletes first, then the upserts, each
  sorted by record name; a record whose `data` differs only in the order of its keys is no change.
  The changes go into the queue. A later change of one record replaces its earlier change and moves
  to the end. A device with no finished login of an approved account keeps no queue. The doc that a
  merge puts in place is not a save: it queues nothing by itself. Each sync first compares the doc
  with the last doc that the sync knows, so a save that was not queued (no approval, a login in
  progress) is queued then and the merge does not lose it.
  A doc that held none of the categories, exercises, routines and workouts of the account since the
  start (a doc that fell back to the empty one, TRN-1) does not delete them: the app logs the
  refusal, queues nothing, and the next merge puts the account back in place. The user who deletes
  them, one by one or all at once, and an import (SYNC-10) still delete them. When the start could
  not read the stored doc, the sync takes the empty doc as its base and pulls the whole account
  again, so the lost doc deletes nothing on the server.

## Server

The collection `training_records` of `pwa-server` holds the records, in the shape of
`wardrobe_records` (migration `8_wardrobe_records.js`):

| Field | Type |
|---|---|
| `owner` | relation to `users`, required, cascade delete |
| `kind` | select: `category`, `exercise`, `routine`, `workout`, `settings` |
| `key` | text, required, max 64 |
| `data` | json, max 65 536 bytes |
| `deleted` | bool |
| `created`, `updated` | autodate |

The index `(owner, kind, key)` is unique. Each rule is `owner = @request.auth.id` and the approved
`app_access` row of the app `pwa-training-routines`; a create and an update also need
`@request.body.owner = @request.auth.id` when the body sets it. The realtime events follow the list
and view rules. The migration lives in `pwa-server`; this app only reads and writes the records.

## Client

- **SYNC-3** The realtime stream connects to `/api/realtime` with `EventSource` and subscribes to
  `training_records`. At each connect it sends the token that the device holds then, so a
  reconnect of the browser after a refresh uses the fresh token. Each connect after the first
  starts a sync, for the changes that the stream missed. A failed subscription is silent, and a
  malformed event is dropped. Each event starts a sync. The stream opens after the sync of the
  start or of the `online` event, and again after any sync that reached the server while it was
  closed. It closes at the `offline` event, at an auth error, at a logout and at a reset. It opens
  only for a finished login of an approved account.
- **SYNC-4** A pull asks for each record of the owner with `updated` at or after the cursor, oldest
  first, page by page; an empty cursor pulls every record. A record pulled twice is harmless. Every
  request for records names the owner: with no owner the client sends nothing and answers an
  auth error.

## Merge

- **SYNC-5** A change that is queued wins over a pulled record of the same `kind` and `key`.
- **SYNC-6** A delete is a record with `deleted: true`, so that the delete reaches the other
  devices. The delete changes only that flag: the record keeps its `data`. A pulled record with
  `deleted` counts as absent. A push finds the record by `kind` and `key` and patches it. A delete
  of a record that the server does not hold creates nothing. An upsert of a record that is not on
  the server creates it, a tombstone gets its data back, and a create that the unique index refuses
  (another device made the record meanwhile) patches that record.
- **SYNC-7** The merge never gives a doc that the validation refuses:
  - It checks each record alone, as a doc that holds only that entity, with empty other lists. A
    reference to an entity that is not there is valid (TRN-5), so a workout can come before its
    exercise. A record that the check refuses is dropped from the doc with no tombstone, and the
    app logs it; the other records go on. A record of another kind, or a settings record whose key
    is not `settings`, is refused too.
  - Of two categories, two exercises or two routines with one name, with no regard to case and
    after a trim, the record with the newer `updated` stays and the other gets a tombstone that
    the app sends. A record that is not on the server yet counts as the newest; with equal ages
    the greater key stays. A workout has no name to compare.

## Driver

- **SYNC-8** A sync is online only and runs in this order: it refreshes the token when needed, sends
  the queue in order, pulls from the cursor, merges the records into the doc and applies again the
  changes that are still queued (SYNC-5). A change leaves the queue, and the queue is saved, only
  after the server took it, so a sync that stops sends no change twice as a new record. A network
  error or a server error (5xx) stops the sync before the pull and keeps the changes not sent; the
  next sync starts again at the first change not sent. A change that the server refuses as bad data
  (a 400 with field errors) leaves the queue, stays local and is logged; the next changes go on. A
  refused rule (a 400 with no field error, as PocketBase answers a token that is not valid) and a
  401 or a 403 are an auth stop. A delete that finds no record of a record that the sync knows on
  the server refreshes the token first: after a good refresh the record is gone and the delete leaves
  the queue; an auth error is an auth stop and the delete stays queued. An error that is not of the
  server or of the network is logged, and the sync stops as offline. A sync that starts while one
  runs is that same sync.
- **SYNC-9** A sync starts at the start of the app, at the `online` event, 1.5 s after the last save
  of a burst, and at a realtime event (SYNC-3). When a merge queues changes (a tombstone of SYNC-7, a
  fix of the validation), a sync starts 1.5 s later to send them. When a sync stops at the rate
  limit of the server (a 429) or at a server error (a 5xx), the queue stays and a sync starts again
  after 5 s, then 15 s, 30 s and 60 s, and then every 60 s; a sync that reaches the server ends the
  series. A stop at the network starts no retry: the `online` event does.
- **SYNC-10** The import replaces the data of the account, so on every device. The next sync sends
  a tombstone for each live record of the server that the import does not hold, also a record that
  the doc never held, and an upsert for the others. The import is the one save that can replace
  the whole account with no regard to SYNC-2.
- **SYNC-11** The status of the sync is offline after the `offline` event, or after a sync that
  stopped at the network or at a server error. It is online again after the `online` event or after
  a sync that the server answered (ok, a rate limit or an auth error), even when the browser sent no
  `online` event, as some phones do after airplane mode. A stop at the rate limit is not offline.
  When the app shows again (`visibilitychange` to visible) and the browser says it is online, this
  counts as the `online` event. While the status is offline and a session is saved, a note says
  `account.offlineNote`. The status also gives the number of changes not sent, the time of the last
  sync and whether the sync stopped at an auth error (ACC-11).
- **SYNC-12** The first login of a device merges the device and the account: the base of the sync
  is the empty doc, so each local category, exercise, routine and workout, and settings that are not
  the defaults, go into the queue, and the pull brings the entities of the account. An entity on
  both sides (one id) keeps the copy of the device, as a queued change wins (SYNC-5). Two entities
  with one name keep the newer (SYNC-7). The default settings of the device are no change, so a
  device with no data takes the settings of the account. A login starts a sync of its own; a sync in
  progress with the token of before the login cannot stop it.
- **SYNC-13** **Delete all data** clears this device only: the doc, the queue, the last known
  server records and the session. The sync stops first: a sync in progress becomes stale and saves
  nothing, the timers stop, the stream closes and the queue is dropped. It sends nothing; the data
  of the account stays on the server.

## Departures from the shopping list

1. **The first login merges** (SYNC-12), in place of the replace of the shopping list: nothing is
   dropped, so no copy of the doc before the login is kept.
2. **Another user** clears the device first, after an export offer when the queue is not empty
   (ACC-12).
3. **No order is synced**: each list is sorted when it is read (TRN-3).
4. **Each record is checked alone** (SYNC-7): one bad record never stops the merge.
5. **No banner** for a device with data and no session: the start route of ACC-1 and ACC-10 stays.
6. **A push finds the record by `kind` and `key`** (SYNC-6): the device keeps no map of server ids.

## Keys

`pwa-training-routines.sync` holds the owner of the stored data, the cursor, the last known server
records, the records of the last doc that the sync knows and the time of the last sync.
`pwa-training-routines.queue` holds the changes not sent. A value that is not valid reads as empty.

## Limits

No merge of two edits of one entity field by field: the last change to arrive wins for each record.
Two devices can differ for a short time. A tombstone of SYNC-7 leaves a reference to the loser
dangling (TRN-5), as a delete does.
