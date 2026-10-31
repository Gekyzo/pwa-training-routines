import { TYPES, EQUIPMENT, checkName, checkNumber, checkComment, nameTaken, findById } from '#training';
import { shownWeight } from '#units';

// Categories and exercises (EX-1 to EX-8).

const categoryMissing = (state) => ({ state, error: { key: 'error.categoryMissing' } });
const exerciseMissing = (state) => ({ state, error: { key: 'error.exerciseMissing' } });

const usedInWorkouts = (state, exerciseId) =>
  state.workouts.some((workout) => workout.entries.some((entry) => entry.exerciseId === exerciseId));
const usedInRoutines = (state, exerciseId) =>
  state.routines.some((routine) => routine.days.some((day) => day.items.some((item) => item.exerciseId === exerciseId)));

const checkCategoryName = (state, name, id = null) => {
  const { clean, error } = checkName(name);
  if (error) return { error };
  if (nameTaken(state.categories, clean, id)) return { error: { key: 'error.categoryTaken' } };
  return { clean };
};

export const addCategory = (state, name, id = crypto.randomUUID()) => {
  const { clean, error } = checkCategoryName(state, name);
  if (error) return { state, error };
  return { state: { ...state, categories: [...state.categories, { id, name: clean }] } };
};

export const editCategory = (state, id, name) => {
  if (!findById(state.categories, id)) return categoryMissing(state);
  const { clean, error } = checkCategoryName(state, name, id);
  if (error) return { state, error };
  return { state: { ...state, categories: state.categories.map((c) => (c.id === id ? { ...c, name: clean } : c)) } };
};

// EX-3: a category that an exercise uses stays.
export const deleteCategory = (state, id) => {
  if (!findById(state.categories, id)) return categoryMissing(state);
  if (state.exercises.some((exercise) => exercise.categoryId === id)) return { state, error: { key: 'error.categoryInUse' } };
  return { state: { ...state, categories: state.categories.filter((c) => c.id !== id) } };
};

// The clean fields of an exercise, or an error. `rest`, `increment` and `bar` are optional: empty uses
// the default of the settings. On an edit (`current` given) a field that `input` leaves out keeps its value.
// EX-5: `unit` is the unit of the settings whenever the input names an increment or a bar.
const checkExercise = (state, input, id = null, current = null) => {
  const pick = (key, fallback) => (key in input ? input[key] : current?.[key] ?? fallback);
  const { name, type } = input;
  const { clean, error } = checkName(name);
  if (error) return { error };
  if (nameTaken(state.exercises, clean, id)) return { error: { key: 'error.exerciseTaken' } };
  if (!TYPES.includes(type)) return { error: { key: 'error.exerciseType' } };
  const categoryId = pick('categoryId', null);
  if (categoryId !== null && !findById(state.categories, categoryId)) return { error: { key: 'error.categoryMissing' } };
  const numbers = {};
  for (const key of ['rest', 'increment', 'bar']) {
    const result = checkNumber(key, pick(key, null), { optional: true });
    if (result.error) return { error: result.error };
    numbers[key] = result.value;
  }
  const equipment = pick('equipment', null);
  if (equipment !== null && !EQUIPMENT.includes(equipment)) return { error: { key: 'error.equipment' } };
  const notes = checkComment(pick('notes', ''));
  if (notes.error) return { error: notes.error };
  const unit = 'increment' in input || 'bar' in input
    ? (numbers.increment !== null || numbers.bar !== null ? state.settings.unit : null)
    : current?.unit ?? null;
  return {
    fields: {
      name: clean, categoryId, type, ...numbers, unit, equipment, notes: notes.clean, unilateral: pick('unilateral', false) === true,
    },
  };
};

// EX-9: the increment and the bar of an exercise as the sheet shows them, in `unit`, one decimal;
// '' when unset.
export const defaultsText = (exercise, unit) => {
  const text = (key) => {
    const value = exercise?.[key] ?? null;
    return value === null ? '' : String(shownWeight(value, exercise.unit ?? unit, unit));
  };
  return { increment: text('increment'), bar: text('bar') };
};

// EX-9: the increment and the bar to send from the sheet. On an edit (`editing`), when both texts are
// as shown they are left out, so that they keep their own unit; else both go, in the unit of the
// settings (EX-5).
export const defaultsInput = (shown, values, editing) =>
  editing && values.increment === shown.increment && values.bar === shown.bar ? {} : { increment: values.increment, bar: values.bar };

export const addExercise = (state, input, id = crypto.randomUUID()) => {
  const { fields, error } = checkExercise(state, input);
  if (error) return { state, error };
  return { state: { ...state, exercises: [...state.exercises, { id, ...fields, archived: false }] } };
};

// EX-2: the type of an exercise that a workout holds does not change.
export const editExercise = (state, id, input) => {
  const exercise = findById(state.exercises, id);
  if (!exercise) return exerciseMissing(state);
  const { fields, error } = checkExercise(state, input, id, exercise);
  if (error) return { state, error };
  if (fields.type !== exercise.type && usedInWorkouts(state, id)) return { state, error: { key: 'error.typeLocked' } };
  return { state: { ...state, exercises: state.exercises.map((e) => (e.id === id ? { ...e, ...fields } : e)) } };
};

