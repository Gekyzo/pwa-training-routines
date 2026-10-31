import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTraining } from '#training';
import { addGoal, editGoal, deleteGoal, goalProgress } from '#goals';

const NOW = new Date(2026, 9, 31, 12, 0, 0);
const set = (id, weight, reps) => ({ id, weight, unit: 'kg', reps, seconds: null, meters: null, done: true, comment: '', kind: 'working' });
const workout = (id, date, sets) => ({
  id, date, started: `${date}T10:00:00.000Z`, finished: null, routineId: null, dayId: null, routineName: '', dayName: '', comment: '',
  entries: [{ id: `${id}-e`, exerciseId: 'bench', sets }],
});
const base = (workouts = [], bodies = []) => ({
  ...emptyTraining(),
  exercises: [{ id: 'bench', name: 'Bench', categoryId: null, type: 'weight_reps', equipment: 'barbell', archived: false }, { id: 'run', name: 'Run', categoryId: null, type: 'time', equipment: null, archived: false }],
  workouts,
  bodies,
});
const exerciseGoal = (extra = {}) => ({ kind: 'exercise', exerciseId: 'bench', metric: 'e1rm', weight: 100, reps: null, date: null, ...extra });
const add = (state, input) => addGoal(state, input, NOW, 'g');

test('addGoal stores an exercise goal in the unit of the settings (GOAL-1)', () => {
  const { state } = add(base(), exerciseGoal({ weight: '100,26' }));
  assert.deepEqual(state.goals[0], {
    id: 'g', kind: 'exercise', exerciseId: 'bench', metric: 'e1rm', weight: 100.3, unit: 'kg', reps: null, date: null, created: NOW.toISOString(),
  });
});

test('addGoal checks the exercise, the metric and the numbers (GOAL-1)', () => {
  assert.equal(add(base(), exerciseGoal({ exerciseId: 'ghost' })).error.key, 'error.exerciseMissing');
  assert.equal(add(base(), exerciseGoal({ exerciseId: 'run' })).error.key, 'error.goalType');
  assert.equal(add(base(), exerciseGoal({ metric: 'x' })).error.key, 'error.goalMetric');
  assert.equal(add(base(), exerciseGoal({ weight: 0 })).error.key, 'error.numberRange');
  assert.equal(add(base(), exerciseGoal({ weight: 1001 })).error.key, 'error.numberRange');
  assert.equal(add(base(), exerciseGoal({ weight: '' })).error.key, 'error.numberRequired');
  assert.equal(add(base(), exerciseGoal({ metric: 'set', reps: 0 })).error.key, 'error.numberRange');
  assert.equal(add(base(), exerciseGoal({ metric: 'set', reps: 13 })).error.key, 'error.numberRange');
  assert.equal(add(base(), exerciseGoal({ metric: 'set', reps: 2.5 })).error.key, 'error.numberRange');
  assert.equal(add(base(), exerciseGoal({ date: '2026-13-01' })).error.key, 'error.date');
  assert.equal(add(base(), { kind: 'other' }).error.key, 'error.goalKind');
  assert.deepEqual(add(base(), exerciseGoal({ metric: 'set', reps: 5, date: '2027-01-01' })).state.goals[0].reps, 5);
  assert.equal(add(base(), exerciseGoal({ metric: 'e1rm', reps: 5 })).state.goals[0].reps, null);
});

test('addGoal for the body needs a weight and a date (GOAL-2)', () => {
  const { state } = add(base(), { kind: 'body', weight: 75, date: '2027-01-01' });
  assert.deepEqual([state.goals[0].kind, state.goals[0].weight, state.goals[0].exerciseId, state.goals[0].metric], ['body', 75, null, null]);
  assert.equal(add(base(), { kind: 'body', weight: 75, date: '' }).error.key, 'error.date');
  assert.equal(add(base(), { kind: 'body', weight: 10, date: '2027-01-01' }).error.key, 'error.numberRange');
});

test('editGoal changes the target and deleteGoal removes (GOAL-1)', () => {
  const { state } = add(base(), exerciseGoal());
  const edited = editGoal(state, 'g', exerciseGoal({ weight: 120, metric: 'set', reps: 3 }));
  assert.deepEqual([edited.state.goals[0].weight, edited.state.goals[0].metric, edited.state.goals[0].reps], [120, 'set', 3]);
  assert.equal(edited.state.goals[0].created, NOW.toISOString());
  assert.equal(editGoal(state, 'g', exerciseGoal({ weight: 0 })).error.key, 'error.numberRange');
  assert.equal(editGoal(state, 'zz', exerciseGoal()).error.key, 'error.goalMissing');
  assert.equal(deleteGoal(state, 'g').state.goals.length, 0);
  assert.equal(deleteGoal(state, 'zz').error.key, 'error.goalMissing');
});

