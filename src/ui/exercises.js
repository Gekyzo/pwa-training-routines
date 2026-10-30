// The Exercises section: the exercises by category, and the detail of one with its records and its
// history (EX-1 to EX-6, PR-1, WO-10).
import { TYPES, findById, sortedCategories, sortedExercises } from '#training';
import { addCategory, addExercise, editExercise, deleteExercise, archiveExercise, canDeleteExercise, seedExercises } from '#exercises';
import { bestsOf, RECORDS } from '#bests';
import { exerciseHistory } from '#workouts';
import { $, el, ui, state, t, apply, render } from '#ui/context';
import { openSheet, field, textInput, numberInput, selectInput } from '#ui/sheet';
import { setText, typeName, dateText, clock, weightText } from '#ui/format';

const open = (id) => {
  ui.exerciseId = id;
  render();
};

const NEW_CATEGORY = '+';

// EX-1: the sheet of a new exercise, or of `exercise`. A name in New category creates it first.
export const openExerciseSheet = (exercise = null, { onAdded = null } = {}) => {
  const categories = [['', t('exercises.noCategory')], ...sortedCategories(state).map((c) => [c.id, c.name])];
  openSheet({
    title: t(exercise ? 'exercises.editTitle' : 'exercises.new'),
    body: [
      field('exercises.name', textInput('name', exercise?.name ?? '', { labelKey: 'exercises.name' })),
      field('exercises.category', selectInput('categoryId', categories, exercise?.categoryId ?? '')),
      field('exercises.newCategory', textInput('newCategory', '', { labelKey: 'exercises.newCategory' })),
      field('exercises.type', selectInput('type', TYPES.map((type) => [type, typeName(type)]), exercise?.type ?? 'weight_reps')),
      field('exercises.rest', numberInput('rest', exercise?.rest, { labelKey: 'exercises.restDefault' })),
    ],
    onSubmit: ({ name, categoryId, newCategory, type, rest }) => {
      let draft = state;
      let category = categoryId || null;
      if (newCategory.trim()) {
        const id = crypto.randomUUID();
        const added = addCategory(draft, newCategory, id);
        if (added.error) return apply(added);
        draft = added.state;
        category = id;
      }
      const id = exercise?.id ?? crypto.randomUUID();
      const input = { name, categoryId: category, type, rest };
      const result = exercise ? editExercise(draft, id, input) : addExercise(draft, input, id);
      if (!apply(result)) return false;
      if (!exercise) onAdded?.(id);
      return true;
    },
  });
};

const row = (exercise) => {
  const name = el('button', { className: 'item-row-name', type: 'button', onclick: () => open(exercise.id) }, [
    el('span', { className: 'item-row-label', textContent: exercise.name }),
    el('small', { className: 'item-row-meta', textContent: typeName(exercise.type) }),
  ]);
  const node = el('li', { className: 'item-row' }, [el('div', { className: 'item-row-body' }, [name])]);
  if (exercise.id === ui.exerciseId) name.setAttribute('aria-current', 'true');
  return node;
};

const groupHead = (title, count) => el('li', { className: 'group-head' }, [el('span', { textContent: title }), el('span', { textContent: String(count) })]);

const listNodes = () => {
  const active = sortedExercises(state).filter((e) => !e.archived);
  const archived = sortedExercises(state).filter((e) => e.archived);
  const groups = [...sortedCategories(state).map((c) => [c.name, active.filter((e) => e.categoryId === c.id)])];
  groups.push([t('exercises.noCategory'), active.filter((e) => !findById(state.categories, e.categoryId))]);
  const nodes = groups.filter(([, list]) => list.length).flatMap(([title, list]) => [groupHead(title, list.length), ...list.map(row)]);
  if (archived.length) {
    const toggle = el('button', { className: 'section-head-button', type: 'button', onclick: () => {
      ui.showArchived = !ui.showArchived;
      render();
    } }, [el('span', { textContent: t('exercises.archived', { count: archived.length }) }), el('span', { className: 'chevron', textContent: ui.showArchived ? '▾' : '▸' })]);
    toggle.setAttribute('aria-expanded', String(ui.showArchived));
    nodes.push(el('li', { className: 'section-head' }, [toggle]));
    if (ui.showArchived) nodes.push(...archived.map(row));
  }
  return nodes;
};