// EX-7: moves the entries, the routine items and the goals of `dropId` to `keepId`, then removes
// `dropId`. The types must match (`error.typeMismatch`); the same id twice is `error.mergeSame`.
// The records need no work: they derive from the entries (PR-1).
export const mergeExercises = (state, keepId, dropId) => {
  if (!findById(state.exercises, keepId) || !findById(state.exercises, dropId)) return exerciseMissing(state);
  if (keepId === dropId) return { state, error: { key: 'error.mergeSame' } };
  if (findById(state.exercises, keepId).type !== findById(state.exercises, dropId).type) {
    return { state, error: { key: 'error.typeMismatch' } };
  }
  const move = (value) => (value === dropId ? keepId : value);
  return {
    state: {
      ...state,
      exercises: state.exercises.filter((e) => e.id !== dropId),
      routines: state.routines.map((routine) => ({
        ...routine,
        days: routine.days.map((day) => ({ ...day, items: day.items.map((item) => ({ ...item, exerciseId: move(item.exerciseId) })) })),
      })),
      workouts: state.workouts.map((workout) => ({
        ...workout,
        entries: workout.entries.map((entry) => ({
          ...entry,
          exerciseId: move(entry.exerciseId),
          ...('substituteFor' in entry ? { substituteFor: move(entry.substituteFor) } : {}),
        })),
      })),
      goals: state.goals.map((goal) => ({ ...goal, exerciseId: move(goal.exerciseId) })),
    },
  };
};

// EX-6: an exercise with history is archived, not deleted; one in a routine leaves the routine first.
export const deleteExercise = (state, id) => {
  if (!findById(state.exercises, id)) return exerciseMissing(state);
  if (usedInWorkouts(state, id)) return { state, error: { key: 'error.exerciseInUse' } };
  if (usedInRoutines(state, id)) return { state, error: { key: 'error.exerciseInRoutine' } };
  return { state: { ...state, exercises: state.exercises.filter((e) => e.id !== id) } };
};

export const archiveExercise = (state, id, archived = true) => {
  if (!findById(state.exercises, id)) return exerciseMissing(state);
  return { state: { ...state, exercises: state.exercises.map((e) => (e.id === id ? { ...e, archived } : e)) } };
};

export const canDeleteExercise = (state, id) => !usedInWorkouts(state, id) && !usedInRoutines(state, id);

// EX-4: the common exercises. Fixed ids, so two devices that add them make no duplicate after a sync.
export const SEED_CATEGORIES = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio'];
// [slug, category, type, equipment]
export const SEED_EXERCISES = [
  ['bench-press', 'chest', 'weight_reps', 'barbell'],
  ['incline-dumbbell-press', 'chest', 'weight_reps', 'dumbbell'],
  ['dumbbell-fly', 'chest', 'weight_reps', 'dumbbell'],
  ['push-up', 'chest', 'reps', 'bodyweight'],
  ['deadlift', 'back', 'weight_reps', 'barbell'],
  ['barbell-row', 'back', 'weight_reps', 'barbell'],
  ['pull-up', 'back', 'reps', 'bodyweight'],
  ['lat-pulldown', 'back', 'weight_reps', 'cable'],
  ['seated-cable-row', 'back', 'weight_reps', 'cable'],
  ['squat', 'legs', 'weight_reps', 'barbell'],
  ['romanian-deadlift', 'legs', 'weight_reps', 'barbell'],
  ['leg-press', 'legs', 'weight_reps', 'machine'],
  ['lunge', 'legs', 'weight_reps', 'dumbbell'],
  ['leg-curl', 'legs', 'weight_reps', 'machine'],
  ['leg-extension', 'legs', 'weight_reps', 'machine'],
  ['calf-raise', 'legs', 'weight_reps', 'machine'],
  ['overhead-press', 'shoulders', 'weight_reps', 'barbell'],
  ['lateral-raise', 'shoulders', 'weight_reps', 'dumbbell'],
  ['face-pull', 'shoulders', 'weight_reps', 'cable'],
  ['barbell-curl', 'arms', 'weight_reps', 'barbell'],
  ['dumbbell-curl', 'arms', 'weight_reps', 'dumbbell'],
  ['triceps-pushdown', 'arms', 'weight_reps', 'cable'],
  ['dip', 'arms', 'reps', 'bodyweight'],
  ['plank', 'core', 'time', 'bodyweight'],
  ['crunch', 'core', 'reps', 'bodyweight'],
  ['hanging-leg-raise', 'core', 'reps', 'bodyweight'],
  ['running', 'cardio', 'distance_time', 'other'],
  ['cycling', 'cardio', 'distance_time', 'machine'],
  ['rowing', 'cardio', 'distance_time', 'machine'],
];

export const seedCategoryId = (slug) => `seed-cat-${slug}`;
export const seedExerciseId = (slug) => `seed-${slug}`;

// `nameOf(key)` gives the name of `seed.category.<slug>` or `seed.exercise.<slug>` in the language of
// the user. A seed whose id is in the doc, or whose name another entry has, is skipped.
export const seedExercises = (state, nameOf) => {
  const categories = [...state.categories];
  for (const slug of SEED_CATEGORIES) {
    const id = seedCategoryId(slug);
    const name = nameOf(`seed.category.${slug}`);
    if (!findById(categories, id) && !nameTaken(categories, name)) categories.push({ id, name });
  }
  const exercises = [...state.exercises];
  for (const [slug, category, type, equipment] of SEED_EXERCISES) {
    const id = seedExerciseId(slug);
    const name = nameOf(`seed.exercise.${slug}`);
    if (findById(exercises, id) || nameTaken(exercises, name)) continue;
    const categoryId = findById(categories, seedCategoryId(category)) ? seedCategoryId(category) : null;
    exercises.push({
      id, name, categoryId, type, rest: null, archived: false,
      increment: null, bar: null, unit: null, equipment, notes: '', unilateral: false,
    });
  }
  return { state: { ...state, categories, exercises } };
};
