import { checkName, checkNumber, nameTaken, findById } from '#training';

// Routines, their days and the items of a day (RT-1).

const routineMissing = (state) => ({ state, error: { key: 'error.routineMissing' } });
const dayMissing = (state) => ({ state, error: { key: 'error.dayMissing' } });
const itemMissing = (state) => ({ state, error: { key: 'error.itemMissing' } });

const clamp = (index, length) => Math.min(Math.max(index, 0), length);
const moveIn = (list, id, index) => {
  const entry = findById(list, id);
  const rest = list.filter((other) => other.id !== id);
  const at = clamp(index, rest.length);
  return [...rest.slice(0, at), entry, ...rest.slice(at)];
};

const withRoutine = (state, id, change) => ({
  state: { ...state, routines: state.routines.map((r) => (r.id === id ? change(r) : r)) },
});

const withDays = (state, routineId, change) => withRoutine(state, routineId, (r) => ({ ...r, days: change(r.days) }));

const withItems = (state, routineId, dayId, change) =>
  withDays(state, routineId, (days) => days.map((d) => (d.id === dayId ? { ...d, items: change(d.items) } : d)));

// The routine and the day, or the error of the first one that is missing.
const locate = (state, routineId, dayId) => {
  const routine = findById(state.routines, routineId);
  if (!routine) return { error: routineMissing(state) };
  if (dayId === undefined) return { routine };
  const day = findById(routine.days, dayId);
  if (!day) return { error: dayMissing(state) };
  return { routine, day };
};

const checkRoutineName = (state, name, id = null) => {
  const { clean, error } = checkName(name);
  if (error) return { error };
  if (nameTaken(state.routines, clean, id)) return { error: { key: 'error.routineTaken' } };
  return { clean };
};

export const addRoutine = (state, name, now, id = crypto.randomUUID()) => {
  const { clean, error } = checkRoutineName(state, name);
  if (error) return { state, error };
  return { state: { ...state, routines: [...state.routines, { id, name: clean, created: now.toISOString(), days: [] }] } };
};

export const renameRoutine = (state, id, name) => {
  if (!findById(state.routines, id)) return routineMissing(state);
  const { clean, error } = checkRoutineName(state, name, id);
  if (error) return { state, error };
  return withRoutine(state, id, (r) => ({ ...r, name: clean }));
};

// RT-1: the workouts of a deleted routine keep the names of their start.
export const deleteRoutine = (state, id) => {
  if (!findById(state.routines, id)) return routineMissing(state);
  return { state: { ...state, routines: state.routines.filter((r) => r.id !== id) } };
};

const checkDayName = (routine, name, id = null) => {
  const { clean, error } = checkName(name);
  if (error) return { error };
  if (nameTaken(routine.days, clean, id)) return { error: { key: 'error.dayTaken' } };
  return { clean };
};

export const addDay = (state, routineId, name, id = crypto.randomUUID()) => {
  const { routine, error: missing } = locate(state, routineId);
  if (missing) return missing;
  const { clean, error } = checkDayName(routine, name);
  if (error) return { state, error };
  return withDays(state, routineId, (days) => [...days, { id, name: clean, items: [] }]);
};

export const renameDay = (state, routineId, dayId, name) => {
  const { routine, error: missing } = locate(state, routineId, dayId);
  if (missing) return missing;
  const { clean, error } = checkDayName(routine, name, dayId);
  if (error) return { state, error };
  return withDays(state, routineId, (days) => days.map((d) => (d.id === dayId ? { ...d, name: clean } : d)));
};

export const deleteDay = (state, routineId, dayId) => {
  const { error } = locate(state, routineId, dayId);
  if (error) return error;
  return withDays(state, routineId, (days) => days.filter((d) => d.id !== dayId));
};

export const moveDay = (state, routineId, dayId, index) => {
  const { error } = locate(state, routineId, dayId);
  if (error) return error;
  return withDays(state, routineId, (days) => moveIn(days, dayId, index));
};

// RT-1: the target of an item. Reps alone is a fixed target; reps and a top is a range.
const checkItem = (state, { exerciseId, sets, reps = null, repsMax = null, weight = null, rest = null }) => {
  if (!findById(state.exercises, exerciseId)) return { error: { key: 'error.exerciseMissing' } };
  const fields = { exerciseId };
  for (const [field, limit, value, opt] of [
    ['sets', 'sets', sets, false],
    ['reps', 'reps', reps, true],
    ['repsMax', 'reps', repsMax, true],
    ['weight', 'weight', weight, true],
    ['rest', 'rest', rest, true],
  ]) {
    const result = checkNumber(limit, value, { optional: opt });
    if (result.error) return { error: result.error };
    fields[field] = result.value;
  }
  if (fields.repsMax !== null && (fields.reps === null || fields.repsMax < fields.reps)) {
    return { error: { key: 'error.repsRange' } };
  }
  return { fields };
};

export const addItem = (state, routineId, dayId, input, id = crypto.randomUUID()) => {
  const { error: missing } = locate(state, routineId, dayId);
  if (missing) return missing;
  const { fields, error } = checkItem(state, input);
  if (error) return { state, error };
  return withItems(state, routineId, dayId, (items) => [...items, { id, ...fields }]);
};

export const editItem = (state, routineId, dayId, itemId, input) => {
  const { day, error: missing } = locate(state, routineId, dayId);
  if (missing) return missing;
  if (!findById(day.items, itemId)) return itemMissing(state);
  const { fields, error } = checkItem(state, input);
  if (error) return { state, error };
  return withItems(state, routineId, dayId, (items) => items.map((i) => (i.id === itemId ? { id: itemId, ...fields } : i)));
};

export const deleteItem = (state, routineId, dayId, itemId) => {
  const { day, error } = locate(state, routineId, dayId);
  if (error) return error;
  if (!findById(day.items, itemId)) return itemMissing(state);
  return withItems(state, routineId, dayId, (items) => items.filter((i) => i.id !== itemId));
};

export const moveItem = (state, routineId, dayId, itemId, index) => {
  const { day, error } = locate(state, routineId, dayId);
  if (error) return error;
  if (!findById(day.items, itemId)) return itemMissing(state);
  return withItems(state, routineId, dayId, (items) => moveIn(items, itemId, index));
};
