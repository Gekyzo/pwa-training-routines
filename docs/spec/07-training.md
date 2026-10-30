# Training

The domain of the app: exercises, routines and workouts. Its pure modules are `src/training.js`,
`src/exercises.js`, `src/routines.js`, `src/workouts.js`, `src/bests.js`, `src/units.js`,
`src/timer.js` and `src/csv.js`. Each has a test file of the same name.

## Doc

- **TRN-1** The doc is stored as JSON under `pwa-training-routines.training`: `{ version: 1,
  settings, categories, exercises, routines, workouts }`. `settings` is `{ unit, rest }`: the unit
  `kg` or `lb` and the default rest in seconds, `kg` and 90 for a new install. A stored doc that is
  not valid is kept under `pwa-training-routines.training.corrupt`, and the app starts with the
  empty doc.
- **TRN-2** `normalizeTraining` accepts a doc of version 1 whose entries each have an id of 1 to 64
  characters, unique in its list, and the fields of the shape of the design. It trims each name,
  drops unknown fields, reads a missing optional field as `null`, `false` or `''`, and replaces
  settings that are not valid with the defaults. Two categories, two exercises, two routines or two
  days of one routine with one name, with no regard to case, make the doc not valid.
- **TRN-3** No order is stored. Categories and exercises sort by name, routines by creation, oldest
  first, workouts by date and then by start, newest first. The days of a routine and the items of a
  day keep the order of their list.
- **TRN-4** A name is trimmed, 1 to 60 characters (`error.nameRequired`, `error.nameTooLong`). A
  comment is at most 500 characters (`error.commentTooLong`). A number takes a comma or a point and
  is in its range (`error.numberRange`), or `error.numberRequired` when it is empty and needed:
  weight 0 to 1000 with one decimal, reps 0 to 1000, seconds 0 to 86 400, meters 0 to 1 000 000,
  sets of an item 1 to 20, rest 0 to 600 seconds. Reps, seconds, sets and rest are integers.
- **TRN-5** A reference to an exercise, a category or a routine that the doc does not hold is
  valid: a sync can bring a workout before its exercise. The screen names it `exercise.unknown`.
- **TRN-6** `setUnit` takes `kg` or `lb` (else `error.unit`); `setRest` takes a rest of TRN-4.
