import { APP_SLUG } from '#config';

// The doc of the app: the settings, the categories, the exercises, the routines and the workouts
// (07-training). Order is never stored: each list is sorted when it is read (TRN-3).
export const TRAINING_KEY = `${APP_SLUG}.training`;
export const MAX_NAME = 60;
export const MAX_COMMENT = 500;
export const UNITS = ['kg', 'lb'];
export const TYPES = ['weight_reps', 'reps', 'time', 'distance_time'];

// The fields of a set that each type of exercise uses (EX-2).
export const FIELDS = {
  weight_reps: ['weight', 'reps'],
  reps: ['reps'],
  time: ['seconds'],
  distance_time: ['meters', 'seconds'],
};

// The limits of each number (TRN-4): [min, max, integer].
export const LIMITS = {
  weight: [0, 1000, false],
  reps: [0, 1000, true],
  seconds: [0, 86400, true],
  meters: [0, 1000000, false],
  sets: [1, 20, true],
  rest: [0, 600, true],
};

export const DEFAULT_SETTINGS = { unit: 'kg', rest: 90 };

export const emptyTraining = () => ({
  version: 1,
  settings: { ...DEFAULT_SETTINGS },
  categories: [],
  exercises: [],
  routines: [],
  workouts: [],
});

// The clean name, or an error message.
export const checkName = (text) => {
  const clean = String(text ?? '').trim();
  if (!clean) return { error: { key: 'error.nameRequired' } };
  if (clean.length > MAX_NAME) return { error: { key: 'error.nameTooLong', params: { max: MAX_NAME } } };
  return { clean };
};

export const checkComment = (text) => {
  const clean = String(text ?? '').trim();
  if (clean.length > MAX_COMMENT) return { error: { key: 'error.commentTooLong', params: { max: MAX_COMMENT } } };
  return { clean };
};

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// True when another entry of `list` than `id` has the name `name`, with no regard to case.
export const nameTaken = (list, name, id = null) => list.some((entry) => entry.id !== id && sameName(entry.name, name));

// A number of the field `field` from a text or a number: `null` for an empty value when
// `optional`, else a value in LIMITS, rounded to one decimal or to an integer.
export const checkNumber = (field, value, { optional = false } = {}) => {
  if (value === null || value === undefined || String(value).trim() === '') {
    return optional ? { value: null } : { error: { key: 'error.numberRequired' } };
  }
  const number = Number(String(value).replace(',', '.'));
  const [min, max, integer] = LIMITS[field];
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    return { error: { key: 'error.numberRange', params: { min, max } } };
  }
  return { value: integer ? number : Math.round(number * 10) / 10 };
};

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
export const byName = (a, b) => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : 1);

// TRN-3: the derived orders.
export const sortedCategories = (state) => [...state.categories].sort(byName);
export const sortedExercises = (state) => [...state.exercises].sort(byName);
export const sortedRoutines = (state) =>
  [...state.routines].sort((a, b) => (a.created === b.created ? (a.id < b.id ? -1 : 1) : a.created < b.created ? -1 : 1));
export const sortedWorkouts = (state) =>
  [...state.workouts].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.started !== b.started) return a.started < b.started ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });

export const findById = (list, id) => list.find((entry) => entry.id === id) ?? null;

export const setUnit = (state, unit) => {
  if (!UNITS.includes(unit)) return { state, error: { key: 'error.unit' } };
  return { state: { ...state, settings: { ...state.settings, unit } } };
};

export const setRest = (state, value) => {
  const { value: rest, error } = checkNumber('rest', value);
  if (error) return { state, error };
  return { state: { ...state, settings: { ...state.settings, rest } } };
};

// The local date `YYYY-MM-DD` of a Date.
export const localDate = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// ---- Validation (TRN-2) ----

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value) => typeof value === 'string' && value !== '' && value.length <= 64;
const isName = (value) => typeof value === 'string' && value.trim() !== '' && value.trim().length <= MAX_NAME;
const isText = (value, max) => typeof value === 'string' && value.length <= max;
const isIso = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const inLimits = (field, value) => {
  const [min, max, integer] = LIMITS[field];
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
};
const optional = (field, value) => value === null || inLimits(field, value);
const orNull = (value) => (value === undefined ? null : value);
const uniqueIds = (list) => new Set(list.map((entry) => entry.id)).size === list.length;
const uniqueNames = (list) => new Set(list.map((entry) => entry.name.trim().toLowerCase())).size === list.length;

const cleanSettings = (data) => {
  const settings = isObject(data) ? data : {};
  return {
    unit: UNITS.includes(settings.unit) ? settings.unit : DEFAULT_SETTINGS.unit,
    rest: inLimits('rest', settings.rest) ? settings.rest : DEFAULT_SETTINGS.rest,
  };
};

