import { MAX_NAME, findById } from '#training';

// DATA-4: the FitNotes CSV: the parse, the preview and the apply.

const FORMAT_ERROR = { error: 'error.fitnotesFormat' };
const METERS = { m: 1, km: 1000, mi: 1609.344, ft: 0.3048, yd: 0.9144 };
const WEIGHT_UNITS = { kg: 'kg', kgs: 'kg', lb: 'lb', lbs: 'lb' };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// RFC 4180: quoted fields, doubled quotes, any line break inside a quote, CRLF, a BOM.
const parseCsv = (input) => {
  const text = input.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') value += char;
      else if (text[i + 1] === '"') { value += '"'; i += 1; } else quoted = false;
    } else if (char === '"' && value === '') quoted = true;
    else if (char === ',') { row.push(value); value = ''; } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(value); rows.push(row); row = []; value = '';
    } else value += char;
  }
  if (value !== '' || row.length) { row.push(value); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
};

const toNumber = (text) => {
  const clean = String(text ?? '').trim().replace(',', '.');
  if (clean === '') return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

// `h:mm:ss`, `m:ss` or seconds.
const toSeconds = (text) => {
  const clean = String(text ?? '').trim();
  if (clean === '') return null;
  const parts = clean.split(':').map(Number);
  if (parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) return NaN;
  return Math.round(parts.reduce((total, p) => total * 60 + p, 0));
};

const toMeters = (text, unit) => {
  const n = toNumber(text);
  if (n === null || Number.isNaN(n)) return n;
  return Math.round(n * (METERS[unit] ?? 1) * 100) / 100;
};

// { rows } with { date, exercise, category, weight, unit, reps, meters, seconds, comment }, or an error.
export const parseFitNotes = (text) => {
  const table = parseCsv(String(text ?? ''));
  if (!table.length) return FORMAT_ERROR;
  const header = table[0].map((h) => h.trim().toLowerCase());
  const at = (name) => header.indexOf(name);
  const weightAt = ['weight (kgs)', 'weight (lbs)', 'weight'].map(at).find((i) => i >= 0) ?? -1;
  const headerUnit = header.includes('weight (lbs)') ? 'lb' : header.includes('weight (kgs)') ? 'kg' : null;
  const [date, exercise, category, unitAt, reps, distance, distanceUnit, time, comment] =
    ['date', 'exercise', 'category', 'weight unit', 'reps', 'distance', 'distance unit', 'time', 'comment'].map(at);
  if (date < 0 || exercise < 0 || weightAt < 0 || reps < 0) return FORMAT_ERROR;
  const rows = [];
  for (const cells of table.slice(1)) {
    const cell = (i) => (i >= 0 ? cells[i] ?? '' : '');
    const day = cell(date).trim();
    const name = cell(exercise).trim();
    if (!DATE.test(day) || !name) continue;
    const weight = toNumber(cell(weightAt));
    const count = toNumber(cell(reps));
    const meters = toMeters(cell(distance), cell(distanceUnit).trim().toLowerCase());
    const seconds = toSeconds(cell(time));
    if ([weight, count, meters, seconds].some(Number.isNaN)) continue;
    const unit = headerUnit ?? WEIGHT_UNITS[cell(unitAt).trim().toLowerCase()] ?? null;
    rows.push({
      date: day, exercise: name, category: cell(category).trim(), weight, unit, reps: count === null ? null : Math.round(count),
      meters, seconds, comment: cell(comment).trim(),
    });
  }
  return { rows };
};

// EX-2: the type from the columns that the rows of an exercise fill. A weight of zero is no weight.
const typeOf = (rows) => {
  const has = (key) => rows.some((r) => (key === 'weight' ? r.weight > 0 : r[key] !== null && r[key] !== 0));
  const [weight, reps, meters, seconds] = [has('weight'), has('reps'), has('meters'), has('seconds')];
  if (weight && seconds) return 'weight_time';
  if (weight && meters && !reps) return 'weight_distance';
  if (meters) return 'distance_time';
  if (seconds && !reps) return 'time';
  if (weight) return 'weight_reps';
  if (reps) return 'reps';
  return seconds ? 'time' : 'weight_reps';
};

const workoutId = (date) => `fitnotes-${date}`;

// The rows of the dates that the doc does not hold yet, grouped by exercise (a name has no case).
const plan = (state, rows) => {
  const held = new Set(state.workouts.map((w) => w.id));
  const skippedDates = [...new Set(rows.map((r) => r.date))].filter((d) => held.has(workoutId(d))).sort();
  const fresh = rows.filter((r) => !held.has(workoutId(r.date)));
  const groups = new Map();
  for (const row of fresh) {
    const key = row.exercise.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name: row.exercise, category: row.category, rows: [] });
    groups.get(key).rows.push(row);
  }
  return { fresh, skippedDates, groups: [...groups.values()].map((g) => ({ ...g, type: typeOf(g.rows) })) };
};

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const existingOf = (state, name) => state.exercises.find((e) => sameName(e.name, name)) ?? null;

