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

## Merge

- **SYNC-5** A change that is queued wins over a pulled record of the same `kind` and `key`.
- **SYNC-6** A delete is a record with `deleted: true`, so that the delete reaches the other
  devices. A pulled record with `deleted` counts as absent.
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
