# Training

The domain of the app: exercises, routines and workouts. Its pure modules are `src/training.js`,
`src/exercises.js`, `src/routines.js`, `src/workouts.js`, `src/bests.js`, `src/units.js`,
`src/timer.js` and `src/csv.js`. Each has a test file of the same name.

## Doc

- **TRN-1** The doc is stored as JSON under `pwa-training-routines.training`: `{ version: 2,
  settings, categories, exercises, routines, workouts, bodies, goals }`. `settings` is `{ unit,
  rest, formula, effort, plates, bar, sex, measures, stallAfter }`. A new install has `kg`, a rest
  of 90 seconds, `epley`, the effort scale `none`, the plates per side `kg` 25, 20, 15, 10, 5, 2.5,
  1.25 and `lb` 45, 35, 25, 10, 5, 2.5, the bar `kg` 20 and `lb` 45, no sex (`null`), no measure
  and a stall after 4 workouts. A stored doc that is not valid is kept under
  `pwa-training-routines.training.corrupt`, and the app starts with the empty doc.
- **TRN-2** `normalizeTraining` accepts a doc of version 1 or 2 whose entries each have an id of 1
  to 64 characters, unique in its list, and the fields of the shape of the design (TRN-7). It
  writes version 2. A version 1 doc migrates: it gets no body entry and no goal, and each new field
  takes its default. It trims each name, drops unknown fields, reads a missing optional field as
  `null`, `false`, `''` or `[]`, and replaces each setting that is not valid with its default,
  alone. Two categories, two exercises, two routines or two days of one routine with one name, with
  no regard to case, make the doc not valid. A doc of a version above 2 is not valid
  (`isNewerTraining`); its import is `error.backupNewer` (DATA-2).
- **TRN-3** No order is stored. Categories and exercises sort by name, routines by creation, oldest
  first, workouts by date and then by start, newest first. The days of a routine and the items of a
  day keep the order of their list.
- **TRN-4** A name is trimmed, 1 to 60 characters (`error.nameRequired`, `error.nameTooLong`). A
  comment is at most 500 characters (`error.commentTooLong`). A number takes a comma or a point and
  is in its range (`error.numberRange`), or `error.numberRequired` when it is empty and needed:
  weight 0 to 1000 with one decimal, reps 0 to 1000, seconds 0 to 86 400, meters 0 to 1 000 000,
  sets of an item 1 to 20, rest 0 to 600 seconds, RPE 6 to 10, RIR 0 to 10, body weight 20 to
  400, a body measure 0 to 1000, working sets a week 0 to 100, a stall after 2 to 20 workouts, an
  increment 0.1 to 100, a bar 0 to 100. Reps, seconds, sets, rest, RIR, the working sets a week
  and the stall are integers. In the doc the weight of a set is -1000 to 1000 (LOG-9).
- **TRN-5** A reference to an exercise, a category or a routine that the doc does not hold is
  valid: a sync can bring a workout before its exercise. The screen names it `exercise.unknown`.
