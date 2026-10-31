import { APP_SLUG } from '#config';
import { findById } from '#training';
import { clock, convert as convertWeight } from '#units';

// Restore by merge (DATA-3), the backup reminder (DATA-5) and the text of a workout (INT-1).

export const BACKUP_KEY = `${APP_SLUG}.backup`;
export const BACKUP_WORKOUTS = 10;
export const BACKUP_DAYS = 30;
const DAY_MS = 86400000;

const lower = (name) => name.trim().toLowerCase();

// The entities of `incoming` whose id `current` lacks. A name that another id holds is skipped:
// `byId` maps the id that is skipped to the id that holds the name.
const mergeNamed = (current, incoming) => {
  const ids = new Set(current.map((e) => e.id));
  const names = new Map(current.map((e) => [lower(e.name), e.id]));
  const added = [];
  const byId = new Map();
  let skipped = 0;
  for (const entity of incoming) {
    if (ids.has(entity.id)) continue;
    const holder = names.get(lower(entity.name));
    if (holder) {
      byId.set(entity.id, holder);
      skipped += 1;
    } else {
      added.push(entity);
      ids.add(entity.id);
      names.set(lower(entity.name), entity.id);
    }
  }
  return { added, byId, skipped };
};

const newById = (current, incoming) => {
  const ids = new Set(current.map((e) => e.id));
  return incoming.filter((e) => !ids.has(e.id));
};

// DATA-3: the references of an added entity to a skipped one point to the entity that holds the name.
export const mergeDocs = (current, incoming) => {
  const categories = mergeNamed(current.categories, incoming.categories);
  const exercises = mergeNamed(current.exercises, incoming.exercises.map((e) => ({
    ...e, categoryId: categories.byId.get(e.categoryId) ?? e.categoryId,
  })));
  const routines = mergeNamed(current.routines, incoming.routines);
  const exerciseOf = (id) => exercises.byId.get(id) ?? id;
  const addedRoutines = routines.added.map((routine) => ({
    ...routine,
    days: routine.days.map((day) => ({ ...day, items: day.items.map((item) => ({ ...item, exerciseId: exerciseOf(item.exerciseId) })) })),
  }));
  const workouts = newById(current.workouts, incoming.workouts).map((workout) => ({
    ...workout,
    entries: workout.entries.map((entry) => ({
      ...entry,
      exerciseId: exerciseOf(entry.exerciseId),
      substituteFor: entry.substituteFor === null ? null : exerciseOf(entry.substituteFor),
    })),
  }));
  const bodies = newById(current.bodies, incoming.bodies);
  const goals = newById(current.goals, incoming.goals).map((goal) => (
    goal.exerciseId === null ? goal : { ...goal, exerciseId: exerciseOf(goal.exerciseId) }
  ));
  return {
    state: {
      ...current,
      categories: [...current.categories, ...categories.added],
      exercises: [...current.exercises, ...exercises.added],
      routines: [...current.routines, ...addedRoutines],
      workouts: [...current.workouts, ...workouts],
      bodies: [...current.bodies, ...bodies],
      goals: [...current.goals, ...goals],
    },
    added: {
      categories: categories.added.length,
      exercises: exercises.added.length,
      routines: addedRoutines.length,
      workouts: workouts.length,
      bodies: bodies.length,
      goals: goals.length,
    },
    skipped: categories.skipped + exercises.skipped + routines.skipped,
  };
};

// DATA-5: the device key holds `{ lastExport (ISO), workoutsAtExport }`, or null when it is not valid.
export const normalizeBackupInfo = (data) => {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const { lastExport, workoutsAtExport } = data;
  if (typeof lastExport !== 'string' || Number.isNaN(Date.parse(lastExport))) return null;
  if (!Number.isInteger(workoutsAtExport) || workoutsAtExport < 0) return null;
  return { lastExport, workoutsAtExport };
};

// DATA-5: with no export yet, 10 finished workouts; else 10 more than at the export, or 30 days and
// at least one more. Never with no finished workout.
export const backupDue = (info, finishedCount, now) => {
  if (finishedCount <= 0) return false;
  const clean = normalizeBackupInfo(info);
  if (!clean) return finishedCount >= BACKUP_WORKOUTS;
  const since = finishedCount - clean.workoutsAtExport;
  if (since >= BACKUP_WORKOUTS) return true;
  return since >= 1 && now.getTime() - Date.parse(clean.lastExport) >= BACKUP_DAYS * DAY_MS;
};

const number = (value) => String(Math.round(value * 100) / 100);

const setText = (set) => {
  const parts = [];
  if (set.weight !== null) parts.push(`${number(set.weight)} ${set.unit}`);
  if (set.meters !== null) parts.push(`${number(set.meters)} m`);
  if (set.seconds !== null) parts.push(clock(set.seconds));
  if (set.reps !== null) parts.push(String(set.reps));
  return parts.join(' × ');
};

// INT-1: the title, the date and, for each exercise, one line for each done set. `unit` is the unit
// that a weight shows in; a set of another unit converts.
export const workoutText = (state, workoutId, t, unit) => {
  const workout = findById(state.workouts, workoutId);
  if (!workout) return '';
  const title = [workout.routineName, workout.dayName].filter(Boolean).join(' · ') || t('workout.free');
  const lines = [title, workout.date];
  for (const entry of workout.entries) {
    const sets = entry.sets.filter((s) => s.done);
    if (!sets.length) continue;
    lines.push('', findById(state.exercises, entry.exerciseId)?.name ?? '?');
    sets.forEach((set, index) => lines.push(`${index + 1}. ${setText(unit ? withUnit(set, unit) : set)}`));
  }
  if (workout.comment) lines.push('', workout.comment);
  return lines.join('\n');
};

const withUnit = (set, unit) => {
  if (set.weight === null || set.unit === unit) return set;
  return { ...set, weight: Math.round(convertWeight(set.weight, set.unit, unit) * 10) / 10, unit };
};
