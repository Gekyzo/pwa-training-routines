import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTraining } from '#training';
import { series, calendar, consistency, weeklySets, stalls, compare, weekStart, addDays, weekdayOf, daysBetween, dayOf } from '#insights';

const set = (id, weight, reps, extra = {}) => ({
  id, weight, unit: 'kg', reps, seconds: null, meters: null, done: true, comment: '', kind: 'working', ...extra,
});
const entry = (id, exerciseId, sets, extra = {}) => ({ id, exerciseId, sets, itemId: null, target: null, group: null, skipped: false, substituteFor: null, ...extra });
const workout = (id, date, entries, extra = {}) => ({
  id, date, started: `${date}T10:00:00.000Z`, finished: `${date}T11:00:00.000Z`, routineId: null, dayId: null, routineName: '', dayName: '', comment: '',
  entries, ...extra,
});
const exercise = (id, extra = {}) => ({ id, name: id, categoryId: null, type: 'weight_reps', rest: null, archived: false, equipment: null, unilateral: false, ...extra });
const state = (workouts, extra = {}) => ({ ...emptyTraining(), exercises: [exercise('bench'), exercise('squat')], workouts, ...extra });
const bench = (id, date, sets, extra) => workout(id, date, [entry(`${id}-e`, 'bench', sets)], extra);

test('date helpers: Monday weeks (STAT)', () => {
  assert.equal(weekdayOf('2026-10-26'), 0);
  assert.equal(weekdayOf('2026-11-01'), 6);
  assert.equal(weekStart('2026-11-01'), '2026-10-26');
  assert.equal(weekStart('2026-10-26'), '2026-10-26');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(daysBetween('2026-10-01', '2026-10-31'), 30);
  assert.equal(dayOf(new Date(2026, 9, 31, 23, 30)), '2026-10-31');
  assert.equal(dayOf('2026-10-31T08:00:00.000Z'), '2026-10-31');
});

test('series gives one point per workout for each metric, oldest first (STAT-1)', () => {
  const s = state([
    bench('w2', '2026-10-08', [set('c', 100, 5)]),
    bench('w1', '2026-10-01', [set('a', 80, 10), set('b', 90, 5), set('w', 20, 10, { kind: 'warmup' })]),
  ]);
  assert.deepEqual(series(s, 'bench', 'heaviest').map((p) => [p.date, p.value]), [['2026-10-01', 90], ['2026-10-08', 100]]);
  assert.deepEqual(series(s, 'bench', 'bestSet').map((p) => p.value), [800, 500]);
  assert.deepEqual(series(s, 'bench', 'volume').map((p) => p.value), [1250, 500]);
  assert.deepEqual(series(s, 'bench', 'reps').map((p) => p.value), [15, 5]);
  const e = series(s, 'bench', 'e1rm');
  assert.equal(e[0].value, 80 * (1 + 10 / 30));
  assert.equal(e[1].workoutId, 'w2');
});

test('series filters by date, skips undone sets and unknown input (STAT-1)', () => {
  const s = state([
    bench('w1', '2026-10-01', [set('a', 80, 5)]),
    bench('w2', '2026-10-08', [set('b', 85, 5, { done: false })]),
    bench('w3', '2026-10-15', [set('c', 90, 5)]),
  ]);
  assert.deepEqual(series(s, 'bench', 'heaviest', { from: '2026-10-02' }).map((p) => p.workoutId), ['w3']);
  assert.deepEqual(series(s, 'bench', 'heaviest', { to: '2026-10-14' }).map((p) => p.workoutId), ['w1']);
  assert.deepEqual(series(s, 'bench', 'nope'), []);
  assert.deepEqual(series(s, 'ghost', 'reps'), []);
});

test('series e1rm leaves out sets over 12 reps (STAT-1)', () => {
  const s = state([bench('w1', '2026-10-01', [set('a', 40, 20)])]);
  assert.deepEqual(series(s, 'bench', 'e1rm'), []);
  assert.equal(series(s, 'bench', 'reps')[0].value, 20);
});

