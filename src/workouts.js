import { FIELDS, checkNumber, checkComment, findById, localDate, sortedWorkouts } from '#training';

// Workouts: the start, the sets, the finish, the next day of a routine and the history of an
// exercise (WO-1 to WO-12).

const uuid = () => crypto.randomUUID();
const workoutMissing = (state) => ({ state, error: { key: 'error.workoutMissing' } });
const entryMissing = (state) => ({ state, error: { key: 'error.entryMissing' } });
const setMissing = (state) => ({ state, error: { key: 'error.setMissing' } });

const blankSet = (id, unit) => ({ id, weight: null, unit, reps: null, seconds: null, meters: null, done: false, comment: '' });

// The values of a set that a new set copies: the fields of the type, never the done mark or the comment.
const copyValues = (from) => ({ weight: from.weight, unit: from.unit, reps: from.reps, seconds: from.seconds, meters: from.meters });

// WO-1: the workout that is not finished, or null. Only one is open at a time.
export const openWorkout = (state) => sortedWorkouts(state).find((w) => w.finished === null) ?? null;

const newWorkout = (now, id, extra = {}) => ({
  id,
  date: localDate(now),
  started: now.toISOString(),
  finished: null,
  routineId: null,
  dayId: null,
  routineName: '',
  dayName: '',
  comment: '',
  entries: [],
  ...extra,
});

// WO-8: the done sets of the newest workout other than `exceptId` that holds the exercise.
export const previousSets = (state, exerciseId, exceptId = null) => {
  for (const workout of sortedWorkouts(state)) {
    if (workout.id === exceptId) continue;
    const sets = workout.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter((s) => s.done));
    if (sets.length) return sets;
  }
  return [];
};

// The planned sets of an item: its target first, else the values of the last time (WO-8).
const plannedSets = (state, item, newId) => {
  const previous = previousSets(state, item.exerciseId);
  return Array.from({ length: item.sets }, (_, index) => {
    const last = previous[Math.min(index, previous.length - 1)];
    const set = last ? { ...blankSet(newId(), last.unit), ...copyValues(last) } : blankSet(newId(), state.settings.unit);
    if (item.weight !== null) Object.assign(set, { weight: item.weight, unit: state.settings.unit });
    if (item.reps !== null) set.reps = item.reps;
    return set;
  });
};

export const startWorkout = (state, now, id = uuid()) => {
  if (openWorkout(state)) return { state, error: { key: 'error.workoutOpen' } };
  return { state: { ...state, workouts: [...state.workouts, newWorkout(now, id)] } };
};

// WO-2: a workout from a day of a routine holds its items as planned sets, and keeps the names.
export const startFromDay = (state, routineId, dayId, now, id = uuid(), newId = uuid) => {
  if (openWorkout(state)) return { state, error: { key: 'error.workoutOpen' } };
  const routine = findById(state.routines, routineId);
  if (!routine) return { state, error: { key: 'error.routineMissing' } };
  const day = findById(routine.days, dayId);
  if (!day) return { state, error: { key: 'error.dayMissing' } };
  const entries = day.items.map((item) => ({ id: newId(), exerciseId: item.exerciseId, sets: plannedSets(state, item, newId) }));
  const workout = newWorkout(now, id, { routineId, dayId, routineName: routine.name, dayName: day.name, entries });
  return { state: { ...state, workouts: [...state.workouts, workout] } };
};

// RT-3: the day after the last day done of the routine, in a cycle; the first day with no workout.
export const nextDay = (state, routineId) => {
  const routine = findById(state.routines, routineId);
  if (!routine || routine.days.length === 0) return null;
  const last = sortedWorkouts(state).find((w) => w.routineId === routineId && findById(routine.days, w.dayId));
  if (!last) return routine.days[0];
  const index = routine.days.findIndex((d) => d.id === last.dayId);
  return routine.days[(index + 1) % routine.days.length];
};

const withWorkout = (state, id, change) => ({
  state: { ...state, workouts: state.workouts.map((w) => (w.id === id ? change(w) : w)) },
});

const withEntries = (state, workoutId, change) => withWorkout(state, workoutId, (w) => ({ ...w, entries: change(w.entries) }));

const withSets = (state, workoutId, entryId, change) =>
  withEntries(state, workoutId, (entries) => entries.map((e) => (e.id === entryId ? { ...e, sets: change(e.sets) } : e)));

const locate = (state, workoutId, entryId, setId) => {
  const workout = findById(state.workouts, workoutId);
  if (!workout) return { error: workoutMissing(state) };
  if (entryId === undefined) return { workout };
  const entry = findById(workout.entries, entryId);
  if (!entry) return { error: entryMissing(state) };
  if (setId === undefined) return { workout, entry };
  const set = findById(entry.sets, setId);
  if (!set) return { error: setMissing(state) };
  return { workout, entry, set };
};

// WO-3: an exercise joins the workout with one set of the values of the last time.
export const addEntry = (state, workoutId, exerciseId, id = uuid(), setId = uuid()) => {
  const { workout, error } = locate(state, workoutId);
  if (error) return error;
  if (!findById(state.exercises, exerciseId)) return { state, error: { key: 'error.exerciseMissing' } };
  const [last] = previousSets(state, exerciseId, workout.id);
  const set = last ? { ...blankSet(setId, last.unit), ...copyValues(last) } : blankSet(setId, state.settings.unit);
  return withEntries(state, workoutId, (entries) => [...entries, { id, exerciseId, sets: [set] }]);
};