test('an e1rm goal: progress is the best over the target, reached at the first set that meets it (GOAL-1)', () => {
  const s = base([workout('w1', '2026-10-01', [set('a', 80, 5)]), workout('w2', '2026-10-08', [set('b', 90, 5), set('c', 85, 5)])]);
  const goal = add(s, exerciseGoal()).state.goals[0];
  const p = goalProgress(s, goal, NOW);
  assert.equal(p.best, 105);
  assert.equal(p.target, 100);
  assert.equal(p.ratio, 1);
  assert.equal(p.reached.set.id, 'b');
  assert.equal(p.reached.workout.id, 'w2');
  assert.equal(p.weeklyRate, null);
});

test('an e1rm goal below target has a ratio under 1 and no reach (GOAL-1)', () => {
  const s = base([workout('w1', '2026-10-01', [set('a', 60, 1)])]);
  const goal = add(s, exerciseGoal()).state.goals[0];
  assert.deepEqual(goalProgress(s, goal, NOW), { best: 60, target: 100, ratio: 0.6, reached: null, weeklyRate: null });
  const none = goalProgress(base(), goal, NOW);
  assert.deepEqual([none.best, none.ratio, none.reached], [null, 0, null]);
});

test('a set goal needs the weight and the reps (GOAL-1)', () => {
  const heavySingle = base([workout('w1', '2026-10-01', [set('a', 110, 1), set('b', 90, 8)])]);
  const goal = add(heavySingle, exerciseGoal({ metric: 'set', weight: 100, reps: 5 })).state.goals[0];
  const missed = goalProgress(heavySingle, goal, NOW);
  assert.equal(missed.reached, null);
  assert.ok(missed.ratio > 0.97 && missed.ratio < 1);
  assert.equal(missed.target, 116.7);
  const hit = base([workout('w1', '2026-10-01', [set('a', 100, 4)]), workout('w2', '2026-10-08', [set('b', 102.5, 6)])]);
  const p = goalProgress(hit, goal, NOW);
  assert.equal(p.reached.set.id, 'b');
  assert.equal(p.ratio, 1);
});

test('a goal in lb reads weights in lb (GOAL-1)', () => {
  const lb = { ...base([workout('w1', '2026-10-01', [set('a', 100, 1)])]), settings: { ...emptyTraining().settings, unit: 'lb' } };
  const goal = add(lb, exerciseGoal({ weight: 330 })).state.goals[0];
  const p = goalProgress(lb, goal, NOW);
  assert.equal(p.best, 220.5);
  assert.equal(p.target, 330);
  assert.equal(p.reached, null);
});

const bodyEntry = (id, date, value) => ({ id, date, measure: 'weight', value, unit: 'kg' });

test('a body goal: progress from the first weight, weekly rate to the date (GOAL-2)', () => {
  const s = base([], [bodyEntry('a', '2026-10-01', 90), bodyEntry('b', '2026-10-30', 85)]);
  const goal = addGoal(s, { kind: 'body', weight: 80, date: '2026-12-26' }, new Date(2026, 9, 2), 'g').state.goals[0];
  const p = goalProgress(s, goal, NOW);
  assert.equal(p.best, 85);
  assert.equal(p.target, 80);
  assert.equal(p.ratio, 0.5);
  assert.equal(p.reached, null);
  // 56 days left = 8 weeks, 5 kg to lose.
  assert.equal(p.weeklyRate, -0.6);
});

test('a body goal gaining weight, reached and past its date (GOAL-2)', () => {
  const s = base([], [bodyEntry('a', '2026-10-01', 70), bodyEntry('b', '2026-10-30', 76)]);
  const goal = addGoal(s, { kind: 'body', weight: 75, date: '2026-10-01' }, new Date(2026, 9, 2), 'g').state.goals[0];
  const p = goalProgress(s, goal, NOW);
  assert.equal(p.ratio, 1);
  assert.ok(p.reached);
  assert.equal(p.weeklyRate, null);
});

test('a body goal with no body weight has no progress (GOAL-2)', () => {
  const s = base();
  const goal = addGoal(s, { kind: 'body', weight: 75, date: '2027-01-01' }, NOW, 'g').state.goals[0];
  assert.deepEqual(goalProgress(s, goal, NOW), { best: null, target: 75, ratio: 0, reached: null, weeklyRate: null });
});
