# Engineering

## Modules

| Module | Responsibility | May import |
|---|---|---|
| `src/config.js` | The slug of the app, which `npm run init` rewrites, and the URL of the account server | nothing |
| `src/pocketbase.js` | The client of the account server: Google sign-in, refresh, the access row (ACC-3), and the pull, the push and the realtime stream of the records (SYNC-3, SYNC-4, SYNC-6) | `config` |
| `src/session.js` | The session on the device, the start route and the return from Google (ACC-1, ACC-4, ACC-5) | `storage` |
| `src/records.js` | The doc as sync records and the diff of two sets of records (SYNC-1, SYNC-2) | `training` |
| `src/sync.js` | The queue, the merge of pulled records, the check of each record, the duplicate names and the cursor (SYNC-5 to SYNC-7) | `records`, `training` |
| `src/syncer.js` | The sync driver: the queue of each save, the run, the retries, the stream, the login, the logout and the reset (SYNC-2, SYNC-3, SYNC-8 to SYNC-13) | `records`, `sync`, `session`, `pocketbase`, `training`, `storage` |
| `src/version.js` | Version rules and the update offer rule | nothing |
| `src/whatsnew.js` | The parse of the release notes and the versions that a user has not seen | `version` |
| `src/i18n.js` | The language choice and the translator | `locales/*` |
| `src/sections.js` | The order of the sections and the rule of the slide between them | nothing |
| `src/modules.js` | The modules that Settings turns off, and the visible sections | `sections` |
| `src/storage.js` | Load, save, validation hook, export, import, device preferences | `config`, `modules` |
| `src/install.js` | The install offer state machine | nothing |
| `src/training.js` | The doc of the app, its validation, its orders, the settings and the shared checks (TRN-1 to TRN-6) | `config` |
| `src/exercises.js` | Categories and exercises, and the common exercises (EX-1 to EX-8) | `training` |
| `src/routines.js` | Routines, their days and their items, copies, weekdays and templates (RT-1, RT-5, RT-7, RT-8) | `exercises`, `training` |
| `src/workouts.js` | Workouts: the start, the sets, the finish, the next day and the history (RT-3, WO-1 to WO-19) | `progression`, `training`, `units` |
| `src/progression.js` | The rule of progression of an item and its next target from the history (PRG-1 to PRG-5) | `plates`, `training`, `units` |
| `src/units.js` | The conversion of a weight between kg and lb, and the clock text (PR-8) | nothing |
| `src/bests.js` | The personal records of an exercise, the e1RM, the rep maxes, the volume and the effective load (PR-1 to PR-5, PR-9, PR-10) | `body`, `training`, `units` |
| `src/plates.js` | The plates of a barbell load, the bar and the warm-up sets (PR-6, PR-7, PR-11) | `units` |
| `src/body.js` | The body log, the measures, the relative strength and the DOTS (BODY-1 to BODY-3, PR-9) | `bests`, `exercises`, `training`, `units` |
| `src/insights.js` | The series, the calendar, the consistency, the sets a week, the stalls and the comparison (STAT-1 to STAT-6) | `bests`, `progression`, `training`, `units` |
| `src/goals.js` | The goals and their progress (GOAL-1, GOAL-2) | `bests`, `body`, `insights`, `training`, `units` |
| `src/timer.js` | The rest of a set and the rest timer (TMR-1 to TMR-3) | `training` |
| `src/stopwatch.js` | The stopwatch and the countdown of a set with seconds (TMR-4, TMR-5) | nothing |
| `src/csv.js` | The CSV export of the done sets (DATA-2) | `training`, `units` |
| `src/backup.js` | The restore by merge, the backup reminder and the text of a workout (DATA-3, DATA-5, INT-1) | `config`, `training`, `units` |
| `src/fitnotes.js` | The parse, the preview and the apply of a FitNotes CSV (DATA-4) | `training` |
| `src/wger.js` | The search URL of wger and the parse of its answer (INT-3) | `training` |
| `src/particles.js` | The particles of a picture and their place in time (optional) | nothing |
| `src/onboarding.js` | The show rule and the page steps of the walkthrough (optional) | nothing |
| `src/ui/context.js` | The values that the views share, the toast, `render`, `commit` and `apply` | `i18n`, `onboarding`, `storage`, `training` |
| `src/ui/controls.js` | The icon builder, the side-action button, the download of a file and the JSON export with its backup time (DATA-5) | `backup`, `storage`, `ui/context` |
| `src/ui/update.js` | The version line, the check, the refresh and the update toast | `version`, `i18n`, `ui/context` |
| `src/ui/install.js` | The Install button | `install`, `ui/context` |
| `src/ui/nav.js` | The navigation, the change and the slide of a section | `modules`, `sections`, `ui/context`, `ui/dust`, `ui/update` |
| `src/ui/sheet.js` | The edit sheet that each form of the app fills, and its fields | `ds/sheet`, `ui/context` |
| `src/ui/format.js` | The text of weights, sets, targets, dates and rests (PR-8) | `training`, `ui/context`, `units` |
| `src/ui/workout.js` | The Workout section: the start, the open or past workout, its sets, its menus and the stopwatch (SCR-1 to SCR-3, SCR-7 to SCR-11) | `backup`, `bests`, `plates`, `progression`, `routines`, `stopwatch`, `storage`, `timer`, `training`, `ui/context`, `ui/controls`, `ui/exercises`, `ui/format`, `ui/sheet`, `ui/timer`, `units`, `workouts` |
| `src/ui/timer.js` | The rest timer of the open workout (TMR-1 to TMR-3) | `storage`, `timer`, `ui/context`, `ui/format` |
| `src/ui/routines.js` | The Routines section and the sheets of a routine (SCR-4) | `routines`, `training`, `ui/context`, `ui/controls`, `ui/format`, `ui/sheet`, `workouts` |
| `src/ui/exercises.js` | The Exercises section, its detail with the records and the history, and the exercise sheet (SCR-5) | `bests`, `exercises`, `training`, `ui/context`, `ui/format`, `ui/sheet`, `workouts` |
| `src/ui/settings.js` | Settings: Training, Backup, Delete all data (SET-2, DATA-6), and the text of the page in its language | `csv`, `i18n`, `modules`, `storage`, `training`, `ui/account`, `ui/context`, `ui/controls`, `ui/onboarding`, `ui/update`, `units` |
| `src/ui/dust.js` | The dust of a navigation item (optional) | `particles`, `ui/context`, `ui/controls` |
| `src/ui/onboarding.js` | The walkthrough (optional) | `onboarding`, `sections`, `storage`, `ui/context`, `ui/controls` |
| `src/ui/whatsnew.js` | The release notes sheet, its Settings row and the seen version | `whatsnew`, `onboarding`, `i18n`, `storage`, `ds/sheet`, `ui/context` |
| `src/ui/account.js` | The account screens, the group Account of Settings and the wiring of the sync (ACC-1 to ACC-13, SYNC-1 to SYNC-13) | `config`, `pocketbase`, `session`, `storage`, `syncer`, `ui/context`, `ui/controls` |
| `src/app.js` | Wires the views, the global keys, the service worker and the update check | all of the above |

