// The Exercises section: the exercises by category, and the detail of one with its records and its
// history (EX-1 to EX-8, PR-1 to PR-3, WO-10, INT-3, SCR-5, SCR-14, SCR-15).
import { TYPES, EQUIPMENT, findById, sortedCategories, sortedExercises } from '#training';
import { addCategory, addExercise, editExercise, deleteExercise, archiveExercise, canDeleteExercise, mergeExercises, seedExercises } from '#exercises';
import { bestsOf, repMaxes, RECORDS } from '#bests';
import { searchUrl, parseSearch } from '#wger';
import { exerciseHistory } from '#workouts';
import { shownWeight } from '#units';
import { $, el, ui, state, lang, t, apply, render, showToast } from '#ui/context';
import { openSheet, closeSheet, field, textInput, numberInput, textArea, selectInput, switchInput } from '#ui/sheet';
import { setText, typeName, dateText, clock, weightText } from '#ui/format';

const open = (id) => {
  ui.exerciseId = id;
  render();
};

// SCR-15 (INT-3): the search of wger, online only. A tap on a result fills the name, and the
// category: the one of that name, else a new one of that name. The only request of the sheet.
const wgerSearch = ({ name, categoryId, newCategory }) => {
  const results = el('ul', { className: 'list-group plain' });
  const box = el('input', { className: 'input', type: 'search', enterKeyHint: 'search', maxLength: 60, placeholder: t('wger.search') });
  box.setAttribute('aria-label', t('wger.search'));
  const pick = (suggestion) => {
    name.value = suggestion.name;
    const category = sortedCategories(state).find((c) => c.name.trim().toLowerCase() === suggestion.category.toLowerCase());
    categoryId.value = category?.id ?? '';
    newCategory.value = category ? '' : suggestion.category;
    results.replaceChildren();
  };
  const go = el('button', { className: 'button tonal', type: 'button', textContent: t('wger.go') });
  const run = async () => {
    const term = box.value.trim();
    if (!term) return;
    go.disabled = true;
    try {
      const response = await fetch(searchUrl(term, lang));
      if (!response.ok) throw new Error(String(response.status));
      const found = parseSearch(await response.json());
      results.replaceChildren(...(found.length
        ? found.map((s) => el('li', {}, [el('button', { className: 'list-row', type: 'button', onclick: () => pick(s) }, [
          el('span', { className: 'list-row-text', textContent: s.name }),
          el('span', { className: 'list-row-meta', textContent: s.category }),
        ])]))
        : [el('li', {}, [el('p', { className: 'empty-state inline', textContent: t('wger.none') })])]));
    } catch {
      showToast(t('error.wger'));
    } finally {
      go.disabled = false;
    }
  };
  go.addEventListener('click', run);
  // Enter searches; it does not save the sheet.
  box.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    run();
  });
  return [el('div', { className: 'input-row' }, [box, go]), results];
};

// EX-5: an increment or a bar in the unit of the settings, one decimal.
const shownOf = (exercise, key) => {
  const value = exercise?.[key] ?? null;
  return value === null ? '' : String(shownWeight(value, exercise.unit ?? state.settings.unit, state.settings.unit));
};

