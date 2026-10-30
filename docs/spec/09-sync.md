# Sync between devices

The training doc lives on each device for offline use. A device signed in to an approved account
also syncs it with the PocketBase server of `pwa-server`. The rules copy the sync of
`pwa-shopping-list` with no shares. Its pure modules are `src/records.js` and `src/sync.js`. Each
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
- **SYNC-2** The diff of two sets of records gives the deletes first, then the upserts, each sorted
  by record name. A record whose `data` differs only in the order of its keys is no change.

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
  malformed event is dropped.
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
