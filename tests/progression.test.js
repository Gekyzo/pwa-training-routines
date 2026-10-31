import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTraining, normalizeTraining } from '#training';
import { setRule, nextTarget, roundLoad, itemHistory } from '#progression';
import { startFromDay, editSet, markDone, finishWorkout } from '#workouts';

const LINEAR = { type: 'linear', failAfter: 3, deload: 10 };
const DOUBLE = { type: 'double', failAfter: 2, deload: 10 };
const PERCENT = {
  type: 'percent', tm: 100, unit: 'kg', step: 5,
  weeks: [
    [{ pct: 65, reps: 5, amrap: false }, { pct: 75, reps: 5, amrap: false }, { pct: 85, reps: 5, amrap: true }],
    [{ pct: 70, reps: 3, amrap: false }, { pct: 80, reps: 3, amrap: false }, { pct: 90, reps: 3, amrap: true }],
  ],
};

const item = (extra = {}) => ({ id: 'i1', exerciseId: 'squat', sets: 3, reps: 5, repsMax: null, weight: 100, rest: 120, rule: null, ...extra });

const base = (itemExtra = {}, exerciseExtra = {}) => ({
  ...emptyTraining(),
  exercises: [
    { id: 'squat', name: 'Squat', categoryId: null, type: 'weight_reps', rest: null, archived: false, increment: null, bar: null, unit: null, equipment: null, notes: '', unilateral: false, ...exerciseExtra },
    { id: 'front', name: 'Front squat', categoryId: null, type: 'weight_reps', rest: null, archived: false, increment: null, bar: null, unit: null, equipment: null, notes: '', unilateral: false },
  ],
  routines: [{ id: 'r1', name: 'Legs', created: '2026-09-01T00:00:00.000Z', archived: false, days: [{ id: 'd1', name: 'A', weekdays: [], items: [item(itemExtra)] }] }],
});

let seq = 0;
const set = (weight, reps, extra = {}) => ({
  id: `s${++seq}`, weight, unit: 'kg', reps, seconds: null, meters: null, done: true, comment: '', kind: 'working', effort: null, at: null, ...extra,
});

// A finished workout of day d1 with one entry of the item.
const session = (date, sets, { target = null, itemId = 'i1', exerciseId = 'squat', skipped = false, finished = true } = {}) => ({
  id: `w-${date}-${++seq}`, date, started: `${date}T18:00:00.000Z`, finished: finished ? `${date}T19:00:00.000Z` : null,
  routineId: 'r1', dayId: 'd1', routineName: 'Legs', dayName: 'A', comment: '',
  entries: [{ id: `e${++seq}`, exerciseId, sets, itemId, target, group: null, skipped, substituteFor: null }],
});

const T = (weight, extra = {}) => ({ sets: 3, reps: 5, repsMax: null, weight, unit: 'kg', rest: 120, ...extra });
const fives = (weight, reps = [5, 5, 5]) => reps.map((r) => set(weight, r));
const withWorkouts = (state, ...workouts) => ({ ...state, workouts });
const next = (state) => nextTarget(state, 'r1', 'd1', 'i1');

test('a rule is set on an item, is cleaned and the input stays (PRG-1)', () => {
  const state = base();
  const { state: changed, error } = setRule(state, 'r1', 'd1', 'i1', { type: 'linear' });
  assert.equal(error, undefined);
  assert.deepEqual(changed.routines[0].days[0].items[0].rule, LINEAR);
  assert.deepEqual(state, base());
  assert.notEqual(normalizeTraining(changed), null);
  assert.equal(setRule(changed, 'r1', 'd1', 'i1', null).state.routines[0].days[0].items[0].rule, null);
});

test('a rule that is not valid, or a missing item, is an error and nothing changes', () => {
  const state = base();
  assert.deepEqual(setRule(state, 'r1', 'd1', 'i1', { type: 'linear', failAfter: 0 }), { state, error: { key: 'error.rule' } });
  assert.deepEqual(setRule(state, 'r1', 'd1', 'i1', { type: 'other' }), { state, error: { key: 'error.rule' } });
  assert.deepEqual(setRule(state, 'r1', 'd1', 'i1', { ...PERCENT, weeks: [] }), { state, error: { key: 'error.rule' } });
  assert.deepEqual(setRule(state, 'x', 'd1', 'i1', LINEAR), { state, error: { key: 'error.routineMissing' } });
  assert.deepEqual(setRule(state, 'r1', 'x', 'i1', LINEAR), { state, error: { key: 'error.dayMissing' } });
  assert.deepEqual(setRule(state, 'r1', 'd1', 'x', LINEAR), { state, error: { key: 'error.itemMissing' } });
});