## Code rules

- **ENG-1** A state operation is a pure function `(state, …) → { state }`. It never changes its
  input.
- **ENG-2** A rejected operation returns `{ state, error }` with the same state object. Nothing
  throws for a user error. `error` is a message `{ key, params }`.
- **ENG-3** The screen applies an operation, saves, then builds the page again from the state.
- **ENG-4** A module with a side effect takes the object of that effect as a parameter (the
  storage object), so that a test passes a fake.
- **ENG-5** No module imports `src/app.js`. A view of `src/ui/` renders the screen through
  `render` of `src/ui/context.js`.
- **ENG-6** A module of `src/` is imported by its alias, `from '#training'`, never by a relative
  path. Node resolves `#name` through `imports` of `package.json`; the browser resolves it through
  the import map of `index.html`. `tests/aliases.test.js` checks that the two agree. An alias
  `#ds/<name>` names the module `vendor/design-system/<name>.js` (DSV-1).
- **ENG-7** A new id comes from `crypto.randomUUID()`. An operation that creates a record takes
  the id as an optional parameter, for the tests.
- **ENG-8** Every storage key is `<slug>.<name>`, from `keyOf` of `src/storage.js` or `APP_SLUG`
  of `src/config.js`, so two apps of one origin do not share data.
- **ENG-16** The screen code is `src/app.js` and the views of `src/ui/`. A view never imports
  `src/app.js`, a pure module never imports a view, and the imports among the views have no
  cycle. `src/ui/context.js` owns the values that the views share; another module reads them
  through its import and changes them only through a setter. `tests/layers.test.js` checks this.
