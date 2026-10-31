import { countedSets, effectiveLoad, exerciseVolume, e1rm } from '#bests';
import { findById, localDate, sortedCategories, sortedWorkouts } from '#training';
import { convert } from '#units';
import { roundLoad } from '#progression';

// The insights: series, calendar, consistency, sets a week, stalls and comparison (STAT-1 to STAT-7).
// Dates are `YYYY-MM-DD` and weeks start on Monday. Nothing reads the clock: each function takes `now`.

export const METRICS = ['e1rm', 'heaviest', 'bestSet', 'volume', 'reps'];
// STAT-6: the deload that the suggestion applies, the default of PRG-1.
const STALL_DELOAD = 10;

// ---- Dates ----

const pad = (n) => String(n).padStart(2, '0');
const parse = (date) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};
const format = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export const addDays = (date, days) => {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
};
// 0 = Monday .. 6 = Sunday.
export const weekdayOf = (date) => (parse(date).getUTCDay() + 6) % 7;
export const weekStart = (date) => addDays(date, -weekdayOf(date));
export const daysBetween = (from, to) => Math.round((parse(to) - parse(from)) / 86400000);
// The local day of `now`: a Date, or a date or an ISO text (its first ten characters).
export const dayOf = (now) => (now instanceof Date ? localDate(now) : String(now).slice(0, 10));

const oldestFirst = (state) => sortedWorkouts(state).reverse();
const setsOf = (workout, exerciseId) => workout.entries.filter((e) => e.exerciseId === exerciseId).flatMap(countedSets);
const maxOf = (values) => (values.length ? Math.max(...values) : null);
const sum = (values) => values.reduce((total, value) => total + value, 0);

// ---- STAT-1: series ----

// The point of a workout for a metric, in kg or reps, or `null` when it has none.
const pointValue = (state, exercise, workout, metric) => {
  const sets = setsOf(workout, exercise.id);
  const load = (s) => effectiveLoad(state, s, exercise, workout.date).kg;
  const weighed = sets.filter((s) => s.weight !== null);
  switch (metric) {
    case 'e1rm': return maxOf(sets.map((s) => e1rm(load(s), s.reps, state.settings.formula)).filter((v) => v !== null));
    case 'heaviest': return maxOf(weighed.map(load));
    case 'bestSet': return maxOf(weighed.filter((s) => s.reps !== null).map((s) => load(s) * s.reps));
    case 'volume': return exerciseVolume(state, exercise.id, workout);
    default: return sum(sets.map((s) => s.reps ?? 0));
  }
};

// STAT-1: one point per workout with a done working set, oldest first, `{ date, workoutId, value }`.
// Weights are in kg. A workout with no value (0 or none) has no point. `from` and `to` are dates.
export const series = (state, exerciseId, metric, { from = null, to = null } = {}) => {
  const exercise = findById(state.exercises, exerciseId);
  if (!exercise || !METRICS.includes(metric)) return [];
  const points = [];
  for (const workout of oldestFirst(state)) {
    if ((from && workout.date < from) || (to && workout.date > to)) continue;
    const value = pointValue(state, exercise, workout, metric);
    if (value !== null && value > 0) points.push({ date: workout.date, workoutId: workout.id, value });
  }
  return points;
};

// ---- STAT-2: calendar ----

// STAT-2: each day of a month (`month` 1..12): its workouts and the category ids of their trained
// exercises, `{ date, weekday, workouts: [{ id, categoryIds }] }`.
export const calendar = (state, year, month) => {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const workouts = oldestFirst(state);
  return Array.from({ length: days }, (_, index) => {
    const date = `${year}-${pad(month)}-${pad(index + 1)}`;
    return {
      date,
      weekday: weekdayOf(date),
      workouts: workouts.filter((w) => w.date === date).map((w) => ({
        id: w.id,
        categoryIds: [...new Set(w.entries
          .filter((e) => countedSets(e).length)
          .map((e) => findById(state.exercises, e.exerciseId)?.categoryId ?? null)
          .filter((id) => id !== null))],
      })),
    };
  });
};

// ---- STAT-3: consistency ----

const weeksBack = (now, weeks) => {
  const current = weekStart(dayOf(now));
  return Array.from({ length: weeks }, (_, index) => addDays(current, -7 * (weeks - 1 - index)));
};

// STAT-3: finished workouts a week for the last `weeks` weeks (oldest first); the streak of weeks in a
// row with a workout, ending this or last week; the adherence of the window, `null` with no target.
export const consistency = (state, now, weeks = 12) => {
  const finished = state.workouts.filter((w) => w.finished !== null);
  const counts = new Map();
  for (const w of finished) counts.set(weekStart(w.date), (counts.get(weekStart(w.date)) ?? 0) + 1);
  const window = weeksBack(now, weeks);
  const perWeek = window.map((week) => ({ week, count: counts.get(week) ?? 0 }));
  let cursor = weekStart(dayOf(now));
  if (!counts.get(cursor)) cursor = addDays(cursor, -7);
  let streak = 0;
  for (; counts.get(cursor); cursor = addDays(cursor, -7)) streak += 1;
  // Adherence: done working sets (at most the target of an entry) ÷ target sets of the entries that a
  // day started and that were not skipped.
  let planned = 0;
  let done = 0;
  for (const w of finished.filter((x) => x.dayId !== null && x.date >= window[0])) {
    for (const e of w.entries.filter((x) => x.target && !x.skipped)) {
      planned += e.target.sets;
      done += Math.min(e.target.sets, countedSets(e).length);
    }
  }
  return { perWeek, streak, adherence: planned ? done / planned : null };
};