test('an item with no rule has its own targets', () => {
  const state = withWorkouts(base(), session('2026-10-01', fives(100)));
  assert.deepEqual(next(state), {
    sets: 3, reps: 5, repsMax: null, weight: 100, unit: 'kg', rest: 120, plan: null, state: { failures: null, week: null, tm: null },
  });
  assert.equal(nextTarget(state, 'r1', 'd1', 'x'), null);
});

test('the history holds finished sessions of the item and its exercise, oldest first, and no skip', () => {
  const state = withWorkouts(
    base({ rule: LINEAR }),
    session('2026-10-05', fives(105)),
    session('2026-10-01', fives(100)),
    session('2026-10-07', fives(200), { exerciseId: 'front' }),
    session('2026-10-08', [], { skipped: true }),
    session('2026-10-09', fives(300), { itemId: 'other' }),
    session('2026-10-10', fives(400), { finished: false }),
  );
  assert.deepEqual(itemHistory(state, state.routines[0].days[0].items[0]).map((e) => e.sets[0].weight), [100, 105]);
});

test('linear: the first session takes the weight of the item (PRG-1)', () => {
  const target = next(base({ rule: LINEAR }));
  assert.equal(target.weight, 100);
  assert.deepEqual(target.state, { failures: 0, week: null, tm: null });
});

test('linear: with no weight on the item the first session takes the last done weight of the exercise, else none', () => {
  assert.equal(next(base({ rule: LINEAR, weight: null })).weight, null);
  const other = withWorkouts(base({ rule: LINEAR, weight: null }), session('2026-10-01', [set(20, 10, { kind: 'warmup' }), set(81, 5), set(80, 5)], { itemId: null }));
  assert.equal(next(other).weight, 80);
});

test('linear: a success adds the increment to the done weight (PRG-1)', () => {
  const state = withWorkouts(base({ rule: LINEAR }), session('2026-10-01', fives(100), { target: T(100) }));
  assert.equal(next(state).weight, 102.5);
  assert.equal(next(state).state.failures, 0);
});

test('linear: a failure keeps the weight; warm-ups do not count (PRG-1)', () => {
  const state = withWorkouts(
    base({ rule: LINEAR }),
    session('2026-10-01', [set(100, 5, { kind: 'warmup' }), set(100, 5), set(100, 5), set(100, 4)], { target: T(100) }),
  );
  assert.equal(next(state).weight, 100);
  assert.equal(next(state).state.failures, 1);
  const short = withWorkouts(base({ rule: LINEAR }), session('2026-10-01', [set(20, 5, { kind: 'warmup' }), ...fives(100, [5, 5])], { target: T(100) }));
  assert.equal(next(short).weight, 100);
});

test('linear: a lighter set is a failure, and the units compare in kg', () => {
  const light = withWorkouts(base({ rule: LINEAR }), session('2026-10-01', fives(97.5), { target: T(100) }));
  assert.equal(next(light).weight, 100);
  // 225 lb is 102.06 kg: a success over 100 kg, and the next weight is in kg, rounded down.
  const pounds = withWorkouts(base({ rule: LINEAR }), session('2026-10-01', [225, 225, 225].map((w) => set(w, 5, { unit: 'lb' })), { target: T(100) }));
  assert.equal(next(pounds).weight, 102.5);
});

test('linear: a session with no snapshot counts against the targets of the item', () => {
  const state = withWorkouts(base({ rule: LINEAR }), session('2026-10-01', fives(100)));
  assert.equal(next(state).weight, 102.5);
});

test('a deload follows failAfter failures in a row, and the count restarts (PRG-3)', () => {
  const failed = (date) => session(date, fives(100, [5, 5, 3]), { target: T(100) });
  const two = withWorkouts(base({ rule: LINEAR }), failed('2026-10-01'), failed('2026-10-03'));
  assert.equal(next(two).weight, 100);
  assert.equal(next(two).state.failures, 2);
  const three = withWorkouts(base({ rule: LINEAR }), failed('2026-10-01'), failed('2026-10-03'), failed('2026-10-05'));
  assert.equal(next(three).weight, 90);
  assert.equal(next(three).state.failures, 0);
  // 102.5 × 0.9 = 92.25, rounded down to the increment.
  const odd = withWorkouts(base({ rule: { ...LINEAR, failAfter: 1 } }), session('2026-10-01', fives(102.5, [5, 5, 3]), { target: T(102.5) }));
  assert.equal(next(odd).weight, 90);
});

