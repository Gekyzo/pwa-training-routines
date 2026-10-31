# Progression

An item of a day of a routine (RT-1) can have a rule of progression. The rule gives the next
target of the item: the weight, the reps and, for some rules, a plan of each set. The pure module
is `src/progression.js`; its test file is `tests/progression.test.js`.

The next target is never stored. It comes from the history at each read, so an edit of a past set
changes it. A start from a day keeps a copy of it in each exercise of the workout (RT-6, WO-18).

## Terms

- **History**: the finished workouts, oldest first (date, then start), with an exercise that has
  the item and the exercise of the item, and that is not skipped (WO-17). A substitute does not
  count. Each one is a session of the item.
- **Target of a session**: the copy of the start (WO-18). A session with no copy counts against
  the targets that the item has now.
- **Counted set**: a done set that is not a warm-up (WO-11). The first sets of a session, as many
  as the target has, meet the target sets in their order.
- **Unit**: the unit of the settings, or the unit of a percent rule. A weight in another unit
  converts to kg to compare, with 0.05 kg of tolerance.
- **Increment**: the increment of the exercise in its unit (EX-5), converted to the unit of the
  target, else 2.5 kg or 5 lb.
- **Rounding**: a weight that a rule computes rounds down to the increment when the increment is
  in the unit of the target. An increment in another unit leaves the weight at one decimal. A
  weight stays from 0 to 1000.

## Rules

- **PRG-1** A rule is `null` (none), `linear` or `double` with `failAfter` (1 to 10, 3) and
  `deload` (0 to 50 %, 10), or `percent` (TRN-7); another value is `error.rule`. An item with no
  rule has its own targets. The first session of a rule takes the weight of the item as it is,
  else the heaviest counted set of the newest finished workout of the exercise, rounded, else no
  weight. **Linear**: a
  session is a success when each target set has a counted set with the target reps or more at the
  target weight or more. After a success the weight is the lowest weight of those sets plus the
  increment; after a failure it stays the target weight.
- **PRG-2** **Double**: a session is a success when each target set has a counted set with the top
  of the reps or more at the target weight or more. After a success the weight goes up by the
  increment and the reps go back to the reps of the item. After a failure the weight stays and
  each set plans one rep more than it did, up to the top; a set that was not done plans the reps
  of the item.
- **PRG-3** After `failAfter` failures in a row the weight is the target weight × (1 − `deload` /
  100), and the reps go back to the reps of the item. The count of failures then restarts. A
  success restarts it too.
- **PRG-4** A planned value that the user edits is the done value: the rule reads what was done.
- **PRG-5** **Percent**: the week is the number of sessions mod the number of weeks. The training
  max is `tm` plus `step` for each full cycle of the weeks. Each set of the week plans the training
  max × its percent / 100 and its reps, in the unit of the rule; `amrap` marks a set of as many
  reps as possible. The target has the sets of the week and the weight and the reps of its last
  set.