- **ENG-17** `npm run init -- <slug> "<Name>"` turns a copy of the template into a new app, one
  time: it renames each literal of the template, starts the version at `0.1.0` and the cache at
  `v1`, resets
  `CHANGELOG.md` and deletes `docs/superpowers/`. It changes no file when it fails. It leaves
  `vendor/` as it is (DSV-4).

## Storage keys

The doc keys are in [07-training.md](07-training.md). The device preferences are `pwa-training-routines.lang`,
`pwa-training-routines.hand`, `pwa-training-routines.theme`, `pwa-training-routines.modules` and `pwa-training-routines.onboarded`. The backup reminder keeps `pwa-training-routines.backup` (DATA-5). The account keeps `pwa-training-routines.session` (ACC-5) and
`pwa-training-routines.offline` (ACC-10), and `pwa-training-routines.oauth` in `sessionStorage` for the time of a Google redirect (ACC-4). The
sync keeps `pwa-training-routines.sync` and `pwa-training-routines.queue` ([09-sync.md](09-sync.md)).

## Change guide

| Change | Do |
|---|---|
| A new rule of the domain | An operation in its pure module with its tests, then a control in its view of `src/ui/` |
| A new view | A module of `src/ui/` with a `bind()` that `src/app.js` calls, its alias, its file in `SHELL`, its row in the module table and its name in `UI` of `designs/page.js` |
| A change of the shape of the doc | Its `normalize` function, a new `version` and its migration |
| A new text | A key in each catalog, with the same placeholders |
| A new module of `src/` | Its alias in the import map of `index.html`, and its file in `SHELL` of `sw.js` |
| A new file that the app loads | Its path in `SHELL` of `sw.js` |
| A stored doc that an old module cannot read | A new cache name in `sw.js` (SW-10) |
| A change of behaviour | The rule in this specification, in the same commit |

## Tests

`npm test` runs `node --test` (Node 20 or later).