test('calendar lists each day with its workouts and categories (STAT-2)', () => {
  const s = state([
    workout('w1', '2026-10-31', [entry('a', 'bench', [set('s', 80, 5)]), entry('b', 'squat', [set('t', 100, 5)])]),
    bench('w2', '2026-10-01', [set('u', 80, 5)]),
  ], {
    exercises: [exercise('bench', { categoryId: 'chest' }), exercise('squat', { categoryId: 'legs' })],
  });
  const days = calendar(s, 2026, 10);
  assert.equal(days.length, 31);
  assert.equal(days[0].weekday, 3);
  assert.deepEqual(days[30].workouts, [{ id: 'w1', categoryIds: ['chest', 'legs'] }]);
  assert.deepEqual(days[0].workouts, [{ id: 'w2', categoryIds: ['chest'] }]);
  assert.deepEqual(days[1].workouts, []);
  assert.equal(calendar(s, 2028, 2).length, 29);
});

test('consistency counts finished workouts a week and the streak (STAT-3)', () => {
  // now is Saturday 2026-10-31, week of 2026-10-26.
  const s = state([
    bench('a', '2026-10-27', [set('1', 80, 5)]),
    bench('b', '2026-10-29', [set('2', 80, 5)]),
    bench('c', '2026-10-20', [set('3', 80, 5)]),
    bench('d', '2026-10-06', [set('4', 80, 5)]),
    bench('open', '2026-10-30', [set('5', 80, 5)], { finished: null }),
  ]);
  const c = consistency(s, '2026-10-31', 3);
  assert.deepEqual(c.perWeek, [
    { week: '2026-10-12', count: 0 }, { week: '2026-10-19', count: 1 }, { week: '2026-10-26', count: 2 },
  ]);
  assert.equal(c.streak, 2);
  assert.equal(c.adherence, null);
});

test('the streak ends last week when this week is empty, and breaks on a gap (STAT-3)', () => {
  const s = state([bench('a', '2026-10-20', [set('1', 80, 5)]), bench('b', '2026-10-13', [set('2', 80, 5)]), bench('c', '2026-10-01', [set('3', 80, 5)])]);
  assert.equal(consistency(s, '2026-10-31').streak, 2);
  assert.equal(consistency(s, '2026-11-09').streak, 0);
  assert.equal(consistency(state([]), '2026-10-31').streak, 0);
});

test('adherence is done working sets over target sets of day workouts (STAT-3)', () => {
  const target = (sets) => ({ sets, reps: 5, repsMax: null, weight: 80, unit: 'kg', rest: null });
  const s = state([
    workout('a', '2026-10-27', [
      entry('e1', 'bench', [set('1', 80, 5), set('2', 80, 5), set('x', 80, 5, { done: false })], { target: target(3) }),
      entry('e2', 'squat', [set('3', 80, 5), set('4', 80, 5), set('5', 80, 5)], { target: target(2) }),
      entry('e3', 'squat', [], { target: target(5), skipped: true }),
    ], { routineId: 'r', dayId: 'd' }),
    bench('free', '2026-10-28', [set('6', 80, 5)]),
  ]);
  assert.equal(consistency(s, '2026-10-31').adherence, 4 / 5);
});

test('weeklySets compares working sets with the week limits (STAT-4)', () => {
  const s = state([
    workout('a', '2026-10-27', [entry('e', 'bench', [set('1', 80, 5), set('2', 80, 5), set('w', 20, 5, { kind: 'warmup' }), set('3', 80, 5, { done: false })])]),
    workout('b', '2026-10-19', [entry('f', 'bench', [set('4', 80, 5)]), entry('g', 'squat', [set('5', 80, 5)])]),
  ], {
    categories: [{ id: 'chest', name: 'Chest', weekMin: 2, weekMax: 4 }, { id: 'legs', name: 'Legs', weekMin: null, weekMax: null }],
    exercises: [exercise('bench', { categoryId: 'chest' }), exercise('squat')],
  });
  const rows = weeklySets(s, '2026-10-31', 2);
  assert.deepEqual(rows.map((r) => r.categoryId), ['chest', 'legs', null]);
  assert.deepEqual(rows[0].weeks, [{ week: '2026-10-19', sets: 1, state: 'below' }, { week: '2026-10-26', sets: 2, state: 'within' }]);
  assert.equal(rows[1].weeks[0].state, 'none');
  assert.equal(rows[2].weeks[0].sets, 1);
  const tight = { ...s, categories: [{ id: 'chest', name: 'Chest', weekMin: null, weekMax: 1 }] };
  assert.equal(weeklySets(tight, '2026-10-31', 2)[0].weeks[1].state, 'above');
  assert.deepEqual(weeklySets(state([]), '2026-10-31', 2), []);
});

