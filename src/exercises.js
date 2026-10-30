import { TYPES, checkName, checkNumber, nameTaken, findById } from '#training';

// Categories and exercises (EX-1 to EX-6).

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

// The clean fields of an exercise, or an error. `rest` is optional: empty uses the default rest.
const checkExercise = (state, { name, categoryId = null, type, rest = null }, id = null) => {
  const { clean, error } = checkName(name);
  if (error) return { error };
  if (nameTaken(state.exercises, clean, id)) return { error: { key: 'error.exerciseTaken' } };
  if (!TYPES.includes(type)) return { error: { key: 'error.exerciseType' } };
  if (categoryId !== null && !findById(state.categories, categoryId)) return { error: { key: 'error.categoryMissing' } };
  const restValue = checkNumber('rest', rest, { optional: true });
  if (restValue.error) return { error: restValue.error };
  return { fields: { name: clean, categoryId, type, rest: restValue.value } };
};

export const addExercise = (state, input, id = crypto.randomUUID()) => {
  const { fields, error } = checkExercise(state, input);
  if (error) return { state, error };
  return { state: { ...state, exercises: [...state.exercises, { id, ...fields, archived: false }] } };
};

// EX-2: the type of an exercise that a workout holds does not change.
export const editExercise = (state, id, input) => {
  const exercise = findById(state.exercises, id);
  if (!exercise) return exerciseMissing(state);
  const { fields, error } = checkExercise(state, input, id);
  if (error) return { state, error };
  if (fields.type !== exercise.type && usedInWorkouts(state, id)) return { state, error: { key: 'error.typeLocked' } };
  return { state: { ...state, exercises: state.exercises.map((e) => (e.id === id ? { ...e, ...fields } : e)) } };
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
export const SEED_EXERCISES = [
  ['bench-press', 'chest', 'weight_reps'],
  ['incline-dumbbell-press', 'chest', 'weight_reps'],
  ['dumbbell-fly', 'chest', 'weight_reps'],
  ['push-up', 'chest', 'reps'],
  ['deadlift', 'back', 'weight_reps'],
  ['barbell-row', 'back', 'weight_reps'],
  ['pull-up', 'back', 'reps'],
  ['lat-pulldown', 'back', 'weight_reps'],
  ['seated-cable-row', 'back', 'weight_reps'],
  ['squat', 'legs', 'weight_reps'],
  ['romanian-deadlift', 'legs', 'weight_reps'],
  ['leg-press', 'legs', 'weight_reps'],
  ['lunge', 'legs', 'weight_reps'],
  ['leg-curl', 'legs', 'weight_reps'],
  ['leg-extension', 'legs', 'weight_reps'],
  ['calf-raise', 'legs', 'weight_reps'],
  ['overhead-press', 'shoulders', 'weight_reps'],
  ['lateral-raise', 'shoulders', 'weight_reps'],
  ['face-pull', 'shoulders', 'weight_reps'],
  ['barbell-curl', 'arms', 'weight_reps'],
  ['dumbbell-curl', 'arms', 'weight_reps'],
  ['triceps-pushdown', 'arms', 'weight_reps'],
  ['dip', 'arms', 'reps'],
  ['plank', 'core', 'time'],
  ['crunch', 'core', 'reps'],
  ['hanging-leg-raise', 'core', 'reps'],
  ['running', 'cardio', 'distance_time'],
  ['cycling', 'cardio', 'distance_time'],
  ['rowing', 'cardio', 'distance_time'],
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
  for (const [slug, category, type] of SEED_EXERCISES) {
    const id = seedExerciseId(slug);
    const name = nameOf(`seed.exercise.${slug}`);
    if (findById(exercises, id) || nameTaken(exercises, name)) continue;
    const categoryId = findById(categories, seedCategoryId(category)) ? seedCategoryId(category) : null;
    exercises.push({ id, name, categoryId, type, rest: null, archived: false });
  }
  return { state: { ...state, categories, exercises } };
};