// ---- STAT-4: sets a week ----

const rangeState = (sets, min, max) => {
  if (min === null && max === null) return 'none';
  if (min !== null && sets < min) return 'below';
  return max !== null && sets > max ? 'above' : 'within';
};

// STAT-4: for each category (and `null` for none, when it has sets) the done working sets of each of
// the last `weeks` weeks against `weekMin` and `weekMax`: `below`, `within`, `above` or `none`.
export const weeklySets = (state, now, weeks = 12) => {
  const window = weeksBack(now, weeks);
  const counts = new Map();
  for (const w of state.workouts.filter((x) => x.date >= window[0])) {
    for (const e of w.entries) {
      const category = findById(state.exercises, e.exerciseId)?.categoryId ?? null;
      const key = `${category}|${weekStart(w.date)}`;
      counts.set(key, (counts.get(key) ?? 0) + countedSets(e).length);
    }
  }
  const rows = sortedCategories(state).map((c) => ({ categoryId: c.id, min: c.weekMin ?? null, max: c.weekMax ?? null }));
  if (window.some((week) => counts.get(`null|${week}`))) rows.push({ categoryId: null, min: null, max: null });
  return rows.map((row) => ({
    ...row,
    weeks: window.map((week) => {
      const sets = counts.get(`${row.categoryId}|${week}`) ?? 0;
      return { week, sets, state: rangeState(sets, row.min, row.max) };
    }),
  }));
};

// ---- STAT-5: stalls ----

const hasRule = (state, exerciseId) =>
  state.routines.some((r) => r.days.some((d) => d.items.some((i) => i.exerciseId === exerciseId && i.rule)));

// STAT-5: an exercise with no rule whose best e1RM did not rise in the last `stallAfter` workouts:
// `{ exerciseId, since, best, suggestion }`. `since` counts the workouts after the best one (the first
// one wins a tie). `suggestion` is the PRG-3 deload of the heaviest set of the last workout, or `null`.
export const stalls = (state) => {
  const { stallAfter, unit } = state.settings;
  const found = [];
  for (const exercise of state.exercises.filter((e) => !e.archived && !hasRule(state, e.id))) {
    const points = series(state, exercise.id, 'e1rm');
    if (!points.length) continue;
    const bestIndex = points.reduce((best, p, index) => (p.value > points[best].value ? index : best), 0);
    const since = points.length - 1 - bestIndex;
    if (since < stallAfter) continue;
    const last = state.workouts.find((w) => w.id === points.at(-1).workoutId);
    const top = maxOf(setsOf(last, exercise.id).filter((s) => s.weight !== null).map((s) => convert(s.weight, s.unit, unit)));
    const weight = top === null ? null : roundLoad(state, exercise, top * (1 - STALL_DELOAD / 100), unit);
    found.push({ exerciseId: exercise.id, since, best: points[bestIndex].value, suggestion: weight === null ? null : { weight, unit } });
  }
  return found;
};

// ---- STAT-6: comparison ----

const statsOf = (state, workout, exerciseId) => {
  const exercise = findById(state.exercises, exerciseId);
  const sets = setsOf(workout, exerciseId);
  const loads = sets.filter((s) => s.weight !== null).map((s) => effectiveLoad(state, s, exercise, workout.date).kg);
  return { top: maxOf(loads), reps: sum(sets.map((s) => s.reps ?? 0)), volume: exerciseVolume(state, exerciseId, workout) };
};

const difference = (now, before) => (now === null || before === null ? null : now - before);

// STAT-6: a workout against the previous finished workout of the same day of the same routine: for each
// exercise of the workout its top weight (kg), total reps and volume, now and before, and the difference.
// `null` with no day or no previous workout; an exercise the previous one lacks has `previous: null`.
export const compare = (state, workoutId) => {
  const ordered = oldestFirst(state);
  const index = ordered.findIndex((w) => w.id === workoutId);
  const workout = ordered[index];
  if (!workout || workout.routineId === null || workout.dayId === null) return null;
  const previous = ordered.slice(0, index).findLast((w) => w.finished !== null && w.routineId === workout.routineId && w.dayId === workout.dayId);
  if (!previous) return null;
  const ids = [...new Set(workout.entries.filter((e) => !e.skipped).map((e) => e.exerciseId))];
  const before = new Set(previous.entries.map((e) => e.exerciseId));
  return {
    previousId: previous.id,
    exercises: ids.map((exerciseId) => {
      const current = statsOf(state, workout, exerciseId);
      const prior = before.has(exerciseId) ? statsOf(state, previous, exerciseId) : null;
      return {
        exerciseId,
        current,
        previous: prior,
        diff: prior && {
          top: difference(current.top, prior.top), reps: current.reps - prior.reps, volume: current.volume - prior.volume,
        },
      };
    }),
  };
};