- **TRN-6** `setUnit` takes `kg` or `lb` (else `error.unit`); `setRest` takes a rest of TRN-4.
- **TRN-7** The fields of version 2, each not valid makes its entry not valid:
  - A category has `weekMin` and `weekMax`, each `null` or 0 to 100; with both, `weekMax` is at or
    above `weekMin`.
  - An exercise has `increment` (0.1 to 100), `bar` (0 to 100) and `unit` (`kg` or `lb`, the unit of
    the two), `equipment` (`barbell`, `dumbbell`, `machine`, `cable`, `bodyweight` or `other`), each
    `null` by default, `notes` (at most 500 characters, `''`) and `unilateral` (`false`).
  - A routine has `archived` (`false`). A day has `weekdays`: unique integers, 0 for Monday to 6
    for Sunday (`[]`).
  - An item has `rule`: `null`; `{ type: 'linear' | 'double', failAfter, deload }` with
    `failAfter` 1 to 10 (3) and `deload` 0 to 50 (10); or `{ type: 'percent', tm, unit, step,
    weeks }` with `tm` 0 to 1000, `step` 0 to 100 and 1 to 8 weeks of 1 to 10 sets, each `{ pct,
    reps, amrap }` with `pct` 1 to 150, `reps` 1 to 100 and `amrap` `true` or `false` (`false`).
  - An entry has `itemId`, `group` and `substituteFor` (an id or `null`), `skipped` (`false`) and
    `target`: `null` or `{ sets, reps, repsMax, weight, unit, rest }` with the limits of an item.
  - A set has `kind` (`working`, `warmup`, `drop` or `failure`, `working` by default), `effort`
    (`null`, or 0 to 10 in steps of 0.5; the edit checks the scale of the settings) and `at` (an ISO
    time or `null`).
  - The settings have `formula` (`epley` or `brzycki`), `effort` (`none`, `rpe` or `rir`), `plates`
    and `bar` for each unit (a plate weighs more than 0 and up to 100), `sex` (`null`, `male` or
    `female`), `measures` (`[{ id, name, unit }]`, unit `cm`, `in` or `%`, unique ids and names,
    never the id `weight`) and `stallAfter`.
  - A body entry is `{ id, date, measure, value, unit }`: `measure` `weight` with `kg` or `lb`, or
    the id of a measure with `cm`, `in` or `%`; the date is `YYYY-MM-DD` and the value 0 to 1000.
    A measure that the settings do not hold is valid (TRN-5).
  - A goal is `{ id, kind, exerciseId, metric, weight, unit, reps, date, created }`. Of kind
    `exercise` it has an exercise id and the metric `e1rm` (no reps) or `set` (reps 0 to 1000). Of
    kind `body` it has no exercise, no metric and no reps. The weight is 0 to 1000, the date is
    `YYYY-MM-DD` or `null`, and `created` is an ISO time.

## Exercises

- **EX-1** An exercise has a name, a category or none, a type, a rest or none, and an archive
  flag. Its name is unique with no regard to case (`error.exerciseTaken`). An id that is not in the
  doc is `error.exerciseMissing`.
- **EX-2** The type is `weight_reps` (weight and reps), `reps`, `time` (seconds),
  `distance_time` (meters and seconds), `weight_time` (weight and seconds) or `weight_distance`
  (weight and meters); it fixes the fields of each set. Another type is
  `error.exerciseType`. The type of an exercise that a workout holds does not change
  (`error.typeLocked`).
- **EX-3** A category has a name, unique with no regard to case (`error.categoryTaken`). A
  category that an exercise uses is not deleted (`error.categoryInUse`). An id that is not in the
  doc is `error.categoryMissing`.
- **EX-4** **Add common exercises** adds 7 categories and 29 exercises with fixed ids
  (`seed-cat-<slug>`, `seed-<slug>`), named in the language of the screen. A seed whose id is in
  the doc, or whose name the doc has, is skipped: a second run, or a run on a second device, adds
  nothing twice.
- **EX-5** An exercise with no rest of its own rests the default of the settings (TRN-1). It can
  also hold an increment (0.1 to 100) and a bar weight (0 to 100), both optional. `unit` is the
  unit of the settings at the time the increment or the bar is set.
- **EX-6** An exercise that a workout holds is not deleted (`error.exerciseInUse`): it is archived,
  and an archived exercise keeps its history and leaves the pickers. An exercise that a routine
  holds is not deleted (`error.exerciseInRoutine`).
- **EX-7** **Merge** moves the entries of a workout (and their substitute mark), the items of a
  routine and the goals of exercise B to exercise A, then removes B. The two exercises must exist
  (`error.exerciseMissing`), must be two (`error.mergeSame`) and must have the same type
  (`error.typeMismatch`). The records of A come from the entries it has now (PR-1).
- **EX-8** An exercise has an equipment (`barbell`, `dumbbell`, `machine`, `cable`, `bodyweight`,
  `other` or none; another value is `error.equipment`), notes of up to 500 characters
  (`error.commentTooLong`) and a unilateral flag (LOG-10). Each common exercise (EX-4) has its
  equipment.

## Routines

- **RT-1** A routine has a name, unique with no regard to case (`error.routineTaken`), and an
  ordered list of days. A day has a name, unique in its routine (`error.dayTaken`), and an ordered
  list of items. An item names an exercise of the doc and its target: sets (1 to 20), and
  optionally reps, a top of a range of reps, a weight and a rest. A top needs reps at or below it
  (`error.repsRange`). Days and items move to an index, clamped to the ends. A routine, a day or an
  item that is not in the doc is `error.routineMissing`, `error.dayMissing` or `error.itemMissing`.
  A deleted routine leaves its workouts as they are: they keep the names of their start (WO-2).
