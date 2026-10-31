// The Workout section: the start (the next day of each routine, an empty workout, the past
// workouts), and the open or past workout with its sets (RT-3, WO-1 to WO-8).
import { FIELDS, findById, sortedRoutines, sortedExercises, sortedWorkouts } from '#training';
import {
  openWorkout,
  startWorkout,
  startFromDay,
  nextDay,
  addEntry,
  addSet,
  editSet,
  markDone,
  deleteSet,
  deleteEntry,
  setWorkoutComment,
  setWorkoutDate,
  finishWorkout,
  deleteWorkout,
} from '#workouts';
import { restFor } from '#timer';
import { shownWeight } from '#units';
import { $, el, ui, state, t, apply, render, showToast } from '#ui/context';
import { icon } from '#ui/controls';
import { openSheet, closeSheet } from '#ui/sheet';
import { openExerciseSheet } from '#ui/exercises';
import { startRest, stop as stopRest, renderTimer } from '#ui/timer';
import { exerciseName, typeOf, dateText } from '#ui/format';

// The workout in view: a past one that the user opened, else the open one, else none.
const current = () => (ui.workoutId ? findById(state.workouts, ui.workoutId) : null) ?? openWorkout(state);

const start = (result) => {
  if (apply(result)) ui.workoutId = null;
};

// The name of a workout: its routine and day, or Free workout.
const titleOf = (workout) => (workout.routineName ? `${workout.routineName} · ${workout.dayName}` : t('workout.free'));

const PLACEHOLDER = { reps: 'set.repsShort', seconds: 'set.seconds', meters: 'set.meters' };

// One box of a set. The value is shown in the unit of the settings (PR-8); the edit stores it so.
const fieldInput = (workout, entry, set, field) => {
  const value = field === 'weight' ? shownWeight(set.weight, set.unit, state.settings.unit) : set[field];
  const input = el('input', {
    className: 'input set-row-input',
    type: 'text',
    inputMode: field === 'weight' || field === 'meters' ? 'decimal' : 'numeric',
    value: value ?? '',
    placeholder: field === 'weight' ? state.settings.unit : t(PLACEHOLDER[field]),
    onchange: (event) => apply(editSet(state, workout.id, entry.id, set.id, { [field]: event.target.value })),
  });
  input.dataset.key = `${set.id}:${field}`;
  input.setAttribute('aria-label', t(`set.${field}`));
  return input;
};

// WO-5: a done set starts the rest timer of its exercise, in the open workout only (TMR-1, TMR-2).
const toggleDone = (workout, entry, set, done) => {
  if (!apply(markDone(state, workout.id, entry.id, set.id, done, new Date()))) {
    render();
    return;
  }
  if (done && workout.finished === null) startRest(restFor(state, workout, entry.exerciseId));
};

const setRow = (workout, entry, set, index) => {
  const type = typeOf(entry.exerciseId);
  const check = el('input', { className: 'item-row-check', type: 'checkbox', checked: set.done, onchange: (event) => toggleDone(workout, entry, set, event.target.checked) });
  check.setAttribute('aria-label', t('set.done', { n: index + 1 }));
  check.dataset.key = `${set.id}:done`;
  const remove = el('button', { className: 'button icon', type: 'button', onclick: () => apply(deleteSet(state, workout.id, entry.id, set.id)) }, [icon('trash')]);
  remove.setAttribute('aria-label', t('set.delete', { n: index + 1 }));
  return el('li', { className: set.done ? 'item-row done' : 'item-row' }, [
    el('div', { className: 'item-row-body set-row' }, [
      check,
      el('span', { className: 'set-row-index', textContent: String(index + 1) }),
      ...FIELDS[type].map((field) => fieldInput(workout, entry, set, field)),
      el('div', { className: 'item-row-end' }, [remove]),
    ]),
  ]);
};

const entryNodes = (workout, entry) => [
  el('li', { className: 'group-head' }, [el('span', { textContent: exerciseName(entry.exerciseId) }), el('span', { textContent: String(entry.sets.filter((s) => s.done).length) + '/' + entry.sets.length })]),
  ...entry.sets.map((set, index) => setRow(workout, entry, set, index)),
  el('li', { className: 'workout-actions' }, [
    el('button', { className: 'button tonal', type: 'button', textContent: t('workout.addSet'), onclick: () => apply(addSet(state, workout.id, entry.id)) }),
    el('button', { className: 'button outline danger', type: 'button', textContent: t('workout.removeExercise'), onclick: () => apply(deleteEntry(state, workout.id, entry.id), { undoText: t('toast.entryRemoved') }) }),
  ]),
];