export const previewImport = (state, rows) => {
  const { fresh, skippedDates, groups } = plan(state, rows);
  const newExercises = [];
  const conflicts = [];
  for (const group of groups) {
    const existing = existingOf(state, group.name);
    if (!existing) newExercises.push({ name: group.name, category: group.category, type: group.type });
    else if (existing.type !== group.type) conflicts.push({ name: group.name, type: group.type, existingType: existing.type });
  }
  const known = new Set(state.categories.map((c) => c.name.toLowerCase()));
  const newCategories = [];
  for (const { category } of newExercises) {
    if (category && !known.has(category.toLowerCase())) {
      known.add(category.toLowerCase());
      newCategories.push(category);
    }
  }
  return {
    workouts: new Set(fresh.map((r) => r.date)).size, sets: fresh.length, newExercises, newCategories, conflicts, skippedDates,
  };
};

// `<name> (2)`, else (3) and so on: the first name that no exercise holds, within the limit of a name.
const freeName = (exercises, name) => {
  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`;
    const candidate = `${name.slice(0, MAX_NAME - suffix.length).trimEnd()}${suffix}`;
    if (!exercises.some((e) => sameName(e.name, candidate))) return candidate;
  }
};

// `mapping[name]` is an existing exercise id, or 'create'. A name with no mapping that has no clash is
// created; a clash with no mapping is created with the name plus ` (2)`.
export const applyImport = (state, rows, mapping, newId = () => crypto.randomUUID()) => {
  const { fresh, groups } = plan(state, rows);
  let next = state;
  let exercisesAdded = 0;
  let categoriesAdded = 0;
  const idOf = new Map();
  for (const group of groups) {
    const choice = mapping?.[group.name];
    const mapped = choice && choice !== 'create' ? findById(next.exercises, choice) : null;
    const existing = existingOf(next, group.name);
    if (mapped) { idOf.set(group.name.toLowerCase(), mapped.id); continue; }
    if (existing && choice !== 'create' && existing.type === group.type) { idOf.set(group.name.toLowerCase(), existing.id); continue; }
    let categoryId = null;
    if (group.category) {
      const found = next.categories.find((c) => sameName(c.name, group.category));
      if (found) categoryId = found.id;
      else {
        categoryId = newId();
        next = { ...next, categories: [...next.categories, { id: categoryId, name: group.category.slice(0, MAX_NAME) }] };
        categoriesAdded += 1;
      }
    }
    const name = existing ? freeName(next.exercises, group.name) : group.name.slice(0, MAX_NAME);
    const id = newId();
    next = {
      ...next,
      exercises: [...next.exercises, {
        id, name, categoryId, type: group.type, rest: null, increment: null, bar: null, unit: null, equipment: null,
        notes: '', unilateral: false, archived: false,
      }],
    };
    idOf.set(group.name.toLowerCase(), id);
    exercisesAdded += 1;
  }
  const byDate = new Map();
  for (const row of fresh) {
    if (!byDate.has(row.date)) byDate.set(row.date, new Map());
    const entries = byDate.get(row.date);
    if (!entries.has(row.exercise.toLowerCase())) entries.set(row.exercise.toLowerCase(), []);
    entries.get(row.exercise.toLowerCase()).push(row);
  }
  const workouts = [...byDate].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, entries]) => {
    const stamp = `${date}T12:00:00.000Z`;
    return {
      id: workoutId(date), date, started: stamp, finished: stamp, routineId: null, dayId: null,
      routineName: '', dayName: '', comment: '',
      entries: [...entries].map(([key, list]) => ({
        id: newId(), exerciseId: idOf.get(key), itemId: null, target: null, group: null, skipped: false, substituteFor: null,
        sets: list.map((r) => ({
          id: newId(), weight: r.weight, unit: r.unit ?? state.settings.unit, reps: r.reps, seconds: r.seconds, meters: r.meters,
          done: true, comment: r.comment, kind: 'working', effort: null, at: null,
        })),
      })),
    };
  });
  next = { ...next, workouts: [...next.workouts, ...workouts] };
  return { state: next, added: { workouts: workouts.length, sets: fresh.length, exercises: exercisesAdded, categories: categoriesAdded } };
};
