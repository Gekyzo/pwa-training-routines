import { APP_SLUG } from '#config';

// The doc of the app: the settings, the categories, the exercises, the routines, the workouts, the
// body entries and the goals (07-training). Order is never stored: each list is sorted when it is
// read (TRN-3).
export const TRAINING_KEY = `${APP_SLUG}.training`;
export const TRAINING_VERSION = 2;
export const MAX_NAME = 60;
export const MAX_COMMENT = 500;
export const UNITS = ['kg', 'lb'];
export const TYPES = ['weight_reps', 'reps', 'time', 'distance_time', 'weight_time', 'weight_distance'];
export const FORMULAS = ['epley', 'brzycki'];
export const EFFORTS = ['none', 'rpe', 'rir'];
export const SEXES = ['male', 'female'];
export const MEASURE_UNITS = ['cm', 'in', '%'];
export const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'];
export const SET_KINDS = ['working', 'warmup', 'drop', 'failure'];
export const RULE_TYPES = ['linear', 'double', 'percent'];
export const GOAL_KINDS = ['exercise', 'body'];
export const GOAL_METRICS = ['e1rm', 'set'];
// The `measure` of a body entry of the body weight; any other value is the id of a measure.
export const BODY_WEIGHT = 'weight';
// TRN-7: a percent rule has 1 to 8 weeks of 1 to 10 sets; a plate weighs more than 0 and up to 100.
export const MAX_RULE_WEEKS = 8;
export const MAX_RULE_SETS = 10;
export const MAX_PLATE = 100;

// The fields of a set that each type of exercise uses (EX-2).
export const FIELDS = {
  weight_reps: ['weight', 'reps'],
  reps: ['reps'],
  time: ['seconds'],
  distance_time: ['meters', 'seconds'],
  weight_time: ['weight', 'seconds'],
  weight_distance: ['weight', 'meters'],
};

// The limits of each number (TRN-4): [min, max, integer].
export const LIMITS = {
  weight: [0, 1000, false],
  // The weight of a set in the doc: a negative load is an assisted set (LOG-9).
  load: [-1000, 1000, false],
  reps: [0, 1000, true],
  seconds: [0, 86400, true],
  meters: [0, 1000000, false],
  sets: [1, 20, true],
  rest: [0, 600, true],
  // The effort of a set in the doc: RPE 6..10 by halves or RIR 0..10 (LOG-6).
  effort: [0, 10, false],
  rpe: [6, 10, false],
  rir: [0, 10, true],
  bodyWeight: [20, 400, false],
  // The value of a body entry in the doc, the body weight too; BODY-1 checks the weight at the edit.
  measure: [0, 1000, false],
  week: [0, 100, true],
  stallAfter: [2, 20, true],
  increment: [0.1, 100, false],
  bar: [0, 100, false],
  pct: [1, 150, false],
  pctReps: [1, 100, true],
  tm: [0, 1000, false],
  step: [0, 100, false],
  failAfter: [1, 10, true],
  deload: [0, 50, false],
};

export const DEFAULT_SETTINGS = Object.freeze({
  unit: 'kg',
  rest: 90,
  formula: 'epley',
  effort: 'none',
  plates: Object.freeze({ kg: Object.freeze([25, 20, 15, 10, 5, 2.5, 1.25]), lb: Object.freeze([45, 35, 25, 10, 5, 2.5]) }),
  bar: Object.freeze({ kg: 20, lb: 45 }),
  sex: null,
  measures: Object.freeze([]),
  stallAfter: 4,
});

// A new copy each time, so no doc shares a list of the defaults.
const defaultSettings = () => structuredClone(DEFAULT_SETTINGS);

