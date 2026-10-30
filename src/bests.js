import { findById } from '#training';
import { toKg } from '#units';

// The personal records of an exercise (PR-1), from its done sets. Never stored: each read derives them.

// The records that each type of exercise has, in the order of the screen.
export const RECORDS = {
  weight_reps: ['heaviest', 'mostReps', 'bestSet', 'bestWorkout'],
  reps: ['mostReps', 'bestWorkout'],
  time: ['longest'],
  distance_time: ['farthest', 'longest'],
};

// The value of a set for one record, comparable across units (weights in kg).
const setValue = {
  heaviest: (s) => (s.weight === null ? null : toKg(s.weight, s.unit)),
  mostReps: (s) => s.reps,
  bestSet: (s) => (s.weight === null || s.reps === null ? null : toKg(s.weight, s.unit) * s.reps),
  longest: (s) => s.seconds,
  farthest: (s) => s.meters,
};

// PR-1: each record of the type is `{ value, set, workout }`, or absent with no set. Workouts are read
// oldest first, and only a greater value replaces a record: a tie keeps the first one.
export const bestsOf = (state, exerciseId) => {
  const type = findById(state.exercises, exerciseId)?.type;
  if (!type) return {};
  const workouts = [...state.workouts].sort((a, b) => (a.date === b.date ? (a.started < b.started ? -1 : 1) : a.date < b.date ? -1 : 1));
  const bests = {};
  const offer = (name, value, set, workout) => {
    if (value === null || value <= 0) return;
    if (!bests[name] || value > bests[name].value) bests[name] = { value, set, workout };
  };
  for (const workout of workouts) {
    const sets = workout.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter((s) => s.done));
    if (!sets.length) continue;
    for (const name of RECORDS[type]) {
      if (name === 'bestWorkout') {
        const total = type === 'reps'
          ? sets.reduce((sum, s) => sum + (s.reps ?? 0), 0)
          : sets.reduce((sum, s) => sum + (setValue.bestSet(s) ?? 0), 0);
        offer(name, total, null, workout);
      } else for (const set of sets) offer(name, setValue[name](set), set, workout);
    }
  }
  return bests;
};