test('a success restarts the count of failures (PRG-3)', () => {
  const state = withWorkouts(
    base({ rule: LINEAR }),
    session('2026-10-01', fives(100, [5, 5, 3]), { target: T(100) }),
    session('2026-10-03', fives(100, [5, 5, 3]), { target: T(100) }),
    session('2026-10-05', fives(100), { target: T(100) }),
    session('2026-10-07', fives(102.5, [5, 5, 4]), { target: T(102.5) }),
  );
  assert.deepEqual([next(state).weight, next(state).state.failures], [102.5, 1]);
});

test('double: a session at the top adds the increment and the reps go back (PRG-2)', () => {
  const state = withWorkouts(
    base({ rule: DOUBLE, reps: 8, repsMax: 12 }),
    session('2026-10-01', fives(60, [12, 12, 12]), { target: T(60, { reps: 8, repsMax: 12 }) }),
  );
  const target = next(state);
  assert.deepEqual([target.weight, target.reps, target.repsMax, target.plan], [62.5, 8, 12, null]);
});

test('double: below the top the weight stays and each set plans one rep more, up to the top (PRG-2)', () => {
  const state = withWorkouts(
    base({ rule: DOUBLE, reps: 8, repsMax: 12 }),
    session('2026-10-01', fives(60, [12, 10, 9]), { target: T(60, { reps: 8, repsMax: 12 }) }),
  );
  const target = next(state);
  assert.equal(target.weight, 60);
  assert.deepEqual(target.plan, [
    { weight: 60, reps: 12, amrap: false },
    { weight: 60, reps: 11, amrap: false },
    { weight: 60, reps: 10, amrap: false },
  ]);
});

test('double: a missing set plans the reps of the item, and a deload sends the reps back (PRG-2, PRG-3)', () => {
  const failed = (date) => session(date, fives(60, [10, 9]), { target: T(60, { reps: 8, repsMax: 12 }) });
  const one = withWorkouts(base({ rule: DOUBLE, reps: 8, repsMax: 12 }), failed('2026-10-01'));
  assert.deepEqual(next(one).plan.map((p) => p.reps), [11, 10, 8]);
  const two = withWorkouts(base({ rule: DOUBLE, reps: 8, repsMax: 12 }), failed('2026-10-01'), failed('2026-10-03'));
  assert.deepEqual([next(two).weight, next(two).reps, next(two).plan], [52.5, 8, null]);
});

test('the increment of the exercise in its unit, else 2.5 kg or 5 lb', () => {
  const own = withWorkouts(base({ rule: LINEAR }, { increment: 1, unit: 'kg' }), session('2026-10-01', fives(100), { target: T(100) }));
  assert.equal(next(own).weight, 101);
  const lb = { ...base({ rule: LINEAR }), settings: { ...emptyTraining().settings, unit: 'lb' } };
  const pounds = withWorkouts(lb, session('2026-10-01', [225, 225, 225].map((w) => set(w, 5, { unit: 'lb' })), { target: T(225, { unit: 'lb' }) }));
  assert.deepEqual([next(pounds).weight, next(pounds).unit], [230, 'lb']);
});

test('roundLoad rounds down to the increment in the unit', () => {
  const exercise = base().exercises[0];
  const state = base();
  assert.equal(roundLoad(state, exercise, 104.9, 'kg'), 102.5);
  assert.equal(roundLoad(state, exercise, 102.5, 'kg'), 102.5);
  assert.equal(roundLoad(state, exercise, 104.9, 'lb'), 100);
  assert.equal(roundLoad(state, { ...exercise, increment: 0.5, unit: 'kg' }, 10.3, 'kg'), 10);
  assert.equal(roundLoad(state, exercise, null, 'kg'), null);
  assert.equal(roundLoad(state, exercise, -5, 'kg'), 0);
});