export const emptyTraining = () => ({
  version: TRAINING_VERSION,
  settings: defaultSettings(),
  categories: [],
  exercises: [],
  routines: [],
  workouts: [],
  bodies: [],
  goals: [],
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
const optionalId = (value) => value === null || isId(value);
const oneOf = (list, value) => value === null || list.includes(value);
const uniqueIds = (list) => new Set(list.map((entry) => entry.id)).size === list.length;
const uniqueNames = (list) => new Set(list.map((entry) => entry.name.trim().toLowerCase())).size === list.length;

// TRN-7: plates per side, each more than 0 and up to MAX_PLATE.
const isPlates = (list) =>
  Array.isArray(list) && list.every((plate) => typeof plate === 'number' && Number.isFinite(plate) && plate > 0 && plate <= MAX_PLATE);

const cleanMeasure = (m) =>
  isObject(m) && isId(m.id) && m.id !== BODY_WEIGHT && isName(m.name) && MEASURE_UNITS.includes(m.unit)
    ? { id: m.id, name: m.name.trim(), unit: m.unit }
    : null;

// TRN-2: each setting that is not valid takes its default, alone.
const cleanSettings = (data) => {
  const settings = isObject(data) ? data : {};
  const defaults = defaultSettings();
  const pick = (valid, name) => (valid(settings[name]) ? settings[name] : defaults[name]);
  const measures = cleanList(settings.measures, cleanMeasure);
  return {
    unit: pick((value) => UNITS.includes(value), 'unit'),
    rest: pick((value) => inLimits('rest', value), 'rest'),
    formula: pick((value) => FORMULAS.includes(value), 'formula'),
    effort: pick((value) => EFFORTS.includes(value), 'effort'),
    plates: Object.fromEntries(UNITS.map((unit) => [unit, isPlates(settings.plates?.[unit]) ? [...settings.plates[unit]] : defaults.plates[unit]])),
    bar: Object.fromEntries(UNITS.map((unit) => [unit, inLimits('bar', settings.bar?.[unit]) ? settings.bar[unit] : defaults.bar[unit]])),
    sex: SEXES.includes(settings.sex) ? settings.sex : null,
    measures: measures && uniqueNames(measures) ? measures : [],
    stallAfter: pick((value) => inLimits('stallAfter', value), 'stallAfter'),
  };
};

// TRN-7: the working sets a week of a category, each end optional, the top at or above the bottom.
const cleanCategory = (c) => {
  if (!isObject(c) || !isId(c.id) || !isName(c.name)) return null;
  const weekMin = orNull(c.weekMin);
  const weekMax = orNull(c.weekMax);
  if (!optional('week', weekMin) || !optional('week', weekMax)) return null;
  if (weekMin !== null && weekMax !== null && weekMax < weekMin) return null;
  return { id: c.id, name: c.name.trim(), weekMin, weekMax };
};

const cleanExercise = (e) => {
  if (!isObject(e) || !isId(e.id) || !isName(e.name) || !TYPES.includes(e.type)) return null;
  const categoryId = orNull(e.categoryId);
  const rest = orNull(e.rest);
  const increment = orNull(e.increment);
  const bar = orNull(e.bar);
  const unit = orNull(e.unit);
  const equipment = orNull(e.equipment);
  const notes = e.notes ?? '';
  if (!optionalId(categoryId) || !optional('rest', rest)) return null;
  if (!optional('increment', increment) || !optional('bar', bar) || !oneOf(UNITS, unit) || !oneOf(EQUIPMENT, equipment)) return null;
  if (!isText(notes, MAX_COMMENT)) return null;
  return {
    id: e.id, name: e.name.trim(), categoryId, type: e.type, rest, archived: e.archived === true,
    increment, bar, unit, equipment, notes, unilateral: e.unilateral === true,
  };
};

// The optional targets of an item and of the snapshot of an entry (RT-1): a top needs reps at or below it.
const cleanTargets = (source) => {
  const targets = {};
  for (const [field, limit] of [['reps', 'reps'], ['repsMax', 'reps'], ['weight', 'weight'], ['rest', 'rest']]) {
    const value = orNull(source[field]);
    if (!optional(limit, value)) return null;
    targets[field] = value;
  }
  if (targets.repsMax !== null && (targets.reps === null || targets.repsMax < targets.reps)) return null;
  return targets;
};

const cleanRuleSet = (s) => {
  if (!isObject(s) || !inLimits('pct', s.pct) || !inLimits('pctReps', s.reps)) return null;
  const amrap = s.amrap ?? false;
  return typeof amrap === 'boolean' ? { pct: s.pct, reps: s.reps, amrap } : null;
};

const cleanWeek = (week) => {
  if (!Array.isArray(week) || week.length < 1 || week.length > MAX_RULE_SETS) return null;
  const sets = week.map(cleanRuleSet);
  return sets.includes(null) ? null : sets;
};

// TRN-7: the rule of progression of an item (PRG): `null` for none, `undefined` when it is not valid.
export const cleanRule = (r) => {
  if (r === null || r === undefined) return null;
  if (!isObject(r) || !RULE_TYPES.includes(r.type)) return undefined;
  if (r.type === 'percent') {
    if (!inLimits('tm', r.tm) || !UNITS.includes(r.unit) || !inLimits('step', r.step)) return undefined;
    if (!Array.isArray(r.weeks) || r.weeks.length < 1 || r.weeks.length > MAX_RULE_WEEKS) return undefined;
    const weeks = r.weeks.map(cleanWeek);
    return weeks.includes(null) ? undefined : { type: r.type, tm: r.tm, unit: r.unit, step: r.step, weeks };
  }
  const failAfter = r.failAfter ?? 3;
  const deload = r.deload ?? 10;
  if (!inLimits('failAfter', failAfter) || !inLimits('deload', deload)) return undefined;
  return { type: r.type, failAfter, deload };
};

const cleanItem = (i) => {
  if (!isObject(i) || !isId(i.id) || !isId(i.exerciseId) || !inLimits('sets', i.sets)) return null;
  const targets = cleanTargets(i);
  const rule = cleanRule(i.rule);
  if (!targets || rule === undefined) return null;
  return { id: i.id, exerciseId: i.exerciseId, sets: i.sets, ...targets, rule };
};

// TRN-7: weekdays are unique integers, 0 = Monday to 6 = Sunday.
const isWeekdays = (list) =>
  Array.isArray(list) && list.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) && new Set(list).size === list.length;

const cleanDay = (d) => {
  if (!isObject(d) || !isId(d.id) || !isName(d.name) || !Array.isArray(d.items)) return null;
  const weekdays = d.weekdays ?? [];
  if (!isWeekdays(weekdays)) return null;
  const items = d.items.map(cleanItem);
  if (items.includes(null) || !uniqueIds(items)) return null;
  return { id: d.id, name: d.name.trim(), weekdays: [...weekdays], items };
};

const cleanRoutine = (r) => {
  if (!isObject(r) || !isId(r.id) || !isName(r.name) || !isIso(r.created) || !Array.isArray(r.days)) return null;
  const days = r.days.map(cleanDay);
  if (days.includes(null) || !uniqueIds(days) || !uniqueNames(days)) return null;
  return { id: r.id, name: r.name.trim(), created: r.created, archived: r.archived === true, days };
};

// TRN-7: the effort of a set in the doc is 0 to 10 by halves; the scale of the settings is checked at the edit.
const isEffort = (value) => inLimits('effort', value) && Number.isInteger(value * 2);

const cleanSet = (s) => {
  if (!isObject(s) || !isId(s.id) || !UNITS.includes(s.unit)) return null;
  const set = { id: s.id };
  for (const [field, limit] of [['weight', 'load'], ['reps', 'reps'], ['seconds', 'seconds'], ['meters', 'meters']]) {
    const value = orNull(s[field]);
    if (!optional(limit, value)) return null;
    set[field] = value;
  }
  const comment = s.comment ?? '';
  const kind = s.kind ?? 'working';
  const effort = orNull(s.effort);
  const at = orNull(s.at);
  if (!isText(comment, MAX_COMMENT) || !SET_KINDS.includes(kind)) return null;
  if ((effort !== null && !isEffort(effort)) || (at !== null && !isIso(at))) return null;
  return { ...set, unit: s.unit, done: s.done === true, comment, kind, effort, at };
};

// RT-6: the targets of the item at the start of the workout.
const cleanTarget = (t) => {
  if (t === null || t === undefined) return null;
  if (!isObject(t) || !inLimits('sets', t.sets) || !UNITS.includes(t.unit)) return undefined;
  const targets = cleanTargets(t);
  if (!targets) return undefined;
  const { reps, repsMax, weight, rest } = targets;
  return { sets: t.sets, reps, repsMax, weight, unit: t.unit, rest };
};

const cleanEntry = (e) => {
  if (!isObject(e) || !isId(e.id) || !isId(e.exerciseId) || !Array.isArray(e.sets)) return null;
  const itemId = orNull(e.itemId);
  const group = orNull(e.group);
  const substituteFor = orNull(e.substituteFor);
  const target = cleanTarget(e.target);
  if (!optionalId(itemId) || !optionalId(group) || !optionalId(substituteFor) || target === undefined) return null;
  const sets = e.sets.map(cleanSet);
  if (sets.includes(null) || !uniqueIds(sets)) return null;
  return { id: e.id, exerciseId: e.exerciseId, sets, itemId, target, group, skipped: e.skipped === true, substituteFor };
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

// TRN-7: the body weight in kg or lb, a measure in its unit; a reference to a missing measure is valid (TRN-5).
const cleanBody = (b) => {
  if (!isObject(b) || !isId(b.id) || !isDate(b.date) || !isId(b.measure) || !inLimits('measure', b.value)) return null;
  if (!(b.measure === BODY_WEIGHT ? UNITS : MEASURE_UNITS).includes(b.unit)) return null;
  return { id: b.id, date: b.date, measure: b.measure, value: b.value, unit: b.unit };
};

// TRN-7: an exercise goal has an exercise and a metric (`set` with reps); a body goal has neither.
const cleanGoal = (g) => {
  if (!isObject(g) || !isId(g.id) || !GOAL_KINDS.includes(g.kind) || !isIso(g.created)) return null;
  if (!inLimits('weight', g.weight) || !UNITS.includes(g.unit)) return null;
  const exerciseId = orNull(g.exerciseId);
  const metric = orNull(g.metric);
  const reps = orNull(g.reps);
  const date = orNull(g.date);
  if (date !== null && !isDate(date)) return null;
  if (g.kind === 'exercise') {
    if (!isId(exerciseId) || !GOAL_METRICS.includes(metric)) return null;
    if (metric === 'set' ? !inLimits('reps', reps) : reps !== null) return null;
  } else if (exerciseId !== null || metric !== null || reps !== null) return null;
  return { id: g.id, kind: g.kind, exerciseId, metric, weight: g.weight, unit: g.unit, reps, date, created: g.created };
};

const cleanList = (list, clean) => {
  if (!Array.isArray(list)) return null;
  const out = list.map(clean);
  return out.includes(null) || !uniqueIds(out) ? null : out;
};

// TRN-2: version 1 has no body entries and no goals; each other new field reads as its default.
const migrate = (data) => (data.version === 1 ? { ...data, bodies: [], goals: [] } : data);

// TRN-2: true for a doc of a version that this app does not know yet (`error.backupNewer`).
export const isNewerTraining = (data) => isObject(data) && typeof data.version === 'number' && data.version > TRAINING_VERSION;

// TRN-2: a clean version 2 doc from a doc of version 1 or 2, or null. Add a migration when the version goes up.
export const normalizeTraining = (input) => {
  if (!isObject(input) || ![1, TRAINING_VERSION].includes(input.version)) return null;
  const data = migrate(input);
  const categories = cleanList(data.categories, cleanCategory);
  const exercises = cleanList(data.exercises, cleanExercise);
  const routines = cleanList(data.routines, cleanRoutine);
  const workouts = cleanList(data.workouts, cleanWorkout);
  const bodies = cleanList(data.bodies, cleanBody);
  const goals = cleanList(data.goals, cleanGoal);
  if (!categories || !exercises || !routines || !workouts || !bodies || !goals) return null;
  if (!uniqueNames(categories) || !uniqueNames(exercises) || !uniqueNames(routines)) return null;
  return { version: TRAINING_VERSION, settings: cleanSettings(data.settings), categories, exercises, routines, workouts, bodies, goals };
};