- **RT-2** **Start** of a day starts a workout from it (WO-2).
- **RT-3** The day that a routine offers next is the day after the day of its newest workout, in
  a cycle; with no workout, or when the day of each of its workouts is gone, its first day. It
  does not depend on the calendar, so a missed day does not break the cycle.

## Workouts

- **WO-1** A workout starts on the local date of its start, open (not finished). One workout is
  open at a time: a start while one is open is `error.workoutOpen`.
- **WO-2** A workout from a day of a routine holds one exercise for each item, each with the sets
  of its target, not done. It keeps the names of the routine and the day of its start (WO-18).
- **WO-3** **Add exercise** adds an exercise with one set.
- **WO-4** A set holds the fields of the type of its exercise (EX-2) and a comment; an edit of
  another field changes nothing. Each value is checked as TRN-4. A weight is in the unit of the
  settings, and the set keeps that unit (PR-8).
- **WO-5** A set is done only with the values of its type: reps for `weight_reps` and `reps`,
  seconds for `time` and `weight_time`, meters for `weight_distance`, meters or seconds for
  `distance_time` (`error.setIncomplete`). Only done sets
  count in the history and the records.
- **WO-6** A workout takes a comment and another date, a past date too (`error.date`).
- **WO-7** **Finish** drops the sets that are not done and the exercises left with no set, except a
  skipped exercise (WO-17). A workout with no done set is deleted. A finished workout stays
  editable.
- **WO-8** A new set copies the values, never the done mark or the comment: of the last set of its
  exercise in this workout; else of the set of the same place in the newest other workout that
  has done sets of the exercise (the last one when there are fewer); else it is blank. A planned
  set of a day takes the weight and the reps of its item when the item has them.
- **WO-9** A workout, an exercise of a workout or a set that is not in the doc is
  `error.workoutMissing`, `error.entryMissing` or `error.setMissing`.
- **WO-10** The history of an exercise lists each workout with done sets of
  it, newest first, with those sets.
- **WO-11** A set has a kind: `working`, `warmup`, `drop` or `failure` (`error.setKind`). A new
  set is `working`. Warm-up sets count in the history.
- **WO-12** A set takes an effort in the scale of the settings: RPE 6 to 10 in steps of 0.5, or
  RIR 0 to 10, an integer (`error.numberRange`). With no scale a value is `error.effortOff`; an
  empty effort clears it with any scale.
- **WO-13** The weight of a set of an exercise with the equipment `bodyweight` goes from -1000 to
  1000: a negative weight is help, such as an assisted machine. For another exercise a negative
  weight is `error.numberRange`.
- **WO-14** A done set holds the time of its first mark; a set marked not done has none. The
  duration of a workout starts at its first done set, else at its start. It ends at the finish
  when the finish is within 4 hours after the last done set, else at the last done set. An open
  workout whose last done set is more than 4 hours old finishes at that set (WO-7).
- **WO-15** Two exercises or more of a workout join a superset (`error.groupSize`). They move next
  to each other, at the place of the first one. An exercise of another superset leaves it. A
  superset left with one exercise ends. The next set goes to the next exercise of the superset
  that has a set not done, in a cycle. The rest timer starts only after a set of the last exercise
  of the superset that is not skipped and has sets (the end of the round).
- **WO-16** **Repeat** starts an open workout on a date (`error.date`) with the exercises and the
  sets of another workout, in new supersets of the same exercises. The sets are not done, with
  the values and the effort of the source or blank; each keeps its kind, never its comment. A
  repeat while a workout is open is `error.workoutOpen`.
- **WO-17** **Skip** removes the sets of an exercise and marks it skipped; an exercise with a done
  set is `error.entryHasDone`. An exercise back from a skip with no set gets one set, as WO-3.
  **Substitute** puts another exercise in the place of an exercise and keeps the exercise of the
  start and the target. The sets keep their values when the two types are the same, else they are
  blank, and a done set is then `error.entryHasDone`. A negative weight goes when the new exercise
  is not `bodyweight`.