const cleanCategory = (c) => (isObject(c) && isId(c.id) && isName(c.name) ? { id: c.id, name: c.name.trim() } : null);

const cleanExercise = (e) => {
  if (!isObject(e) || !isId(e.id) || !isName(e.name) || !TYPES.includes(e.type)) return null;
  const categoryId = orNull(e.categoryId);
  const rest = orNull(e.rest);
  if (categoryId !== null && !isId(categoryId)) return null;
  if (!optional('rest', rest)) return null;
  return { id: e.id, name: e.name.trim(), categoryId, type: e.type, rest, archived: e.archived === true };
};

const cleanItem = (i) => {
  if (!isObject(i) || !isId(i.id) || !isId(i.exerciseId) || !inLimits('sets', i.sets)) return null;
  const item = { id: i.id, exerciseId: i.exerciseId, sets: i.sets };
  for (const [field, limit] of [['reps', 'reps'], ['repsMax', 'reps'], ['weight', 'weight'], ['rest', 'rest']]) {
    const value = orNull(i[field]);
    if (!optional(limit, value)) return null;
    item[field] = value;
  }
  if (item.repsMax !== null && (item.reps === null || item.repsMax < item.reps)) return null;
  return item;
};

const cleanDay = (d) => {
  if (!isObject(d) || !isId(d.id) || !isName(d.name) || !Array.isArray(d.items)) return null;
  const items = d.items.map(cleanItem);
  if (items.includes(null) || !uniqueIds(items)) return null;
  return { id: d.id, name: d.name.trim(), items };
};

const cleanRoutine = (r) => {
  if (!isObject(r) || !isId(r.id) || !isName(r.name) || !isIso(r.created) || !Array.isArray(r.days)) return null;
  const days = r.days.map(cleanDay);
  if (days.includes(null) || !uniqueIds(days) || !uniqueNames(days)) return null;
  return { id: r.id, name: r.name.trim(), created: r.created, days };
};

const cleanSet = (s) => {
  if (!isObject(s) || !isId(s.id) || !UNITS.includes(s.unit)) return null;
  const set = { id: s.id };
  for (const field of ['weight', 'reps', 'seconds', 'meters']) {
    const value = orNull(s[field]);
    if (!optional(field, value)) return null;
    set[field] = value;
  }
  const comment = s.comment ?? '';
  if (!isText(comment, MAX_COMMENT)) return null;
  return { ...set, unit: s.unit, done: s.done === true, comment };
};

const cleanEntry = (e) => {
  if (!isObject(e) || !isId(e.id) || !isId(e.exerciseId) || !Array.isArray(e.sets)) return null;
  const sets = e.sets.map(cleanSet);
  if (sets.includes(null) || !uniqueIds(sets)) return null;
  return { id: e.id, exerciseId: e.exerciseId, sets };
};

const cleanWorkout = (w) => {
  if (!isObject(w) || !isId(w.id) || !isDate(w.date) || !isIso(w.started) || !Array.isArray(w.entries)) return null;
  const finished = orNull(w.finished);
  const routineId = orNull(w.routineId);
  const dayId = orNull(w.dayId);
  if (finished !== null && !isIso(finished)) return null;
  if ((routineId !== null && !isId(routineId)) || (dayId !== null && !isId(dayId))) return null;
  const routineName = w.routineName ?? '';
  const dayName = w.dayName ?? '';
  const comment = w.comment ?? '';
  if (!isText(routineName, MAX_NAME) || !isText(dayName, MAX_NAME) || !isText(comment, MAX_COMMENT)) return null;
  const entries = w.entries.map(cleanEntry);
  if (entries.includes(null) || !uniqueIds(entries)) return null;
  return { id: w.id, date: w.date, started: w.started, finished, routineId, dayId, routineName, dayName, comment, entries };
};

const cleanList = (list, clean) => {
  if (!Array.isArray(list)) return null;
  const out = list.map(clean);
  return out.includes(null) || !uniqueIds(out) ? null : out;
};

// TRN-2: a clean version 1 doc, or null. Add a migration here when the version goes up.
export const normalizeTraining = (data) => {
  if (!isObject(data) || data.version !== 1) return null;
  const categories = cleanList(data.categories, cleanCategory);
  const exercises = cleanList(data.exercises, cleanExercise);
  const routines = cleanList(data.routines, cleanRoutine);
  const workouts = cleanList(data.workouts, cleanWorkout);
  if (!categories || !exercises || !routines || !workouts) return null;
  if (!uniqueNames(categories) || !uniqueNames(exercises) || !uniqueNames(routines)) return null;
  return { version: 1, settings: cleanSettings(data.settings), categories, exercises, routines, workouts };
};