| Test file | Covers |
|---|---|
| `tests/training.test.js` | The doc, its validation, its orders, the settings and the shared checks |
| `tests/exercises.test.js` | Categories, exercises, the type lock, the delete rules and the common exercises |
| `tests/routines.test.js` | Routines, days and items, their checks and their moves |
| `tests/workouts.test.js` | The start, the planned sets, the values of the last time, the finish, the next day and the history |
| `tests/progression.test.js` | The rule of an item, its history, linear, double and percent progression, the deload, the rounding and the planned sets of a start |
| `tests/units.test.js` | The conversion and the rounding of a weight, and the clock text |
| `tests/bests.test.js` | The records of each type, the tie and the units, the e1RM, the rep maxes, the marks of a set, the volume and the effective load |
| `tests/plates.test.js` | The plates of a load, the nearest loads and the warm-up sets |
| `tests/body.test.js` | The body weight of a date, the entries, the measures, the relative strength and the DOTS |
| `tests/insights.test.js` | The dates, the series, the calendar, the consistency, the sets a week, the stalls and the comparison |
| `tests/goals.test.js` | The goals, their checks and their progress |
| `tests/timer.test.js` | The rest of a set, the time left, the change of time and the stored timer |
| `tests/stopwatch.test.js` | The stopwatch, the countdown, the stop and the stored stopwatch |
| `tests/csv.test.js` | The rows, the order and the quotes of the CSV export |
| `tests/backup.test.js` | The merge of two docs, the backup reminder and the text of a workout |
| `tests/fitnotes.test.js` | The parse of a FitNotes CSV, the preview and the apply |
| `tests/wger.test.js` | The search URL and the parse of the answer |
| `tests/pocketbase.test.js` | The client of the account server and its URL (ACC-3, ACC-4, ACC-6), the pull, the push and the stream of the records (SYNC-3, SYNC-4, SYNC-6) |
| `tests/session.test.js` | The session, the start route, the offline flag, the pending sign-in and the return URL (ACC-1, ACC-4, ACC-5, ACC-10) |
| `tests/records.test.js` | The records of the doc, the doc of the records and the diff |
| `tests/sync.test.js` | The queue, the merge, the check of each record, the duplicate names and the cursor |
| `tests/syncer.test.js` | The sync driver against a fake server: queue, push, pull, merge, retries, stream, login, logout, reset and import |
| `tests/storage.test.js` | Load, save, the corrupt copy, export, import and the device preferences |
| `tests/install.test.js` | The install offer states (INS-1) |
| `tests/sw.test.js` | The manifest text that the worker puts in place (SW-13) |
| `tests/sections.test.js` | The slide between sections |
| `tests/modules.test.js` | The visible sections and the switch of a module |
| `tests/particles.test.js` | The particles of a picture and their place in time |
| `tests/onboarding.test.js` | The show rule and the page steps of the walkthrough |
| `tests/version.test.js` | Version rules and the update offer rule |
| `tests/whatsnew.test.js` | The parse of the release notes and the unseen versions |
| `tests/release-notes-files.test.js` | One release-notes file for each language, with the same versions (VER-19) |
| `tests/i18n.test.js` | The language choice, the translator, the parity of the catalogs |
| `tests/markup.test.js` | `index.html` holds no text of its own; the sheet, the walkthrough and the account markup |
| `tests/aliases.test.js` | The import map against `package.json`; each `#ds/` alias names a vendored module |
| `tests/layers.test.js` | The layer rules and `SHELL` (ENG-16) |
| `tests/design.test.js` | Each rule of `vendor/design-system/rules.js` over the two stylesheets, `index.html`, `icons.svg`, `src/ui/` and `designs/`, and the parts of `styles.css` (DSV-3) |
| `tests/vendor.test.js` | The copy of the design system: its hashes, its files, its place in `index.html`, `designs/index.html` and `SHELL`, no copied rule in `styles.css` (DSV-1 to DSV-3) |
| `tests/png.test.js` | The PNG encoder and decoder of `scripts/png.mjs`, which `npm run icons` uses |
| `tests/release.test.js` | The release of `scripts/release.mjs`: the bump commit, the tag and the refusals, also a `main` behind `origin` (VER-10 to VER-12) |
| `tests/changelog.test.js` | The release of `CHANGELOG.md` by `scripts/changelog.mjs` (VER-17) |
| `tests/init.test.js` | The arguments of `scripts/init.mjs`, and a run of it in a copy: the new names, no trace of the template, `vendor/` kept as it is, its refusal of a second run (ENG-17) |
| `tests/spec.test.js` | The facts of this specification that the code can prove (ENG-12) |

A unit test uses `node:test` with `node:assert/strict`, one behaviour for each test, and checks
that the input state does not change.

## Checks with no test

- **ENG-9** `src/app.js`, the views of `src/ui/`, `styles.css` and `sw.js` have no unit test. A
  change to one of them is checked in a browser at 360×800, 768×1024 and 1280×800, with
  `npm run serve`. The offline check runs with the server stopped.
- **ENG-10** `.githooks/pre-push` and `.githooks/pre-commit` have no test. They are checked in a
  scratch clone, the first one with a bare remote.
- **ENG-11** A task is done when `npm test` passes and, for a change of the screen or of `sw.js`,
  the browser check ran.

## Upkeep of this specification

- **ENG-12** `tests/spec.test.js` compares the specification with the code: each rule identifier is
  defined one time and each named rule exists; each link has its file and the index lists each
  document; the storage keys and the cache names; the languages; each `error.*` and `toast.*` key
  that a document names; the module table against `src/` and against the imports of each module;
  the test table against `tests/`.
- **ENG-13** `.githooks/pre-commit`, enabled with `npm run hooks`, stops a commit that stages a
  change of the app with no staged change of `docs/spec/`. The app is `src/`, `sw.js`,
  `index.html` and `manifest.webmanifest`. Of the catalogs of `src/locales/`, only `es.js` counts.
- **ENG-14** A commit that changes no rule, such as a refactor, passes with
  `git commit --no-verify`, and its body says that no rule changed.
- **ENG-15** A change of behaviour changes its rule in the same commit as the code. This is part
  of the definition of done.

## Commands

```sh
npm test                          # unit tests
npm run serve                     # http://localhost:8080
npm run icons                     # write the PNG icons again
npm run hooks                     # enable .githooks/ in this clone
npm run release                   # bump the version, commit it and tag it vX.Y.Z
npm run init -- <slug> "<Name>"   # turn a copy of the template into a new app
```