- **WO-18** A workout from a day keeps, for each exercise, the item and a copy of its target: sets,
  reps, top of reps, weight, rest, and the unit of the settings. A later change of the routine
  changes no workout.

## Records and units

- **PR-1** The records of an exercise come from its done sets, at each read; nothing stores them.
  `weight_reps` has the heaviest weight, the most reps, the best set (weight × reps) and the best
  workout (the sum of weight × reps); `reps` has the most reps and the best workout (the sum of
  reps); `time` the longest time; `distance_time` the farthest distance and the longest time;
  `weight_time` the heaviest weight and the longest time; `weight_distance` the heaviest weight
  and the farthest distance. Each
  record names its set and its workout. A value of zero makes no record, and a tie keeps the first
  record.
- **PR-8** A set keeps the unit of its weight. Records compare weights in kg. The screen shows a
  weight in the unit of the settings, rounded to one decimal; a change of the unit rewrites no set.

## Rest timer

- **TMR-1** Marking a set done starts the rest timer. The timer stores its end as a time in
  `pwa-training-routines.timer`, a state of the device that does not sync, so a reload or a locked
  screen keeps the time left. At zero the phone vibrates, and a notification shows when the user
  allowed them.
- **TMR-2** The rest is the rest of the item of the day of the workout, else the rest of the
  exercise, else the default rest of the settings.
- **TMR-3** **+15 s** and **−15 s** change the time left, never below zero. **Skip** stops the timer.

## Backup

- **DATA-1** The doc lives on the device and works with no network, with an account or with none.
- **DATA-2** **Export JSON** writes the doc, which **Import** reads back. An import of a file of a
  newer version of the doc (TRN-2) is `error.backupNewer`; another file that is not a doc is
  `error.notBackup`. **Export CSV** writes one
  row for each done set, oldest first, with the columns `Date`, `Exercise`, `Category`, `Weight`,
  `Weight Unit`, `Reps`, `Distance`, `Distance Unit` (`m`), `Time` (`m:ss` or `h:mm:ss`) and
  `Comment`, quoted as RFC 4180. A `weight_time` or `weight_distance` set fills the weight and the
  time, resp. the distance. The file has the name of the JSON export with `.csv`.
- **DATA-6** **Delete all data** first asks `reset.exportFirst` when the doc has a workout; a yes
  writes the JSON export before the question of SET-2.

## Screen

- **SCR-1** Workout with no open workout shows **Next day**: one row for each routine whose next
  day (RT-3) has an exercise, which starts it (WO-2); **Empty workout** (WO-1); and the finished
  workouts, newest first, each with its date, its name and its count of exercises and done sets.
  A tap on a finished workout opens it, with **Back**.
- **SCR-2** A workout shows its name (the routine and the day, or **Free workout**), its date, then
  each exercise with its sets: the done check, the number, and one box for each value of the type
  (WO-4). A box saves when it loses the focus, and the focus stays in the box that the user moved
  to. **Add set**, **Remove exercise**, **Add exercise** (a picker of the exercises that are not
  archived, and **New exercise**), the comment, **Finish** (open workout only, WO-7) and **Delete
  workout**, which asks `workout.deleteConfirm`. Marking a set done in the open workout starts the
  rest timer (TMR-1), which stays at the top while the list scrolls.
- **SCR-3** A weight box shows and takes the weight in the unit of the settings (PR-8).
- **SCR-4** Routines lists the routines with their days. The detail has **Rename**, **Delete** and,
  for each day, its items with their target, **Start** (RT-2, with one item at least), **Add
  exercise**, **Rename day** and **Delete day**; then **Add day**. A tap on an item opens its
  sheet; ↑ moves it up; the bin removes it. The weight of an item shows for `weight_reps` only.
- **SCR-5** Exercises lists the exercises by category, by name, then **No category**; the archived
  ones are behind a closed head with their count. The empty list offers **Add exercise** and **Add
  common exercises** (EX-4). The detail shows the category, the type and the rest, **Edit**,
  **Archive** or **Restore**, and **Delete** when EX-6 allows it, then the records (PR-1) and the
  history (WO-10); a tap on a workout of the history opens it in Workout. The sheet of an exercise
  has the name, the category or a new one, the type and the rest.
- **SCR-6** **+** makes a routine in Routines and an exercise in Exercises. `Escape` closes the
  sheet, else the open detail, else the past workout.