test('a planned value that the user edits is what the rule reads (PRG-4)', () => {
  let { state } = startFromDay(base({ rule: LINEAR }), 'r1', 'd1', new Date(2026, 9, 1, 18), 'w1', (() => { let n = 0; return () => `id${++n}`; })());
  const [entry] = state.workouts[0].entries;
  ({ state } = editSet(state, 'w1', entry.id, entry.sets[2].id, { reps: '3' }));
  for (const s of entry.sets) ({ state } = markDone(state, 'w1', entry.id, s.id, true, new Date(2026, 9, 1, 18, 5)));
  ({ state } = finishWorkout(state, 'w1', new Date(2026, 9, 1, 19)));
  assert.equal(next(state).weight, 100);
  assert.equal(next(state).state.failures, 1);
});

test('percent: the week, the training max and the planned sets (PRG-5)', () => {
  const first = next(base({ rule: PERCENT }));
  assert.deepEqual(first.plan, [
    { weight: 65, reps: 5, amrap: false },
    { weight: 75, reps: 5, amrap: false },
    { weight: 85, reps: 5, amrap: true },
  ]);
  assert.deepEqual([first.sets, first.reps, first.weight, first.unit], [3, 5, 85, 'kg']);
  assert.deepEqual(first.state, { failures: null, week: 0, tm: 100 });
  const one = withWorkouts(base({ rule: PERCENT }), session('2026-10-01', fives(85)));
  assert.deepEqual(next(one).state, { failures: null, week: 1, tm: 100 });
  assert.deepEqual(next(one).plan.map((p) => p.weight), [70, 80, 90]);
  // After a full cycle tm is 105: 65 % is 68.25, rounded down to 67.5.
  const cycle = withWorkouts(base({ rule: PERCENT }), session('2026-10-01', fives(85)), session('2026-10-03', fives(90)));
  assert.deepEqual(next(cycle).state, { failures: null, week: 0, tm: 105 });
  assert.deepEqual(next(cycle).plan.map((p) => p.weight), [67.5, 77.5, 87.5]);
});

test('percent: the weights are in the unit of the rule', () => {
  const target = next(base({ rule: { ...PERCENT, tm: 300, unit: 'lb' } }));
  assert.equal(target.unit, 'lb');
  assert.deepEqual(target.plan.map((p) => p.weight), [195, 225, 255]);
});

test('a start from a day snapshots the next target and plans the sets from it (RT-6, WO-18)', () => {
  const ids = () => { let n = 0; return () => `id${++n}`; };
  const day = new Date(2026, 9, 10, 18);
  const double = withWorkouts(
    base({ rule: DOUBLE, reps: 8, repsMax: 12 }),
    session('2026-10-01', fives(60, [12, 10, 9]), { target: T(60, { reps: 8, repsMax: 12 }) }),
  );
  const { state } = startFromDay(double, 'r1', 'd1', day, 'w1', ids());
  const entry = state.workouts.find((w) => w.id === 'w1').entries[0];
  assert.deepEqual(entry.target, { sets: 3, reps: 8, repsMax: 12, weight: 60, unit: 'kg', rest: 120 });
  assert.deepEqual(entry.sets.map((s) => [s.weight, s.unit, s.reps, s.done]), [[60, 'kg', 12, false], [60, 'kg', 11, false], [60, 'kg', 10, false]]);
  assert.notEqual(normalizeTraining(state), null);

  const { state: percent } = startFromDay(base({ rule: { ...PERCENT, unit: 'lb', tm: 300 } }), 'r1', 'd1', day, 'w1', ids());
  const [planned] = percent.workouts[0].entries;
  assert.deepEqual(planned.target, { sets: 3, reps: 5, repsMax: null, weight: 255, unit: 'lb', rest: 120 });
  assert.deepEqual(planned.sets.map((s) => [s.weight, s.unit, s.reps]), [[195, 'lb', 5], [225, 'lb', 5], [255, 'lb', 5]]);
});

test('a linear start plans the progressed weight on every set', () => {
  const state = withWorkouts(base({ rule: LINEAR }), session('2026-10-01', fives(100), { target: T(100) }));
  const { state: started } = startFromDay(state, 'r1', 'd1', new Date(2026, 9, 10, 18), 'w1', (() => { let n = 0; return () => `id${++n}`; })());
  const entry = started.workouts.find((w) => w.id === 'w1').entries[0];
  assert.equal(entry.target.weight, 102.5);
  assert.deepEqual(entry.sets.map((s) => [s.weight, s.reps]), [[102.5, 5], [102.5, 5], [102.5, 5]]);
});
