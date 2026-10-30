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

## Exercises

- **EX-1** An exercise has a name, a category or none, a type, a rest or none, and an archive
  flag. Its name is unique with no regard to case (`error.exerciseTaken`). An id that is not in the
  doc is `error.exerciseMissing`.
- **EX-2** The type is `weight_reps` (weight and reps), `reps`, `time` (seconds) or
  `distance_time` (meters and seconds); it fixes the fields of each set. Another type is
  `error.exerciseType`. The type of an exercise that a workout holds does not change
  (`error.typeLocked`).
- **EX-3** A category has a name, unique with no regard to case (`error.categoryTaken`). A
  category that an exercise uses is not deleted (`error.categoryInUse`). An id that is not in the
  doc is `error.categoryMissing`.
- **EX-4** **Add common exercises** adds 7 categories and 29 exercises with fixed ids
  (`seed-cat-<slug>`, `seed-<slug>`), named in the language of the screen. A seed whose id is in
  the doc, or whose name the doc has, is skipped: a second run, or a run on a second device, adds
  nothing twice.
- **EX-5** An exercise with no rest of its own rests the default of the settings (TRN-1).
- **EX-6** An exercise that a workout holds is not deleted (`error.exerciseInUse`): it is archived,
  and an archived exercise keeps its history and leaves the pickers. An exercise that a routine
  holds is not deleted (`error.exerciseInRoutine`).

## Routines

- **RT-1** A routine has a name, unique with no regard to case (`error.routineTaken`), and an
  ordered list of days. A day has a name, unique in its routine (`error.dayTaken`), and an ordered
  list of items. An item names an exercise of the doc and its target: sets (1 to 20), and
  optionally reps, a top of a range of reps, a weight and a rest. A top needs reps at or below it
  (`error.repsRange`). Days and items move to an index, clamped to the ends. A routine, a day or an
  item that is not in the doc is `error.routineMissing`, `error.dayMissing` or `error.itemMissing`.
  A deleted routine leaves its workouts as they are: they keep the names of their start.
