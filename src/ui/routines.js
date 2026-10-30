// The Routines section: the routines, and the detail of one with its days and their items (RT-1,
// RT-2).
import { findById, sortedRoutines, sortedExercises } from '#training';
import { addRoutine, renameRoutine, deleteRoutine, addDay, renameDay, deleteDay, addItem, editItem, deleteItem, moveItem } from '#routines';
import { startFromDay } from '#workouts';
import { $, el, ui, state, t, apply, render } from '#ui/context';
import { icon } from '#ui/controls';
import { openSheet, field, textInput, numberInput, selectInput } from '#ui/sheet';
import { exerciseName, targetText, typeOf } from '#ui/format';

const open = (id) => {
  ui.routineId = id;
  render();
};

// A sheet with one name field: a new routine, a new day, or a rename.
const nameSheet = (title, value, run) =>
  openSheet({ title, body: [field('common.name', textInput('name', value, { labelKey: 'common.name' }))], onSubmit: ({ name }) => apply(run(name)) });

export const openRoutineSheet = () =>
  nameSheet(t('routines.new'), '', (name) => {
    const id = crypto.randomUUID();
    const result = addRoutine(state, name, new Date(), id);
    if (!result.error) ui.routineId = id;
    return result;
  });

// RT-1: the target of an item. The weight shows for an exercise of weight and reps only.
const itemSheet = (routine, day, item = null) => {
  const exercises = sortedExercises(state).filter((e) => !e.archived || e.id === item?.exerciseId);
  if (!exercises.length) {
    apply({ state, error: { key: 'error.noExercises' } });
    return;
  }
  openSheet({
    title: t(item ? 'routines.editItem' : 'routines.addItem'),
    body: [
      field('routines.exercise', selectInput('exerciseId', exercises.map((e) => [e.id, e.name]), item?.exerciseId ?? exercises[0].id)),
      field('routines.sets', numberInput('sets', item?.sets ?? 3, { labelKey: 'routines.sets' })),
      field('routines.reps', numberInput('reps', item?.reps, { labelKey: 'routines.reps' })),
      field('routines.repsMax', numberInput('repsMax', item?.repsMax, { labelKey: 'routines.repsMax' })),
      field('routines.weight', numberInput('weight', item?.weight, { decimal: true, labelKey: 'routines.weight' })),
      field('routines.rest', numberInput('rest', item?.rest, { labelKey: 'routines.restDefault' })),
    ],
    onSubmit: (values) => {
      const input = { ...values, weight: typeOf(values.exerciseId) === 'weight_reps' ? values.weight : '' };
      return apply(item ? editItem(state, routine.id, day.id, item.id, input) : addItem(state, routine.id, day.id, input));
    },
  });
};

const iconAction = (name, label, run) => {
  const button = el('button', { className: 'button icon', type: 'button', onclick: run }, [icon(name)]);
  button.setAttribute('aria-label', label);
  return button;
};

const itemRow = (routine, day, item, index) => {
  const name = exerciseName(item.exerciseId);
  const body = el('div', { className: 'item-row-body' }, [
    el('button', { className: 'item-row-name', type: 'button', onclick: () => itemSheet(routine, day, item) }, [
      el('span', { className: 'item-row-label', textContent: name }),
      el('small', { className: 'item-row-meta', textContent: targetText(item) }),
    ]),
    el('div', { className: 'item-row-end' }, [
      el('button', { className: 'button icon', type: 'button', textContent: '↑', disabled: index === 0, ariaLabel: t('routines.moveUp', { name }), onclick: () => apply(moveItem(state, routine.id, day.id, item.id, index - 1)) }),
      iconAction('trash', t('routines.removeItem', { name }), () => apply(deleteItem(state, routine.id, day.id, item.id), { undoText: t('toast.itemRemoved') })),
    ]),
  ]);
  return el('li', { className: 'item-row' }, [body]);
};

// RT-2: Start opens Workout with the new workout.
const start = (routine, day) => {
  if (apply(startFromDay(state, routine.id, day.id, new Date()))) {
    Object.assign(ui, { view: 'workout', workoutId: null });
    render();
  }
};

const dayNodes = (routine, day) => [
  el('h3', { className: 'list-group-head', textContent: day.name }),
  el('ul', { className: 'item-list' }, day.items.map((item, index) => itemRow(routine, day, item, index))),
  ...(day.items.length ? [] : [el('p', { className: 'empty-state inline', textContent: t('routines.dayEmpty') })]),
  el('div', { className: 'cluster' }, [
    el('button', { className: 'button tonal', type: 'button', textContent: t('routines.start'), disabled: !day.items.length, onclick: () => start(routine, day) }),
    el('button', { className: 'button outline', type: 'button', textContent: t('routines.addItem'), onclick: () => itemSheet(routine, day) }),
    el('button', { className: 'button outline', type: 'button', textContent: t('routines.renameDay'), onclick: () => nameSheet(t('routines.renameDay'), day.name, (name) => renameDay(state, routine.id, day.id, name)) }),
    el('button', { className: 'button outline danger', type: 'button', textContent: t('routines.deleteDay'), onclick: () => apply(deleteDay(state, routine.id, day.id), { undoText: t('toast.dayDeleted') }) }),
  ]),
];

const detailNodes = (routine) => [
  el('h2', { className: 'detail-title', textContent: routine.name }),
  el('div', { className: 'cluster' }, [
    el('button', { className: 'button outline', type: 'button', textContent: t('routines.rename'), onclick: () => nameSheet(t('routines.rename'), routine.name, (name) => renameRoutine(state, routine.id, name)) }),
    el('button', { className: 'button outline danger', type: 'button', textContent: t('common.delete'), onclick: () => {
      ui.routineId = null;
      apply(deleteRoutine(state, routine.id), { undoText: t('toast.routineDeleted') });
    } }),
  ]),
  ...routine.days.flatMap((day) => dayNodes(routine, day)),
  el('div', { className: 'cluster' }, [
    el('button', { className: 'button primary', type: 'button', textContent: t('routines.addDay'), onclick: () => nameSheet(t('routines.addDay'), '', (name) => addDay(state, routine.id, name)) }),
  ]),
];

const row = (routine) => {
  const name = el('button', { className: 'item-row-name', type: 'button', onclick: () => open(routine.id) }, [
    el('span', { className: 'item-row-label', textContent: routine.name }),
    el('small', { className: 'item-row-meta', textContent: routine.days.map((d) => d.name).join(' · ') || t('routines.noDays') }),
  ]);
  if (routine.id === ui.routineId) name.setAttribute('aria-current', 'true');
  return el('li', { className: 'item-row' }, [el('div', { className: 'item-row-body' }, [name])]);
};

export const renderRoutines = () => {
  $('routines').hidden = ui.view !== 'routines';
  if (ui.view !== 'routines') return;
  const routines = sortedRoutines(state);
  $('routine-list').replaceChildren(...routines.map(row));
  $('routines-empty').hidden = routines.length > 0;
  const routine = findById(state.routines, ui.routineId);
  if (!routine) ui.routineId = null;
  if (routine) $('routines').dataset.detail = '';
  else delete $('routines').dataset.detail;
  $('routine-pick').hidden = Boolean(routine);
  $('routine-body').replaceChildren(...(routine ? detailNodes(routine) : []));
};

export const bind = () => {
  $('routines-add').addEventListener('click', openRoutineSheet);
  $('routine-back').addEventListener('click', () => open(null));
};