// WO-8: a new set copies the last set of its exercise in this workout, else the next set of the last time.
export const addSet = (state, workoutId, entryId, id = uuid()) => {
  const { workout, entry, error } = locate(state, workoutId, entryId);
  if (error) return error;
  const own = entry.sets.at(-1);
  const previous = previousSets(state, entry.exerciseId, workout.id);
  const from = own ?? previous[Math.min(entry.sets.length, previous.length - 1)];
  const set = from ? { ...blankSet(id, from.unit), ...copyValues(from) } : blankSet(id, state.settings.unit);
  return withSets(state, workoutId, entryId, (sets) => [...sets, set]);
};

// WO-4: the fields of the type of the exercise; a weight is in the unit of the settings (PR-8).
export const editSet = (state, workoutId, entryId, setId, input) => {
  const { entry, set, error: missing } = locate(state, workoutId, entryId, setId);
  if (missing) return missing;
  const type = findById(state.exercises, entry.exerciseId)?.type ?? 'weight_reps';
  const next = { ...set };
  for (const field of FIELDS[type]) {
    if (!(field in input)) continue;
    const { value, error } = checkNumber(field, input[field], { optional: true });
    if (error) return { state, error };
    next[field] = value;
    if (field === 'weight') next.unit = state.settings.unit;
  }
  if ('comment' in input) {
    const { clean, error } = checkComment(input.comment);
    if (error) return { state, error };
    next.comment = clean;
  }
  if (next.done && !complete(type, next)) return { state, error: { key: 'error.setIncomplete' } };
  return withSets(state, workoutId, entryId, (sets) => sets.map((s) => (s.id === setId ? next : s)));
};

// WO-5: a set is done when its type has its values: reps, seconds, meters, or meters or seconds.
const complete = (type, set) => {
  if (type === 'weight_reps' || type === 'reps') return set.reps !== null;
  if (type === 'time' || type === 'weight_time') return set.seconds !== null;
  if (type === 'weight_distance') return set.meters !== null;
  return set.meters !== null || set.seconds !== null;
};

export const markDone = (state, workoutId, entryId, setId, done = true) => {
  const { entry, set, error } = locate(state, workoutId, entryId, setId);
  if (error) return error;
  const type = findById(state.exercises, entry.exerciseId)?.type ?? 'weight_reps';
  if (done && !complete(type, set)) return { state, error: { key: 'error.setIncomplete' } };
  return withSets(state, workoutId, entryId, (sets) => sets.map((s) => (s.id === setId ? { ...s, done } : s)));
};

export const deleteSet = (state, workoutId, entryId, setId) => {
  const { error } = locate(state, workoutId, entryId, setId);
  if (error) return error;
  return withSets(state, workoutId, entryId, (sets) => sets.filter((s) => s.id !== setId));
};

export const deleteEntry = (state, workoutId, entryId) => {
  const { error } = locate(state, workoutId, entryId);
  if (error) return error;
  return withEntries(state, workoutId, (entries) => entries.filter((e) => e.id !== entryId));
};

export const moveEntry = (state, workoutId, entryId, index) => {
  const { workout, entry, error } = locate(state, workoutId, entryId);
  if (error) return error;
  const rest = workout.entries.filter((e) => e.id !== entryId);
  const at = Math.min(Math.max(index, 0), rest.length);
  return withEntries(state, workoutId, () => [...rest.slice(0, at), entry, ...rest.slice(at)]);
};

export const setWorkoutComment = (state, workoutId, text) => {
  const { error: missing } = locate(state, workoutId);
  if (missing) return missing;
  const { clean, error } = checkComment(text);
  if (error) return { state, error };
  return withWorkout(state, workoutId, (w) => ({ ...w, comment: clean }));
};

// WO-6: a workout can move to another day, a past day too.
export const setWorkoutDate = (state, workoutId, date) => {
  const { error } = locate(state, workoutId);
  if (error) return error;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || Number.isNaN(Date.parse(date))) return { state, error: { key: 'error.date' } };
  return withWorkout(state, workoutId, (w) => ({ ...w, date }));
};

// WO-7: the finish drops the sets not done and the exercises left with no set. A workout with no
// done set is deleted.
export const finishWorkout = (state, workoutId, now) => {
  const { workout, error } = locate(state, workoutId);
  if (error) return error;
  const entries = workout.entries.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length);
  if (!entries.length) return { state: { ...state, workouts: state.workouts.filter((w) => w.id !== workoutId) }, deleted: true };
  return withWorkout(state, workoutId, (w) => ({ ...w, entries, finished: now.toISOString() }));
};

export const deleteWorkout = (state, workoutId) => {
  const { error } = locate(state, workoutId);
  if (error) return error;
  return { state: { ...state, workouts: state.workouts.filter((w) => w.id !== workoutId) } };
};

// WO-10: each workout that has done sets of the exercise, newest first, with those sets.
export const exerciseHistory = (state, exerciseId) =>
  sortedWorkouts(state)
    .map((workout) => ({
      workout,
      sets: workout.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter((s) => s.done)),
    }))
    .filter(({ sets }) => sets.length);