// EX-1, EX-5, EX-8, SCR-14: the sheet of a new exercise, or of `exercise`. A name in New category
// creates it first. An increment and a bar that the user did not change keep their own unit.
export const openExerciseSheet = (exercise = null, { onAdded = null } = {}) => {
  const categories = [['', t('exercises.noCategory')], ...sortedCategories(state).map((c) => [c.id, c.name])];
  const unit = state.settings.unit;
  const shown = { increment: shownOf(exercise, 'increment'), bar: shownOf(exercise, 'bar') };
  const name = textInput('name', exercise?.name ?? '', { labelKey: 'exercises.name' });
  const categoryId = selectInput('categoryId', categories, exercise?.categoryId ?? '');
  const newCategory = textInput('newCategory', '', { labelKey: 'exercises.newCategory' });
  openSheet({
    title: t(exercise ? 'exercises.editTitle' : 'exercises.new'),
    body: [
      ...(navigator.onLine ? wgerSearch({ name, categoryId, newCategory }) : []),
      field('exercises.name', name),
      field('exercises.category', categoryId),
      field('exercises.newCategory', newCategory),
      field('exercises.type', selectInput('type', TYPES.map((type) => [type, typeName(type)]), exercise?.type ?? 'weight_reps')),
      field('exercises.equipment', selectInput('equipment', [['', t('equipment.none')], ...EQUIPMENT.map((e) => [e, t(`equipment.${e}`)])], exercise?.equipment ?? '')),
      field('exercises.rest', numberInput('rest', exercise?.rest, { labelKey: 'exercises.restDefault' })),
      field('exercises.increment', numberInput('increment', shown.increment, { decimal: true, labelKey: 'exercises.incrementDefault' }), { unit }),
      field('exercises.bar', numberInput('bar', shown.bar, { decimal: true, labelKey: 'exercises.barDefault' }), { unit }),
      field('exercises.notes', textArea('notes', exercise?.notes ?? '', { labelKey: 'exercises.notes' })),
      switchInput('unilateral', 'exercises.unilateral', exercise?.unilateral ?? false),
    ],
    onSubmit: (values) => {
      let draft = state;
      let category = values.categoryId || null;
      if (values.newCategory.trim()) {
        const id = crypto.randomUUID();
        const added = addCategory(draft, values.newCategory, id);
        if (added.error) return apply(added);
        draft = added.state;
        category = id;
      }
      const id = exercise?.id ?? crypto.randomUUID();
      const changed = !exercise || values.increment !== shown.increment || values.bar !== shown.bar;
      const input = {
        name: values.name,
        categoryId: category,
        type: values.type,
        rest: values.rest,
        equipment: values.equipment || null,
        notes: values.notes,
        unilateral: values.unilateral === 'on',
        ...(changed ? { increment: values.increment, bar: values.bar } : {}),
      };
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
  if (name === 'e1rm') return weightText(best.value, 'kg');
  if (name === 'bestWorkout') return exercise.type === 'reps' ? t('set.reps', { reps: best.value }) : weightText(best.value, 'kg');
  if (name === 'longest') return clock(best.value);
  return setText({ meters: best.value, seconds: null }, 'distance_time');
};

const recordsNode = (exercise) => {
  const bests = bestsOf(state, exercise.id);
  const rows = RECORDS[exercise.type]
    .filter((name) => bests[name])
    .map((name) => el('li', {}, [el('div', { className: 'list-row' }, [
      el('span', { className: 'list-row-text', textContent: name === 'e1rm' ? t('record.e1rmFormula', { formula: t(`formula.${state.settings.formula}`) }) : t(`record.${name}`) }),
      el('span', { className: 'list-row-meta', textContent: `${recordValue(name, bests[name], exercise)} · ${dateText(bests[name].workout.date)}` }),
    ])]));
  if (!rows.length) return [el('p', { className: 'empty-state inline', textContent: t('exercises.noRecords') })];
  return [el('ul', { className: 'list-group plain' }, rows)];
};

// SCR-14 (PR-3): the heaviest weight of each rep count that has one.
const repMaxNodes = (exercise) => {
  const rows = repMaxes(state, exercise.id).filter(Boolean).map((max) => el('li', {}, [el('div', { className: 'list-row' }, [
    el('span', { className: 'list-row-text', textContent: t('exercises.repMax', { reps: max.reps }) }),
    el('span', { className: 'list-row-meta', textContent: `${weightText(max.weight, 'kg')} · ${dateText(max.workout.date)}` }),
  ])]));
  if (!rows.length) return [];
  return [el('h3', { className: 'list-group-head', textContent: t('exercises.repMaxes') }), el('ul', { className: 'list-group plain' }, rows)];
};

// SCR-14 (EX-7): the exercises of the same type; a tap asks, then merges this one into it.
const mergeTargets = (exercise) => sortedExercises(state).filter((e) => e.id !== exercise.id && e.type === exercise.type);

const openMerge = (exercise) => {
  const rows = mergeTargets(exercise).map((other) => el('li', {}, [el('button', { className: 'list-row', type: 'button', onclick: () => {
    if (!window.confirm(t('exercises.mergeConfirm', { from: exercise.name, to: other.name }))) return;
    closeSheet();
    // The detail goes to the exercise that stays.
    ui.exerciseId = other.id;
    if (!apply(mergeExercises(state, other.id, exercise.id), { undoText: t('toast.merged') })) open(exercise.id);
  } }, [
    el('span', { className: 'list-row-text', textContent: other.name }),
    ...(other.archived ? [el('span', { className: 'list-row-meta', textContent: t('exercises.isArchived') })] : []),
  ])]));
  openSheet({ title: t('exercises.merge'), body: [el('p', { className: 'workout-note', textContent: t('exercises.mergeNote', { name: exercise.name }) }), el('ul', { className: 'list-group plain' }, rows)] });
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
  // EX-5, EX-8: the equipment, the increment, the bar and the unilateral flag, when set.
  const own = (key) => (exercise[key] === null ? null : weightText(exercise[key], exercise.unit ?? state.settings.unit));
  const extra = [
    exercise.equipment ? t(`equipment.${exercise.equipment}`) : null,
    own('increment') ? t('exercises.incrementIs', { weight: own('increment') }) : null,
    own('bar') ? t('exercises.barIs', { weight: own('bar') }) : null,
    exercise.unilateral ? t('exercises.unilateral') : null,
  ].filter(Boolean);
  const actions = [
    el('button', { className: 'button outline', type: 'button', textContent: t('common.edit'), onclick: () => openExerciseSheet(exercise) }),
    ...(mergeTargets(exercise).length ? [el('button', { className: 'button outline', type: 'button', textContent: t('exercises.merge'), onclick: () => openMerge(exercise) })] : []),
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
    ...(extra.length ? [el('p', { className: 'detail-meta', textContent: extra.join(' · ') })] : []),
    ...(exercise.notes ? [el('p', { className: 'detail-notes', textContent: exercise.notes })] : []),
    el('div', { className: 'cluster' }, actions),
    el('h3', { className: 'list-group-head', textContent: t('exercises.records') }),
    ...recordsNode(exercise),
    ...repMaxNodes(exercise),
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
