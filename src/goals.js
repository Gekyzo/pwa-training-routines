import { bodyWeightOn, checkDate } from '#body';
import { bestE1rm, countedSets, effectiveLoad, e1rm } from '#bests';
import { dayOf, daysBetween } from '#insights';
import { GOAL_KINDS, GOAL_METRICS, checkNumber, findById, sortedWorkouts } from '#training';
import { convert, toKg } from '#units';

// Goals (GOAL-1, GOAL-2). A goal keeps its target; its progress comes from the history at each read.

const uuid = () => crypto.randomUUID();
const goalMissing = (state) => ({ state, error: { key: 'error.goalMissing' } });
// A weight typed from the text of another unit is one decimal off; it still reaches the target.
const TOLERANCE_KG = 0.05;
const MAX_GOAL_REPS = 12;
const tidy = (value) => Math.round(value * 10) / 10;

const positive = (field, value, min = 0.1) => {
  const checked = checkNumber(field, value);
  if (checked.error) return checked;
  if (checked.value < min) return { error: { key: 'error.numberRange', params: { min, max: 1000 } } };
  return checked;
};

// The clean fields of a goal of a kind from an input, or an error. The unit is the unit of the settings.
const cleanGoalInput = (state, kind, input) => {
  const unit = state.settings.unit;
  if (kind === 'body') {
    const weight = checkNumber('bodyWeight', input.weight);
    if (weight.error) return { error: weight.error };
    const date = checkDate(input.date);
    if (date.error) return { error: date.error };
    return { clean: { exerciseId: null, metric: null, weight: weight.value, unit, reps: null, date: date.value } };
  }
  const exercise = findById(state.exercises, input.exerciseId);
  if (!exercise) return { error: { key: 'error.exerciseMissing' } };
  if (exercise.type !== 'weight_reps') return { error: { key: 'error.goalType' } };
  if (!GOAL_METRICS.includes(input.metric)) return { error: { key: 'error.goalMetric' } };
  const weight = positive('weight', input.weight);
  if (weight.error) return { error: weight.error };
  let reps = null;
  if (input.metric === 'set') {
    const checked = checkNumber('reps', input.reps);
    if (checked.error) return { error: checked.error };
    if (checked.value < 1 || checked.value > MAX_GOAL_REPS) return { error: { key: 'error.numberRange', params: { min: 1, max: MAX_GOAL_REPS } } };
    reps = checked.value;
  }
  let date = null;
  if (input.date !== null && input.date !== undefined && input.date !== '') {
    const checked = checkDate(input.date);
    if (checked.error) return { error: checked.error };
    date = checked.value;
  }
  return { clean: { exerciseId: exercise.id, metric: input.metric, weight: weight.value, unit, reps, date } };
};

// GOAL-1, GOAL-2: `input` is `{ kind, exerciseId, metric, weight, reps, date }`; `now` (a Date) stamps `created`.
export const addGoal = (state, input, now, id = uuid()) => {
  if (!GOAL_KINDS.includes(input.kind)) return { state, error: { key: 'error.goalKind' } };
  const { clean, error } = cleanGoalInput(state, input.kind, input);
  if (error) return { state, error };
  const created = now instanceof Date ? now.toISOString() : String(now);
  return { state: { ...state, goals: [...state.goals, { id, kind: input.kind, ...clean, created }] } };
};

// The kind of a goal stays; its target changes.
export const editGoal = (state, id, input) => {
  const goal = findById(state.goals, id);
  if (!goal) return goalMissing(state);
  const { clean, error } = cleanGoalInput(state, goal.kind, input);
  if (error) return { state, error };
  return { state: { ...state, goals: state.goals.map((g) => (g.id === id ? { ...g, ...clean } : g)) } };
};

export const deleteGoal = (state, id) => {
  if (!findById(state.goals, id)) return goalMissing(state);
  return { state: { ...state, goals: state.goals.filter((g) => g.id !== id) } };
};

// GOAL-1: the first done set, oldest workout first, that meets the goal: `{ set, workout }` or `null`.
const reachedBy = (state, goal, exercise, targetKg) => {
  const { formula } = state.settings;
  for (const workout of sortedWorkouts(state).reverse()) {
    for (const entry of workout.entries.filter((e) => e.exerciseId === exercise.id)) {
      for (const set of countedSets(entry)) {
        const load = effectiveLoad(state, set, exercise, workout.date).kg;
        const met = goal.metric === 'set'
          ? load >= targetKg - TOLERANCE_KG && (set.reps ?? 0) >= goal.reps
          : (e1rm(load, set.reps, formula) ?? 0) >= targetKg - TOLERANCE_KG;
        if (met) return { set, workout };
      }
    }
  }
  return null;
};

const exerciseProgress = (state, goal) => {
  const exercise = findById(state.exercises, goal.exerciseId);
  if (!exercise) return { best: null, target: goal.weight, ratio: 0, reached: null, weeklyRate: null };
  const targetKg = toKg(goal.weight, goal.unit);
  // GOAL-1: for a set goal the target is the e1RM of its weight and reps; progress is the best e1RM of
  // the exercise against it, and the goal is reached only by a set of the weight and the reps.
  const target = goal.metric === 'set' ? e1rm(targetKg, goal.reps, state.settings.formula) : targetKg;
  const best = bestE1rm(state, goal.exerciseId)?.value ?? null;
  const reached = reachedBy(state, goal, exercise, targetKg);
  const ratio = reached ? 1 : best === null ? 0 : Math.min(1, best / target);
  const shown = (kg) => (kg === null ? null : tidy(convert(kg, 'kg', goal.unit)));
  return { best: shown(best), target: shown(target), ratio, reached, weeklyRate: null };
};

// GOAL-2: progress is the part of the way from the first weight to the target; the weekly rate is the
// weight still to change ÷ the weeks left to the date (`null` when the date has passed).
const bodyProgress = (state, goal, now) => {
  const today = dayOf(now);
  const inUnit = (entry) => (entry ? convert(entry.value, entry.unit, goal.unit) : null);
  const current = inUnit(bodyWeightOn(state, today));
  const first = state.bodies.filter((b) => b.measure === 'weight').sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const start = inUnit(bodyWeightOn(state, goal.created.slice(0, 10))) ?? inUnit(first);
  const weeks = daysBetween(today, goal.date) / 7;
  const weeklyRate = current === null || weeks <= 0 ? null : tidy((goal.weight - current) / weeks);
  if (current === null) return { best: null, target: goal.weight, ratio: 0, reached: null, weeklyRate };
  const span = start - goal.weight;
  const ratio = Math.min(1, Math.max(0, span === 0 ? (Math.abs(current - goal.weight) < 0.05 ? 1 : 0) : (start - current) / span));
  return { best: tidy(current), target: goal.weight, ratio, reached: ratio >= 1 ? { set: null, workout: null } : null, weeklyRate };
};

// GOAL-1, GOAL-2: `{ best, target, ratio (0..1), reached, weeklyRate }`, weights in the unit of the goal.
export const goalProgress = (state, goal, now) => (goal.kind === 'body' ? bodyProgress(state, goal, now) : exerciseProgress(state, goal));
