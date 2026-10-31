import { bodyWeightOn } from '#body';
import { findById } from '#training';
import { toKg } from '#units';

// The personal records of an exercise (PR-1), from its done sets. Never stored: each read derives them.

// The records that each type of exercise has, in the order of the screen.
export const RECORDS = {
  weight_reps: ['heaviest', 'mostReps', 'bestSet', 'e1rm', 'bestWorkout'],
  reps: ['mostReps', 'bestWorkout'],
  time: ['longest'],
  distance_time: ['farthest', 'longest'],
  weight_time: ['heaviest', 'longest'],
  weight_distance: ['heaviest', 'farthest'],
};

const WEIGHT_TYPES = ['weight_reps', 'weight_time', 'weight_distance'];
const MAX_E1RM_REPS = 12;
const MAX_REP_MAX = 15;

// PR-2: the estimated one-rep max of a set, `null` outside 1..12 reps or with a weight of zero or less.
export const e1rm = (weight, reps, formula) => {
  if (weight === null || weight === undefined || weight <= 0) return null;
  if (!Number.isInteger(reps) || reps < 1 || reps > MAX_E1RM_REPS) return null;
  if (reps === 1) return weight;
  return formula === 'brzycki' ? (weight * 36) / (37 - reps) : weight * (1 + reps / 30);
};

// PR-9: the load of a set in kg. A bodyweight exercise with a weight adds the body weight of the date
// (BODY-1); with none the added load alone counts and the load is `partial`.
export const effectiveLoad = (state, set, exercise, date) => {
  const added = set.weight === null ? 0 : toKg(set.weight, set.unit);
  if (exercise?.equipment !== 'bodyweight' || !WEIGHT_TYPES.includes(exercise.type)) return { kg: added, partial: false };
  const body = bodyWeightOn(state, date);
  return body ? { kg: toKg(body.value, body.unit) + added, partial: false } : { kg: added, partial: true };
};

// PR-10 (LOG-5): the done sets that count, warm-ups out.
const countedSets = (entry) => entry.sets.filter((s) => s.done && s.kind !== 'warmup');

const byDate = (state) =>
  [...state.workouts].sort((a, b) => (a.date === b.date ? (a.started < b.started ? -1 : 1) : a.date < b.date ? -1 : 1));

// The value of a set for one record, comparable across units (weights in kg). `load` is the kg of the set.
const setValue = {
  heaviest: (s, load) => (s.weight === null ? null : load),
  mostReps: (s) => s.reps,
  bestSet: (s, load) => (s.weight === null || s.reps === null ? null : load * s.reps),
  e1rm: (s, load, formula) => e1rm(load, s.reps, formula),
  longest: (s) => s.seconds,
  farthest: (s) => s.meters,
};

// PR-1: each record of the type is `{ value, set, workout }`, or absent with no set. Workouts are read
// oldest first, and only a greater value replaces a record: a tie keeps the first one.
export const bestsOf = (state, exerciseId) => {
  const exercise = findById(state.exercises, exerciseId);
  const type = exercise?.type;
  if (!type) return {};
  const { formula } = state.settings;
  const bests = {};
  const offer = (name, value, set, workout) => {
    if (value === null || value <= 0) return;
    if (!bests[name] || value > bests[name].value) bests[name] = { value, set, workout };
  };
  for (const workout of byDate(state)) {
    const sets = workout.entries.filter((e) => e.exerciseId === exerciseId).flatMap(countedSets);
    if (!sets.length) continue;
    const loads = new Map(sets.map((s) => [s, effectiveLoad(state, s, exercise, workout.date).kg]));
    for (const name of RECORDS[type]) {
      if (name === 'bestWorkout') {
        const total = type === 'reps'
          ? sets.reduce((sum, s) => sum + (s.reps ?? 0), 0)
          : sets.reduce((sum, s) => sum + (setValue.bestSet(s, loads.get(s)) ?? 0), 0);
        offer(name, total, null, workout);
      } else for (const set of sets) offer(name, setValue[name](set, loads.get(set), formula), set, workout);
    }
  }
  return bests;
};

// PR-2: the best e1RM of an exercise, `{ value, set, workout }`, or `null`.
export const bestE1rm = (state, exerciseId) => bestsOf(state, exerciseId).e1rm ?? null;

// PR-3: for each rep count 1..15 the heaviest done set with exactly that many reps, `{ reps, weight (kg),
// set, workout }`, or `null`. A tie keeps the first.
export const repMaxes = (state, exerciseId) => {
  const exercise = findById(state.exercises, exerciseId);
  const maxes = Array.from({ length: MAX_REP_MAX }, () => null);
  if (!exercise || !WEIGHT_TYPES.includes(exercise.type)) return maxes;
  for (const workout of byDate(state)) {
    for (const entry of workout.entries.filter((e) => e.exerciseId === exerciseId)) {
      for (const set of countedSets(entry)) {
        if (!Number.isInteger(set.reps) || set.reps < 1 || set.reps > MAX_REP_MAX) continue;
        const weight = effectiveLoad(state, set, exercise, workout.date).kg;
        const best = maxes[set.reps - 1];
        if (weight > 0 && (!best || weight > best.weight)) maxes[set.reps - 1] = { reps: set.reps, weight, set, workout };
      }
    }
  }
  return maxes;
};

// PR-4: the names of the records (PR-1) that a set holds now.
export const recordsOfSet = (state, setId) => {
  for (const exercise of state.exercises) {
    const bests = bestsOf(state, exercise.id);
    const held = RECORDS[exercise.type].filter((name) => bests[name]?.set?.id === setId);
    if (held.length) return held;
  }
  return [];
};

// PR-5: the volume of an entry in kg: weight × reps of its counted sets, twice for a unilateral exercise.
const entryVolume = (state, workout, entry) => {
  const exercise = findById(state.exercises, entry.exerciseId);
  if (exercise && exercise.type !== 'weight_reps') return 0;
  const sides = exercise?.unilateral ? 2 : 1;
  return countedSets(entry).reduce((sum, s) => {
    if (s.reps === null || s.weight === null && exercise?.equipment !== 'bodyweight') return sum;
    return sum + Math.max(0, effectiveLoad(state, s, exercise, workout.date).kg) * s.reps * sides;
  }, 0);
};

export const volumeOf = (state, workout) => workout.entries.reduce((sum, e) => sum + entryVolume(state, workout, e), 0);

export const exerciseVolume = (state, exerciseId, workout) =>
  workout.entries.filter((e) => e.exerciseId === exerciseId).reduce((sum, e) => sum + entryVolume(state, workout, e), 0);

// PR-5: the volume of a workout by category id (`null` for none).
export const categoryVolume = (state, workout) => {
  const volumes = new Map();
  for (const entry of workout.entries) {
    const category = findById(state.exercises, entry.exerciseId)?.categoryId ?? null;
    volumes.set(category, (volumes.get(category) ?? 0) + entryVolume(state, workout, entry));
  }
  return volumes;
};