const stalled = (extra = {}) => state([
  bench('a', '2026-09-01', [set('1', 100, 5)]),
  bench('b', '2026-09-08', [set('2', 100, 5)]),
  bench('c', '2026-09-15', [set('3', 95, 5)]),
  bench('d', '2026-09-22', [set('4', 100, 5)]),
  bench('e', '2026-09-29', [set('5', 100, 5)]),
], { settings: { ...emptyTraining().settings, stallAfter: 4 }, ...extra });

test('stalls finds an exercise with no new best in stallAfter workouts, with a deload (STAT-5)', () => {
  const [found, ...rest] = stalls(stalled());
  assert.equal(rest.length, 0);
  assert.equal(found.exerciseId, 'bench');
  assert.equal(found.since, 4);
  assert.deepEqual(found.suggestion, { weight: 90, unit: 'kg' });
});

test('stalls is quiet below the count, after a new best, with a rule or archived (STAT-5)', () => {
  const s = stalled();
  assert.deepEqual(stalls({ ...s, settings: { ...s.settings, stallAfter: 5 } }), []);
  assert.deepEqual(stalls({ ...s, workouts: [...s.workouts, bench('f', '2026-10-06', [set('6', 105, 5)])] }), []);
  const ruled = { ...s, routines: [{ id: 'r', days: [{ id: 'd', items: [{ id: 'i', exerciseId: 'bench', rule: { type: 'linear', failAfter: 3, deload: 10 } }] }] }] };
  assert.deepEqual(stalls(ruled), []);
  const noRule = { ...s, routines: [{ id: 'r', days: [{ id: 'd', items: [{ id: 'i', exerciseId: 'bench', rule: null }] }] }] };
  assert.equal(stalls(noRule).length, 1);
  assert.deepEqual(stalls({ ...s, exercises: [exercise('bench', { archived: true })] }), []);
});

test('compare reads the previous finished workout of the same day (STAT-6)', () => {
  const day = { routineId: 'r', dayId: 'd' };
  const s = state([
    workout('p', '2026-10-01', [entry('a', 'bench', [set('1', 80, 5), set('2', 80, 5)])], day),
    workout('other', '2026-10-05', [entry('b', 'bench', [set('3', 200, 5)])], { routineId: 'r', dayId: 'x' }),
    workout('c', '2026-10-08', [entry('d', 'bench', [set('4', 85, 5), set('5', 85, 6)]), entry('e', 'squat', [set('6', 100, 5)])], day),
  ]);
  const result = compare(s, 'c');
  assert.equal(result.previousId, 'p');
  assert.deepEqual(result.exercises[0], {
    exerciseId: 'bench',
    current: { top: 85, reps: 11, volume: 85 * 11 },
    previous: { top: 80, reps: 10, volume: 800 },
    diff: { top: 5, reps: 1, volume: 85 * 11 - 800 },
  });
  assert.equal(result.exercises[1].previous, null);
  assert.equal(result.exercises[1].diff, null);
});

test('compare is null for a first workout, a free workout or an unknown id (STAT-6)', () => {
  const day = { routineId: 'r', dayId: 'd' };
  const s = state([workout('p', '2026-10-01', [entry('a', 'bench', [set('1', 80, 5)])], day), bench('free', '2026-10-02', [set('2', 80, 5)])]);
  assert.equal(compare(s, 'p'), null);
  assert.equal(compare(s, 'free'), null);
  assert.equal(compare(s, 'ghost'), null);
  const open = state([workout('p', '2026-10-01', [], { ...day, finished: null }), workout('q', '2026-10-08', [], day)]);
  assert.equal(compare(open, 'q'), null);
});