// WO-3: a picker of the exercises that are not archived, and New exercise.
const pickExercise = (workout) => {
  const add = (exerciseId) => apply(addEntry(state, workout.id, exerciseId));
  const rows = sortedExercises(state)
    .filter((e) => !e.archived)
    .map((e) => el('li', {}, [el('button', { className: 'list-row', type: 'button', onclick: () => add(e.id) && closeSheet() }, [el('span', { className: 'list-row-text', textContent: e.name })])]));
  const create = el('li', {}, [el('button', { className: 'list-row accent', type: 'button', textContent: t('exercises.new'), onclick: () => openExerciseSheet(null, { onAdded: add }) })]);
  openSheet({ title: t('workout.addExercise'), body: [el('ul', { className: 'list-group plain' }, [create, ...rows])] });
};

const startNodes = () =>
  sortedRoutines(state)
    .map((routine) => [routine, nextDay(state, routine.id)])
    .filter(([, day]) => day?.items.length)
    .map(([routine, day]) => el('button', { className: 'list-row', type: 'button', onclick: () => start(startFromDay(state, routine.id, day.id, new Date())) }, [
      el('span', { className: 'list-row-text', textContent: routine.name }),
      el('span', { className: 'list-row-meta', textContent: t('workout.day', { day: day.name }) }),
    ]));

const historyRow = (workout) => {
  const sets = workout.entries.reduce((sum, e) => sum + e.sets.filter((s) => s.done).length, 0);
  const meta = [titleOf(workout), t('workout.summary', { exercises: workout.entries.length, sets })].join(' · ');
  return el('li', { className: 'item-row' }, [el('div', { className: 'item-row-body' }, [
    el('button', { className: 'item-row-name', type: 'button', onclick: () => {
      ui.workoutId = workout.id;
      render();
    } }, [el('span', { className: 'item-row-label', textContent: dateText(workout.date) }), el('small', { className: 'item-row-meta', textContent: meta })]),
  ])]);
};

// The box that had the focus before a render gets it back, so that typing goes on to the next box.
const keepFocus = (build) => {
  const key = document.activeElement?.dataset?.key;
  build();
  if (key) $('workout-entries').querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
};

export const renderWorkout = () => {
  $('workout').hidden = ui.view !== 'workout';
  if (ui.view !== 'workout') return;
  const workout = current();
  if (ui.workoutId && !workout) ui.workoutId = null;
  $('workout-start').hidden = Boolean(workout);
  $('workout-open').hidden = !workout;
  if (!workout) {
    const routines = startNodes();
    $('workout-routines').replaceChildren(...routines);
    $('workout-routines').hidden = !routines.length;
    $('workout-routines-head').hidden = !routines.length;
    const past = sortedWorkouts(state).filter((w) => w.finished !== null);
    $('workout-history').replaceChildren(...past.map(historyRow));
    $('workout-history-empty').hidden = past.length > 0;
    return;
  }
  const open = workout.finished === null;
  $('workout-back').hidden = open;
  $('workout-title').textContent = titleOf(workout);
  $('workout-date').value = workout.date;
  if (document.activeElement !== $('workout-comment')) $('workout-comment').value = workout.comment;
  $('workout-finish').hidden = !open;
  keepFocus(() => $('workout-entries').replaceChildren(...workout.entries.flatMap((entry) => entryNodes(workout, entry))));
  if (open) renderTimer();
  else $('rest-timer').hidden = true;
};

export const bind = () => {
  $('workout-empty').addEventListener('click', () => start(startWorkout(state, new Date())));
  $('workout-add').addEventListener('click', () => pickExercise(current()));
  $('workout-back').addEventListener('click', () => {
    ui.workoutId = null;
    render();
  });
  $('workout-date').addEventListener('change', (event) => {
    if (!apply(setWorkoutDate(state, current().id, event.target.value))) render();
  });
  $('workout-comment').addEventListener('change', (event) => apply(setWorkoutComment(state, current().id, event.target.value)));
  // WO-7: a workout with no done set goes, with a note.
  $('workout-finish').addEventListener('click', () => {
    const result = finishWorkout(state, current().id, new Date());
    if (!apply(result)) return;
    stopRest();
    showToast(t(result.deleted ? 'toast.workoutEmpty' : 'toast.workoutFinished'));
  });
  $('workout-delete').addEventListener('click', () => {
    if (!window.confirm(t('workout.deleteConfirm'))) return;
    const { id, finished } = current();
    if (finished === null) stopRest();
    ui.workoutId = null;
    apply(deleteWorkout(state, id), { undoText: t('toast.workoutDeleted') });
  });
};
