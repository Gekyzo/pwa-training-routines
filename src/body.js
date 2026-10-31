import { BODY_WEIGHT, MEASURE_UNITS, checkName, checkNumber, findById, nameTaken } from '#training';
import { bestE1rm } from '#bests';
import { seedExerciseId } from '#exercises';
import { toKg } from '#units';

// The body log (BODY-1), the measures (BODY-2), the relative strength and the DOTS (BODY-3).

const uuid = () => crypto.randomUUID();
const bodyMissing = (state) => ({ state, error: { key: 'error.bodyMissing' } });
const measureMissing = (state) => ({ state, error: { key: 'error.measureMissing' } });

// A date `YYYY-MM-DD` that exists on the calendar, else `error.date`.
export const checkDate = (text) => {
  if (typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T00:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().startsWith(text)) return { value: text };
  }
  return { error: { key: 'error.date' } };
};

// BODY-1: the body weight of a date, `{ value, unit }`: the latest weight entry on or before it. Of two
// entries on one date the later one in the list wins. `null` when there is none.
export const bodyWeightOn = (state, date) => {
  let found = null;
  for (const entry of state.bodies) {
    if (entry.measure !== BODY_WEIGHT || entry.date > date) continue;
    if (!found || entry.date >= found.date) found = entry;
  }
  return found ? { value: found.value, unit: found.unit } : null;
};

const cleanValue = (measure, value) => checkNumber(measure === BODY_WEIGHT ? 'bodyWeight' : 'measure', value);

// BODY-1: an entry of the weight (in the unit of the settings) or of a measure (in its unit).
export const addBodyEntry = (state, { date, measure, value }, id = uuid()) => {
  const day = checkDate(date);
  if (day.error) return { state, error: day.error };
  const found = measure === BODY_WEIGHT ? null : findById(state.settings.measures, measure);
  if (measure !== BODY_WEIGHT && !found) return measureMissing(state);
  const number = cleanValue(measure, value);
  if (number.error) return { state, error: number.error };
  const unit = found ? found.unit : state.settings.unit;
  return { state: { ...state, bodies: [...state.bodies, { id, date: day.value, measure, value: number.value, unit }] } };
};

// BODY-1: the date and the value change; the measure and the unit stay.
export const editBodyEntry = (state, id, { date, value }) => {
  const entry = findById(state.bodies, id);
  if (!entry) return bodyMissing(state);
  const day = checkDate(date);
  if (day.error) return { state, error: day.error };
  const number = cleanValue(entry.measure, value);
  if (number.error) return { state, error: number.error };
  return { state: { ...state, bodies: state.bodies.map((b) => (b.id === id ? { ...b, date: day.value, value: number.value } : b)) } };
};

export const deleteBodyEntry = (state, id) => {
  if (!findById(state.bodies, id)) return bodyMissing(state);
  return { state: { ...state, bodies: state.bodies.filter((b) => b.id !== id) } };
};

// BODY-1: the entries of a measure, oldest first; of one date, the order of the list.
export const bodySeries = (state, measure) =>
  state.bodies.filter((b) => b.measure === measure).map((b, index) => ({ b, index }))
    .sort((x, y) => (x.b.date === y.b.date ? x.index - y.index : x.b.date < y.b.date ? -1 : 1)).map(({ b }) => b);

// ---- Measures (BODY-2) ----

const measureUsed = (state, id) => state.bodies.some((b) => b.measure === id);

const cleanMeasureInput = (state, { name, unit }, id = null) => {
  const checked = checkName(name);
  if (checked.error) return { error: checked.error };
  if (nameTaken(state.settings.measures, checked.clean, id)) return { error: { key: 'error.measureTaken' } };
  if (!MEASURE_UNITS.includes(unit)) return { error: { key: 'error.unit' } };
  return { clean: { name: checked.clean, unit } };
};

const withMeasures = (state, measures) => ({ ...state, settings: { ...state.settings, measures } });

export const addMeasure = (state, input, id = uuid()) => {
  const { clean, error } = cleanMeasureInput(state, input);
  if (error) return { state, error };
  return { state: withMeasures(state, [...state.settings.measures, { id, ...clean }]) };
};

// BODY-2: the unit of a measure with entries stays.
export const editMeasure = (state, id, input) => {
  const found = findById(state.settings.measures, id);
  if (!found) return measureMissing(state);
  const { clean, error } = cleanMeasureInput(state, input, id);
  if (error) return { state, error };
  if (clean.unit !== found.unit && measureUsed(state, id)) return { state, error: { key: 'error.measureInUse' } };
  return { state: withMeasures(state, state.settings.measures.map((m) => (m.id === id ? { ...m, ...clean } : m))) };
};

// BODY-2: a measure with entries stays.
export const deleteMeasure = (state, id) => {
  if (!findById(state.settings.measures, id)) return measureMissing(state);
  if (measureUsed(state, id)) return { state, error: { key: 'error.measureInUse' } };
  return { state: withMeasures(state, state.settings.measures.filter((m) => m.id !== id)) };
};

// ---- Relative strength and DOTS (BODY-3) ----

const bodyKg = (state, date) => {
  const body = bodyWeightOn(state, date);
  return body ? toKg(body.value, body.unit) : null;
};

// BODY-3: the best e1RM of an exercise ÷ the body weight of the date (both in kg), or `null`.
export const relativeStrength = (state, exerciseId, date) => {
  const best = bestE1rm(state, exerciseId);
  const body = bodyKg(state, date);
  return best && body ? best.value / body : null;
};

// The DOTS polynomial of the body weight in kg: a + b·x + c·x² + d·x³ + e·x⁴.
const DOTS_COEFFICIENTS = {
  male: [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093],
  female: [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706],
};
const DOTS_LIFTS = ['squat', 'bench-press', 'deadlift'].map(seedExerciseId);

// BODY-3: DOTS = total × 500 ÷ polynomial(body weight), the total being the best e1RMs of the squat, the
// bench press and the deadlift. `null` with no sex, no body weight or a lift with no e1RM.
export const dots = (state, date) => {
  const coefficients = DOTS_COEFFICIENTS[state.settings.sex];
  const body = bodyKg(state, date);
  if (!coefficients || !body) return null;
  const bests = DOTS_LIFTS.map((id) => bestE1rm(state, id));
  if (bests.includes(null)) return null;
  const total = bests.reduce((sum, best) => sum + best.value, 0);
  const divisor = coefficients.reduce((sum, c, power) => sum + c * body ** power, 0);
  return (total * 500) / divisor;
};
