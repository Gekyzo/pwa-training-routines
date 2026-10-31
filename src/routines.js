import { checkName, checkNumber, nameTaken, findById, sortedRoutines, MAX_NAME } from '#training';
import { seedExercises, seedExerciseId } from '#exercises';

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
  return { state: { ...state, routines: [...state.routines, { id, name: clean, created: now.toISOString(), archived: false, days: [] }] } };
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
  return withDays(state, routineId, (days) => [...days, { id, name: clean, weekdays: [], items: [] }]);
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
  return withItems(state, routineId, dayId, (items) => [...items, { id, ...fields, rule: null }]);
};

export const editItem = (state, routineId, dayId, itemId, input) => {
  const { day, error: missing } = locate(state, routineId, dayId);
  if (missing) return missing;
  if (!findById(day.items, itemId)) return itemMissing(state);
  const { fields, error } = checkItem(state, input);
  if (error) return { state, error };
  return withItems(state, routineId, dayId, (items) => items.map((i) => (i.id === itemId ? { id: itemId, ...fields, rule: i.rule ?? null } : i)));
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

// RT-5: the first name `<base> (n)`, n from 2, that no routine has, with no regard to case. The base
// is cut so that the name stays within the limit.
const freeName = (state, base) => {
  if (!nameTaken(state.routines, base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`;
    const name = `${base.slice(0, MAX_NAME - suffix.length).trimEnd()}${suffix}`;
    if (!nameTaken(state.routines, name)) return name;
  }
};

// RT-5: a copy with new ids for the routine, its days and its items; the workouts stay with the original.
export const duplicateRoutine = (state, routineId, now, id = crypto.randomUUID(), newId = crypto.randomUUID) => {
  const source = findById(state.routines, routineId);
  if (!source) return routineMissing(state);
  const copy = {
    id,
    name: freeName(state, source.name),
    created: now.toISOString(),
    archived: false,
    days: source.days.map((day) => ({
      ...day,
      id: newId(),
      weekdays: [...day.weekdays],
      items: day.items.map((item) => ({ ...structuredClone(item), id: newId() })),
    })),
  };
  return { state: { ...state, routines: [...state.routines, copy] } };
};

// RT-5: an archived routine leaves Next day and Today and stays in the doc.
export const archiveRoutine = (state, id, archived = true) => {
  if (!findById(state.routines, id)) return routineMissing(state);
  return withRoutine(state, id, (r) => ({ ...r, archived }));
};

// The routines that Next day and Today offer.
export const activeRoutines = (state) => sortedRoutines(state).filter((r) => !r.archived);

// RT-7: the weekdays of a day, 0 = Monday to 6 = Sunday, without repeats, sorted.
export const setWeekdays = (state, routineId, dayId, weekdays) => {
  const { error: missing } = locate(state, routineId, dayId);
  if (missing) return missing;
  if (!Array.isArray(weekdays) || !weekdays.every((w) => Number.isInteger(w) && w >= 0 && w <= 6)) {
    return { state, error: { key: 'error.weekday' } };
  }
  const clean = [...new Set(weekdays)].sort((a, b) => a - b);
  return withDays(state, routineId, (days) => days.map((d) => (d.id === dayId ? { ...d, weekdays: clean } : d)));
};

// RT-7: the days of the routines not archived that have the local weekday of `now`.
export const todayDays = (state, now) => {
  const weekday = (now.getDay() + 6) % 7;
  return activeRoutines(state).flatMap((routine) =>
    routine.days.filter((day) => day.weekdays.includes(weekday)).map((day) => ({ routine, day })));
};

// RT-8: a day is a list of [seed slug, sets, reps, top of the range or null].
const compound = (slug) => [slug, 3, 5, null];
const accessory = (slug) => [slug, 3, 8, 12];
export const TEMPLATES = [
  {
    id: 'full-body',
    days: [
      [compound('squat'), compound('bench-press'), accessory('barbell-row'), accessory('lateral-raise'), accessory('crunch')],
      [compound('deadlift'), compound('overhead-press'), accessory('lat-pulldown'), accessory('lunge'), accessory('dumbbell-curl')],
      [compound('squat'), accessory('incline-dumbbell-press'), accessory('seated-cable-row'), accessory('romanian-deadlift'), accessory('triceps-pushdown')],
    ],
  },
  {
    id: 'upper-lower',
    days: [
      [compound('bench-press'), accessory('barbell-row'), compound('overhead-press'), accessory('lat-pulldown'), accessory('dumbbell-curl'), accessory('triceps-pushdown')],
      [compound('squat'), accessory('romanian-deadlift'), accessory('leg-press'), accessory('leg-curl'), accessory('calf-raise')],
    ],
  },
  {
    id: 'push-pull-legs',
    days: [
      [compound('bench-press'), compound('overhead-press'), accessory('incline-dumbbell-press'), accessory('lateral-raise'), accessory('triceps-pushdown')],
      [compound('deadlift'), accessory('barbell-row'), accessory('lat-pulldown'), accessory('face-pull'), accessory('barbell-curl')],
      [compound('squat'), accessory('romanian-deadlift'), accessory('leg-press'), accessory('leg-curl'), accessory('calf-raise')],
    ],
  },
];

// RT-8: adds the routine of a template, with the seed exercises that the doc lacks (EX-4). `texts(key)`
// gives `template.<id>.name`, `template.<id>.day.<n>` and the seed names, as `seedExercises` takes.
export const addTemplate = (state, templateId, texts, now, newId = crypto.randomUUID) => {
  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) return { state, error: { key: 'error.templateMissing' } };
  const { state: seeded } = seedExercises(state, texts);
  const exerciseOf = (slug) => {
    const byId = findById(seeded.exercises, seedExerciseId(slug));
    if (byId) return byId.id;
    // A seed skipped for a name that the user's exercise has: that exercise stands in.
    const name = texts(`seed.exercise.${slug}`).trim().toLowerCase();
    return seeded.exercises.find((e) => e.name.trim().toLowerCase() === name)?.id ?? null;
  };
  const days = [];
  for (const [index, items] of template.days.entries()) {
    const { clean, error } = checkName(texts(`template.${templateId}.day.${index + 1}`));
    if (error) return { state, error };
    const built = [];
    for (const [slug, sets, reps, repsMax] of items) {
      const exerciseId = exerciseOf(slug);
      if (exerciseId === null) return { state, error: { key: 'error.exerciseMissing' } };
      built.push({ id: newId(), exerciseId, sets, reps, repsMax, weight: null, rest: null, rule: null });
    }
    days.push({ id: newId(), name: clean, weekdays: [], items: built });
  }
  const { clean: base, error } = checkName(texts(`template.${templateId}.name`));
  if (error) return { state, error };
  const routine = { id: newId(), name: freeName(seeded, base), created: now.toISOString(), archived: false, days };
  return { state: { ...seeded, routines: [...seeded.routines, routine] } };
};
