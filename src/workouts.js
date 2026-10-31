import { FIELDS, SET_KINDS, checkNumber, checkComment, findById, localDate, sortedWorkouts } from '#training';
import { nextTarget } from '#progression';

// Workouts: the start, the sets, the finish, the next day of a routine and the history of an
// exercise (WO-1 to WO-19).

const uuid = () => crypto.randomUUID();
const workoutMissing = (state) => ({ state, error: { key: 'error.workoutMissing' } });
const entryMissing = (state) => ({ state, error: { key: 'error.entryMissing' } });
const setMissing = (state) => ({ state, error: { key: 'error.setMissing' } });

const blankSet = (id, unit, kind = 'working') => ({
  id, weight: null, unit, reps: null, seconds: null, meters: null, done: false, comment: '', kind, effort: null, at: null,
});

// WO-18: an entry holds the item and the targets of its start, its superset group and its skip mark.
const newEntry = (id, exerciseId, sets, extra = {}) => ({
  id, exerciseId, sets, itemId: null, target: null, group: null, skipped: false, substituteFor: null, ...extra,
});

const typeOf = (state, exerciseId) => findById(state.exercises, exerciseId)?.type ?? 'weight_reps';
const isBodyweight = (state, exerciseId) => findById(state.exercises, exerciseId)?.equipment === 'bodyweight';

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

// WO-18: the targets of an item at the start of a workout, after progression (PRG): the snapshot
// of the entry, and the plan of each set when the rule gives one.
export const targetOf = (state, routine, day, item) => {
  const { plan, state: _rule, ...target } = nextTarget(state, routine.id, day.id, item.id);
  return { target, plan };
};

