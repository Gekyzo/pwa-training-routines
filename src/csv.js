import { findById } from '#training';
import { clock } from '#units';

// DATA-2: the done sets as CSV, oldest first, one row for each set. The columns take the names of
// the FitNotes export where it has one.
export const COLUMNS = ['Date', 'Exercise', 'Category', 'Weight', 'Weight Unit', 'Reps', 'Distance', 'Distance Unit', 'Time', 'Comment'];

// RFC 4180: a field with a comma, a quote or a line break is quoted, and its quotes doubled.
const field = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

// `unknown` names an exercise that the doc does not hold (TRN-5).
export const toCsv = (state, { unknown = '' } = {}) => {
  const workouts = [...state.workouts].sort((a, b) => (a.date === b.date ? (a.started < b.started ? -1 : 1) : a.date < b.date ? -1 : 1));
  const rows = [COLUMNS];
  for (const workout of workouts) {
    for (const entry of workout.entries) {
      const exercise = findById(state.exercises, entry.exerciseId);
      const category = exercise ? findById(state.categories, exercise.categoryId) : null;
      for (const set of entry.sets.filter((s) => s.done)) {
        rows.push([
          workout.date,
          exercise?.name ?? unknown,
          category?.name ?? '',
          set.weight,
          set.weight === null ? '' : set.unit,
          set.reps,
          set.meters,
          set.meters === null ? '' : 'm',
          set.seconds === null ? '' : clock(set.seconds),
          set.comment,
        ]);
      }
    }
  }
  return `${rows.map((row) => row.map(field).join(',')).join('\r\n')}\r\n`;
};

// The name of the JSON export (`exportFilename` of storage) with the extension of a CSV.
export const csvFilename = (jsonName) => jsonName.replace(/\.json$/, '.csv');
