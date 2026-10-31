# Progress

The pure modules behind the Progress section: `src/insights.js`, `src/body.js` and `src/goals.js`.
Their test files are `tests/insights.test.js`, `tests/body.test.js` and `tests/goals.test.js`.

Nothing here is stored except the body entries, the measures and the goals (TRN-7). Each read
derives the rest from the history, so an edit of a past set changes it. No function reads the
clock: a function that needs today takes `now`, a `Date` or a date text `YYYY-MM-DD`.

## Terms

- **Counted set**: a done set that is not a warm-up (WO-11).
- **Week**: seven days from Monday to Sunday, on the local dates of the workouts. A week is named
  by its Monday.
- **Weight values**: kg, except where a rule says the unit of the goal.

## Insights (`src/insights.js`)

- **STAT-1** `series(state, exerciseId, metric, { from, to })` gives one point
  `{ date, workoutId, value }` for each workout with a counted set of the exercise, oldest first.
  The metric is `e1rm` (best e1RM of the workout), `heaviest` (heaviest load), `bestSet` (best
  weight × reps of one set), `volume` (volume of the exercise, PR-5) or `reps` (total reps).
  A workout whose value is `null` or 0 has no point. `from` and `to` keep the dates between them.
  The load of a set is its effective load (PR-9). An unknown exercise or metric gives no point.
- **STAT-2** `calendar(state, year, month)` gives every day of the month, with its weekday (0 is
  Monday) and its workouts. A workout lists the category ids of the exercises that have a counted
  set, with no repeat.
- **STAT-3** `consistency(state, now, weeks = 12)` gives `perWeek`, the finished workouts of each of
  the last `weeks` weeks, oldest first, the current week last. `streak` is the number of weeks in a
  row with one finished workout at least, counted back from this week, or from last week when this
  week has none. `adherence` is the counted sets of the finished workouts that a day started,
  divided by their target sets, over the same weeks. Each exercise counts at most its target
  sets. A skipped exercise (WO-17) and an exercise with no target do not count. With no target
  set, `adherence` is `null`.
- **STAT-4** `weeklySets(state, now, weeks = 12)` gives, for each category, the counted sets of
  each of the last `weeks` weeks, with a state against `weekMin` and `weekMax` (TRN-7): `below`,
  `within`, `above`, or `none` when the category has no limit. The exercises with no category
  have a row of `categoryId: null` when the weeks hold a set of them.
- **STAT-5** `stalls(state)` lists each exercise that is not archived, that no item with a rule
  uses (PRG-1), and whose best e1RM did not rise in the last `stallAfter` workouts (TRN-7). A tie
  is not a rise: the first workout of the best value is the best one. `since` is the number of
  workouts after it. `suggestion` is the PRG-3 deload (10 %) of the heaviest set of the last
  workout, rounded down (PR-6), in the unit of the settings; `null` when the set has no weight.
- **STAT-6** `compare(state, workoutId)` compares a workout with the previous finished workout of
  the same routine and the same day. For each exercise that is not skipped it gives the top
  weight, the total reps and the volume, now and before, and the difference. An exercise that the
  previous workout lacks has `previous` and `diff` of `null`. A workout with no day, or with no
  previous one, gives `null`.

## Body (`src/body.js`)

- **BODY-1** A body entry is a date, a measure, a value and a unit. The measure `weight` has the
  unit of the settings and a value from 20 to 400. A measure of BODY-2 has its unit and a value
  from 0 to 1000. A value has one decimal. An unknown measure is `error.measureMissing`, a date
  that does not exist is `error.date`. An edit changes the date and the value; the measure and the
  unit stay. `bodySeries` gives the entries of a measure, oldest first. The body weight of a date
  is the latest weight entry on or before it; of two entries on one date, the later one in the
  list wins.
- **BODY-2** A measure is a name and a unit (`cm`, `in` or `%`) in the settings. Its name is
  unique (`error.measureTaken`). A measure with entries stays, and keeps its unit
  (`error.measureInUse`).
- **BODY-3** The relative strength of an exercise on a date is its best e1RM divided by the body
  weight of the date, both in kg. The DOTS of a date is the total × 500 ÷ P, where the total is
  the sum of the best e1RM of the squat, the bench press and the deadlift (`seed-squat`,
  `seed-bench-press`, `seed-deadlift`), and P is the polynomial `a + b·x + c·x² + d·x³ + e·x⁴` of
  the body weight x in kg. For `male` the coefficients are −307.75076, 24.0900756, −0.1918759221,
  0.0007391293 and −0.000001093. For `female` they are −57.96288, 13.6175032, −0.1126655495,
  0.0005158568 and −0.0000010706. Both are `null` with no sex in the settings, with no body
  weight, or when a lift has no e1RM.

## Goals (`src/goals.js`)

- **GOAL-1** An exercise goal has an exercise of the type `weight_reps`, a metric and a target
  weight above 0, in the unit of the settings. The metric `e1rm` has the target weight as the
  target e1RM. The metric `set` also has reps from 1 to 12; its target is the e1RM of that weight
  and reps. A goal can have a date. `goalProgress(state, goal, now)` gives `best` (the best e1RM
  of the exercise), `target`, `ratio` (best ÷ target, from 0 to 1) and `reached`, in the unit of
  the goal. `reached` is the first counted set, oldest first, that meets the goal, as
  `{ set, workout }`, else `null`. A set meets an `e1rm` goal when its e1RM reaches the target;
  it meets a `set` goal when its load reaches the weight and its reps reach the reps. A reached
  goal has the ratio 1. A weight within 0.05 kg of the target reaches it.
- **GOAL-2** A body goal has a target weight (20 to 400) and a date. `ratio` is the part of the
  way from the first weight to the target: the weight on the day the goal was made, else the
  first weight entry. It is from 0 to 1, and 1 when the goal is `reached`. `best` is the body
  weight of `now`. `weeklyRate` is (target − current) ÷ the weeks left to the date, one decimal;
  a negative rate is a loss. It is `null` with no body weight or when the date is not after `now`.
  An exercise goal has the `weeklyRate` `null`.