// The planned sets of a target: the values of its plan, else of the target, else of the last time (WO-8).
const plannedSets = (state, exerciseId, target, plan, newId) => {
  const previous = previousSets(state, exerciseId);
  return Array.from({ length: plan?.length ?? target.sets }, (_, index) => {
    const last = previous[Math.min(index, previous.length - 1)];
    const set = last ? { ...blankSet(newId(), last.unit), ...copyValues(last) } : blankSet(newId(), state.settings.unit);
    const { weight, reps } = plan?.[index] ?? target;
    if (weight !== null) Object.assign(set, { weight, unit: target.unit });
    if (reps !== null) set.reps = reps;
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
  const entries = day.items.map((item) => {
    const { target, plan } = targetOf(state, routine, day, item);
    return newEntry(newId(), item.exerciseId, plannedSets(state, item.exerciseId, target, plan, newId), { itemId: item.id, target });
  });
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

// WO-3: the first set of an exercise in a workout has the values of the last time.
const firstSet = (state, exerciseId, workoutId, setId) => {
  const [last] = previousSets(state, exerciseId, workoutId);
  return last ? { ...blankSet(setId, last.unit), ...copyValues(last) } : blankSet(setId, state.settings.unit);
};

// WO-3: an exercise joins the workout with one set of the values of the last time.
export const addEntry = (state, workoutId, exerciseId, id = uuid(), setId = uuid()) => {
  const { workout, error } = locate(state, workoutId);
  if (error) return error;
  if (!findById(state.exercises, exerciseId)) return { state, error: { key: 'error.exerciseMissing' } };
  const set = firstSet(state, exerciseId, workout.id, setId);
  return withEntries(state, workoutId, (entries) => [...entries, newEntry(id, exerciseId, [set])]);
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

// WO-12: the effort in the scale of the settings: RPE 6 to 10 by halves, or RIR 0 to 10. An empty
// value clears it, with no scale too.
const checkEffort = (scale, input) => {
  if (input === null || input === undefined || String(input).trim() === '') return { value: null };
  if (scale === 'none') return { error: { key: 'error.effortOff' } };
  const { value, error } = checkNumber(scale, input, { optional: true });
  if (error) return { error };
  if (value !== null && !Number.isInteger(value * 2)) return { error: { key: 'error.numberRange', params: { min: 6, max: 10 } } };
  return { value };
};

// WO-4: the fields of the type of the exercise; a weight is in the unit of the settings (PR-8).
// WO-13: a weight below zero only for a bodyweight exercise.
export const editSet = (state, workoutId, entryId, setId, input) => {
  const { entry, set, error: missing } = locate(state, workoutId, entryId, setId);
  if (missing) return missing;
  const type = typeOf(state, entry.exerciseId);
  const next = { ...set };
  for (const field of FIELDS[type]) {
    if (!(field in input)) continue;
    const limit = field === 'weight' && isBodyweight(state, entry.exerciseId) ? 'load' : field;
    const { value, error } = checkNumber(limit, input[field], { optional: true });
    if (error) return { state, error };
    next[field] = value;
    if (field === 'weight') next.unit = state.settings.unit;
  }
  if ('comment' in input) {
    const { clean, error } = checkComment(input.comment);
    if (error) return { state, error };
    next.comment = clean;
  }
  // WO-11: the kind of the set.
  if ('kind' in input) {
    if (!SET_KINDS.includes(input.kind)) return { state, error: { key: 'error.setKind' } };
    next.kind = input.kind;
  }
  if ('effort' in input) {
    const { value, error } = checkEffort(state.settings.effort, input.effort);
    if (error) return { state, error };
    next.effort = value;
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

// WO-14: a done set holds the time of its first mark; a set marked not done has none.
export const markDone = (state, workoutId, entryId, setId, done = true, now = null) => {
  const { entry, set, error } = locate(state, workoutId, entryId, setId);
  if (error) return error;
  if (done && !complete(typeOf(state, entry.exerciseId), set)) return { state, error: { key: 'error.setIncomplete' } };
  const at = done ? (set.done ? set.at : null) ?? now?.toISOString() ?? null : null;
  return withSets(state, workoutId, entryId, (sets) => sets.map((s) => (s.id === setId ? { ...s, done, at } : s)));
};

export const deleteSet = (state, workoutId, entryId, setId) => {
  const { error } = locate(state, workoutId, entryId, setId);
  if (error) return error;
  return withSets(state, workoutId, entryId, (sets) => sets.filter((s) => s.id !== setId));
};

// WO-15: a group with one entry left is no group.
const dropLoneGroups = (entries) => {
  const counts = new Map();
  for (const { group } of entries) if (group !== null) counts.set(group, (counts.get(group) ?? 0) + 1);
  return entries.map((e) => (e.group !== null && counts.get(e.group) < 2 ? { ...e, group: null } : e));
};

export const deleteEntry = (state, workoutId, entryId) => {
  const { error } = locate(state, workoutId, entryId);
  if (error) return error;
  return withEntries(state, workoutId, (entries) => dropLoneGroups(entries.filter((e) => e.id !== entryId)));
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
const isDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date)) && !Number.isNaN(Date.parse(date));

export const setWorkoutDate = (state, workoutId, date) => {
  const { error } = locate(state, workoutId);
  if (error) return error;
  if (!isDate(date)) return { state, error: { key: 'error.date' } };
  return withWorkout(state, workoutId, (w) => ({ ...w, date }));
};

// WO-7: the finish drops the sets not done and the exercises left with no set, except a skipped
// one (WO-17). A workout with no done set is deleted.
export const finishWorkout = (state, workoutId, now) => {
  const { workout, error } = locate(state, workoutId);
  if (error) return error;
  const kept = workout.entries.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length || e.skipped);
  const entries = dropLoneGroups(kept);
  if (!entries.some((e) => e.sets.length)) return { state: { ...state, workouts: state.workouts.filter((w) => w.id !== workoutId) }, deleted: true };
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

// WO-19: the warm-up sets `[{ weight, reps }]` (PR-7), in the unit of the settings, go before the
// first working set of the entry, else at its end. They are not done.
export const addWarmups = (state, workoutId, entryId, sets, newId = uuid) => {
  const { error } = locate(state, workoutId, entryId);
  if (error) return error;
  if (!sets.length) return { state };
  const added = sets.map(({ weight, reps }) => ({ ...blankSet(newId(), state.settings.unit, 'warmup'), weight, reps }));
  return withSets(state, workoutId, entryId, (list) => {
    const index = list.findIndex((s) => s.kind === 'working');
    const at = index === -1 ? list.length : index;
    return [...list.slice(0, at), ...added, ...list.slice(at)];
  });
};

// ---- Supersets (WO-15) ----

// The entries of 2 or more join one group, next to each other at the place of the first one, in
// their order. An entry of another group leaves it.
export const groupEntries = (state, workoutId, entryIds, id = uuid()) => {
  const { workout, error } = locate(state, workoutId);
  if (error) return error;
  const ids = new Set(entryIds);
  if (ids.size < 2) return { state, error: { key: 'error.groupSize' } };
  if ([...ids].some((entryId) => !findById(workout.entries, entryId))) return entryMissing(state);
  const members = workout.entries.filter((e) => ids.has(e.id)).map((e) => ({ ...e, group: id }));
  const first = workout.entries.findIndex((e) => ids.has(e.id));
  const before = workout.entries.slice(0, first).filter((e) => !ids.has(e.id));
  const after = workout.entries.slice(first).filter((e) => !ids.has(e.id));
  return withEntries(state, workoutId, () => dropLoneGroups([...before, ...members, ...after]));
};

export const ungroupEntry = (state, workoutId, entryId) => {
  const { error } = locate(state, workoutId, entryId);
  if (error) return error;
  return withEntries(state, workoutId, (entries) => dropLoneGroups(entries.map((e) => (e.id === entryId ? { ...e, group: null } : e))));
};

const groupOf = (workout, entryId) => {
  const entry = findById(workout.entries, entryId);
  return entry?.group ? workout.entries.filter((e) => e.group === entry.group) : null;
};

// True when the rest timer starts after a set of the entry: an entry with no group, or the last
// entry of its group that is not skipped and has sets (the end of the round).
export const restsAfter = (workout, entryId) => {
  const group = groupOf(workout, entryId);
  const end = group?.filter((e) => !e.skipped && e.sets.length).at(-1);
  return !end || end.id === entryId;
};

// The next entry of the group, in a cycle from the entry, that has a set not done; else null.
export const nextInGroup = (workout, entryId) => {
  const group = groupOf(workout, entryId);
  if (!group) return null;
  const index = group.findIndex((e) => e.id === entryId);
  const order = [...group.slice(index + 1), ...group.slice(0, index + 1)];
  return order.find((e) => e.sets.some((s) => !s.done))?.id ?? null;
};

// ---- Duration and auto-close (WO-14) ----

export const AUTO_CLOSE_HOURS = 4;
const AUTO_CLOSE_MS = AUTO_CLOSE_HOURS * 3600 * 1000;

const doneTimes = (workout) =>
  workout.entries.flatMap((e) => e.sets.filter((s) => s.done && s.at).map((s) => Date.parse(s.at))).sort((a, b) => a - b);

// The seconds of a workout: from its first done set, else its start; to its finish when it is
// within 4 hours of its last done set, else to that set. Null with no end.
export const duration = (workout) => {
  const times = doneTimes(workout);
  const start = times[0] ?? Date.parse(workout.started);
  const last = times.at(-1);
  const finished = workout.finished === null ? null : Date.parse(workout.finished);
  const lateFinish = finished !== null && last !== undefined && (finished < last || finished - last > AUTO_CLOSE_MS);
  const end = finished === null || lateFinish ? last : finished;
  return end === undefined ? null : Math.max(0, Math.round((end - start) / 1000));
};

// The open workout whose last done set is more than 4 hours before `now` finishes at that set (WO-7).
export const autoClose = (state, now) => {
  const workout = openWorkout(state);
  const last = workout ? doneTimes(workout).at(-1) : undefined;
  if (last === undefined || now.getTime() - last <= AUTO_CLOSE_MS) return { state };
  return finishWorkout(state, workout.id, new Date(last));
};

// ---- Repeat (WO-16) ----

// The exercises and the sets of a workout as a new open workout on `date`, its sets not done, with
// their values or blank. The kind stays; the comments, the effort when blank, and the skipped entries do not.
export const repeatWorkout = (state, sourceId, date, { values = true } = {}, now, id = uuid(), newId = uuid) => {
  const { workout: source, error } = locate(state, sourceId);
  if (error) return error;
  if (openWorkout(state)) return { state, error: { key: 'error.workoutOpen' } };
  if (!isDate(date)) return { state, error: { key: 'error.date' } };
  const groups = new Map();
  const groupFor = (group) => {
    if (group === null) return null;
    if (!groups.has(group)) groups.set(group, newId());
    return groups.get(group);
  };
  const copySet = (set) => {
    const blank = blankSet(newId(), state.settings.unit, set.kind);
    return values ? { ...blank, ...copyValues(set), effort: set.effort } : blank;
  };
  const entries = source.entries
    .filter((e) => e.sets.length)
    .map((e) => newEntry(newId(), e.exerciseId, e.sets.map(copySet), { group: groupFor(e.group) }));
  const workout = newWorkout(now, id, { date, entries: dropLoneGroups(entries) });
  return { state: { ...state, workouts: [...state.workouts, workout] } };
};

// ---- Skip and substitute (WO-17) ----

const hasDone = (entry) => entry.sets.some((s) => s.done);
const entryHasDone = (state) => ({ state, error: { key: 'error.entryHasDone' } });

const withEntry = (state, workoutId, entryId, change) =>
  withEntries(state, workoutId, (entries) => entries.map((e) => (e.id === entryId ? change(e) : e)));

export const skipEntry = (state, workoutId, entryId) => {
  const { entry, error } = locate(state, workoutId, entryId);
  if (error) return error;
  if (hasDone(entry)) return entryHasDone(state);
  return withEntry(state, workoutId, entryId, (e) => ({ ...e, sets: [], skipped: true }));
};

// An exercise back from a skip with no set gets one set, as WO-3, so the finish keeps it.
export const unskipEntry = (state, workoutId, entryId, setId = uuid()) => {
  const { entry, error } = locate(state, workoutId, entryId);
  if (error) return error;
  const sets = entry.sets.length ? entry.sets : [firstSet(state, entry.exerciseId, workoutId, setId)];
  return withEntry(state, workoutId, entryId, (e) => ({ ...e, skipped: false, sets }));
};

// Another exercise in the place of the entry; `substituteFor` is the exercise of the start. The sets
// keep their values for the same type, else they are blank, which a done set refuses.
export const substituteEntry = (state, workoutId, entryId, exerciseId) => {
  const { entry, error } = locate(state, workoutId, entryId);
  if (error) return error;
  if (!findById(state.exercises, exerciseId)) return { state, error: { key: 'error.exerciseMissing' } };
  const sameType = typeOf(state, exerciseId) === typeOf(state, entry.exerciseId);
  if (!sameType && hasDone(entry)) return entryHasDone(state);
  const original = entry.substituteFor ?? entry.exerciseId;
  const bodyweight = isBodyweight(state, exerciseId);
  const keep = (s) => (!bodyweight && s.weight !== null && s.weight < 0 ? { ...s, weight: null } : s);
  const sets = entry.sets.map((s) => (sameType ? keep(s) : { ...blankSet(s.id, state.settings.unit, s.kind), comment: s.comment }));
  return withEntry(state, workoutId, entryId, (e) => ({ ...e, exerciseId, sets, substituteFor: original === exerciseId ? null : original }));
};