// PR-1: the records of the type of the exercise, each with its date.
const recordValue = (name, best, exercise) => {
  if (name === 'heaviest') return setText(best.set, 'weight_reps');
  if (name === 'mostReps') return t('set.reps', { reps: best.set ? best.set.reps : best.value });
  if (name === 'bestSet') return setText(best.set, 'weight_reps');
  if (name === 'bestWorkout') return exercise.type === 'reps' ? t('set.reps', { reps: best.value }) : weightText(best.value, 'kg');
  if (name === 'longest') return clock(best.value);
  return setText({ meters: best.value, seconds: null }, 'distance_time');
};

const recordsNode = (exercise) => {
  const bests = bestsOf(state, exercise.id);
  const rows = RECORDS[exercise.type]
    .filter((name) => bests[name])
    .map((name) => el('li', {}, [el('div', { className: 'list-row' }, [
      el('span', { className: 'list-row-text', textContent: t(`record.${name}`) }),
      el('span', { className: 'list-row-meta', textContent: `${recordValue(name, bests[name], exercise)} · ${dateText(bests[name].workout.date)}` }),
    ])]));
  if (!rows.length) return [el('p', { className: 'empty-state inline', textContent: t('exercises.noRecords') })];
  return [el('ul', { className: 'list-group plain' }, rows)];
};

const historyNode = (exercise) => {
  const history = exerciseHistory(state, exercise.id);
  if (!history.length) return [el('p', { className: 'empty-state inline', textContent: t('exercises.noHistory') })];
  return [el('ul', { className: 'list-group plain' }, history.map(({ workout, sets }) => el('li', {}, [
    el('button', { className: 'list-row', type: 'button', onclick: () => openWorkout(workout.id) }, [
      el('span', { className: 'list-row-text', textContent: dateText(workout.date) }),
      el('span', { className: 'list-row-meta', textContent: sets.map((s) => setText(s, exercise.type)).join(', ') }),
    ]),
  ])))];
};

// Opens a past workout in Workout: the view of the workout reads `ui.workoutId`.
const openWorkout = (id) => {
  Object.assign(ui, { view: 'workout', workoutId: id });
  render();
};

const detailNodes = (exercise) => {
  const category = findById(state.categories, exercise.categoryId);
  const rest = exercise.rest === null ? t('exercises.restUsesDefault', { rest: clock(state.settings.rest) }) : clock(exercise.rest);
  const actions = [
    el('button', { className: 'button outline', type: 'button', textContent: t('common.edit'), onclick: () => openExerciseSheet(exercise) }),
    el('button', { className: 'button outline', type: 'button', textContent: t(exercise.archived ? 'exercises.restore' : 'exercises.archive'), onclick: () => apply(archiveExercise(state, exercise.id, !exercise.archived)) }),
  ];
  if (canDeleteExercise(state, exercise.id)) {
    actions.push(el('button', { className: 'button outline danger', type: 'button', textContent: t('common.delete'), onclick: () => {
      ui.exerciseId = null;
      apply(deleteExercise(state, exercise.id), { undoText: t('toast.exerciseDeleted') });
    } }));
  }
  return [
    el('h2', { className: 'detail-title', textContent: exercise.name }),
    el('p', { className: 'detail-meta', textContent: [category?.name, typeName(exercise.type), t('exercises.restIs', { rest })].filter(Boolean).join(' · ') }),
    el('div', { className: 'cluster' }, actions),
    el('h3', { className: 'list-group-head', textContent: t('exercises.records') }),
    ...recordsNode(exercise),
    el('h3', { className: 'list-group-head', textContent: t('exercises.history') }),
    ...historyNode(exercise),
  ];
};

export const renderExercises = () => {
  $('exercises').hidden = ui.view !== 'exercises';
  if (ui.view !== 'exercises') return;
  $('exercise-list').replaceChildren(...listNodes());
  $('exercises-empty').hidden = state.exercises.length > 0;
  const exercise = findById(state.exercises, ui.exerciseId);
  if (!exercise) ui.exerciseId = null;
  if (exercise) $('exercises').dataset.detail = '';
  else delete $('exercises').dataset.detail;
  $('exercise-pick').hidden = Boolean(exercise);
  $('exercise-body').replaceChildren(...(exercise ? detailNodes(exercise) : []));
};

export const bind = () => {
  $('exercises-add').addEventListener('click', () => openExerciseSheet());
  // EX-4: the names in the language of the screen.
  $('exercises-seed').addEventListener('click', () => apply(seedExercises(state, (key) => t(key))));
  $('exercise-back').addEventListener('click', () => open(null));
};
