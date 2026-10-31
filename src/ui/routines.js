// The Routines section: the routines, and the detail of one with its days and their items (RT-1,
// RT-2, RT-5, RT-7, RT-8, SCR-4, SCR-6, SCR-12, SCR-13).
import { findById, sortedRoutines, sortedExercises } from '#training';
import {
  addRoutine,
  renameRoutine,
  deleteRoutine,
  duplicateRoutine,
  archiveRoutine,
  addDay,
  renameDay,
  deleteDay,
  setWeekdays,
  addItem,
  editItem,
  deleteItem,
  moveItem,
  TEMPLATES,
  addTemplate,
} from '#routines';
import { setRule, nextSummary, ruleFromInput, weeksText, PRESET_531 } from '#progression';
import { startFromDay } from '#workouts';
import { $, el, ui, state, lang, t, apply, render } from '#ui/context';
import { icon } from '#ui/controls';
import { openSheet, closeSheet, field, textInput, numberInput, textArea, selectInput } from '#ui/sheet';
import { exerciseName, targetText, typeOf, weightText } from '#ui/format';

const open = (id) => {
  ui.routineId = id;
  render();
};

// A sheet with one name field: a new routine, a new day, or a rename.
const nameSheet = (title, value, run) =>
  openSheet({ title, body: [field('common.name', textInput('name', value, { labelKey: 'common.name' }))], onSubmit: ({ name }) => apply(run(name)) });

const emptyRoutine = () =>
  nameSheet(t('routines.new'), '', (name) => {
    const id = crypto.randomUUID();
    const result = addRoutine(state, name, new Date(), id);
    if (!result.error) ui.routineId = id;
    return result;
  });

// RT-8: the routine of a template, with the common exercises that the doc lacks; it opens.
const fromTemplate = (id) => {
  const result = addTemplate(state, id, (key) => t(key), new Date());
  closeSheet();
  if (!result.error) ui.routineId = result.id;
  apply(result);
};

const menuEntry = (text, note, run) =>
  el('button', { className: 'entry', type: 'button', onclick: run }, [el('span', { textContent: text }), el('span', { className: 'entry-note', textContent: note })]);

// SCR-6: **+** and the empty list offer an empty routine and the templates (RT-8).
export const openRoutineSheet = () =>
  openSheet({
    title: t('routines.new'),
    body: [
      menuEntry(t('routines.emptyRoutine'), t('routines.emptyRoutineNote'), emptyRoutine),
      ...TEMPLATES.map((template) => menuEntry(
        t(`template.${template.id}.name`),
        template.days.map((_, index) => t(`template.${template.id}.day.${index + 1}`)).join(' · '),
        () => fromTemplate(template.id),
      )),
    ],
  });

// ---- The rule of an item (SCR-12) ----

const RULE_TYPES = ['linear', 'double', 'percent'];

// A box whose label names a unit.
const unitField = (labelKey, input, unit) => field(labelKey, input, { unit });

// The fields of the rule, below the targets: the type, then the fields of that type only.
const ruleFields = (rule) => {
  const unit = rule?.type === 'percent' ? rule.unit : state.settings.unit;
  const type = selectInput('ruleType', [['', t('rule.none')], ...RULE_TYPES.map((name) => [name, t(`rule.${name}`)])], rule?.type ?? '');
  const steps = el('div', { className: 'rule-fields' }, [
    field('rule.failAfter', numberInput('failAfter', rule?.failAfter ?? 3, { labelKey: 'rule.failAfter' })),
    field('rule.deload', numberInput('deload', rule?.deload ?? 10, { decimal: true, labelKey: 'rule.deload' })),
  ]);
  const weeks = textArea('weeks', rule?.type === 'percent' ? weeksText(rule.weeks) : '', { maxLength: 2000, rows: 4, labelKey: 'rule.weeksHint' });
  const preset = el('button', { className: 'button outline', type: 'button', textContent: t('rule.preset531'), onclick: () => {
    weeks.value = weeksText(PRESET_531);
  } });
  const percent = el('div', { className: 'rule-fields' }, [
    unitField('rule.tm', numberInput('tm', rule?.tm, { decimal: true, labelKey: 'rule.tmHint' }), unit),
    unitField('rule.step', numberInput('step', rule?.step ?? (unit === 'kg' ? 5 : 10), { decimal: true, labelKey: 'rule.step' }), unit),
    field('rule.weeks', weeks),
    el('div', { className: 'cluster' }, [preset]),
  ]);
  const show = () => {
    steps.hidden = !['linear', 'double'].includes(type.value);
    percent.hidden = type.value !== 'percent';
  };
  type.addEventListener('change', show);
  show();
  return { unit, nodes: [field('rule.type', type), steps, percent] };
};

// RT-1, SCR-12: the target of an item and its rule. The weight shows for an exercise of weight and
// reps only. A new item is added, then its rule is set, in one save.
const itemSheet = (routine, day, item = null) => {
  const exercises = sortedExercises(state).filter((e) => !e.archived || e.id === item?.exerciseId);
  if (!exercises.length) {
    apply({ state, error: { key: 'error.noExercises' } });
    return;
  }
  const rule = ruleFields(item?.rule ?? null);
  openSheet({
    title: t(item ? 'routines.editItem' : 'routines.addItem'),
    body: [
      field('routines.exercise', selectInput('exerciseId', exercises.map((e) => [e.id, e.name]), item?.exerciseId ?? exercises[0].id)),
      field('routines.sets', numberInput('sets', item?.sets ?? 3, { labelKey: 'routines.sets' })),
      field('routines.reps', numberInput('reps', item?.reps, { labelKey: 'routines.reps' })),
      field('routines.repsMax', numberInput('repsMax', item?.repsMax, { labelKey: 'routines.repsMax' })),
      field('routines.weight', numberInput('weight', item?.weight, { decimal: true, labelKey: 'routines.weight' })),
      field('routines.rest', numberInput('rest', item?.rest, { labelKey: 'routines.restDefault' })),
      el('h3', { className: 'list-group-head', textContent: t('rule.title') }),
      ...rule.nodes,
    ],
    onSubmit: (values) => {
      const { exerciseId, sets, reps, repsMax, rest } = values;
      const chosen = ruleFromInput({ ...values, type: values.ruleType }, rule.unit);
      if (chosen.error) return apply({ state, error: chosen.error });
      const input = { exerciseId, sets, reps, repsMax, rest, weight: typeOf(exerciseId) === 'weight_reps' ? values.weight : '' };
      const id = item?.id ?? crypto.randomUUID();
      const saved = item ? editItem(state, routine.id, day.id, id, input) : addItem(state, routine.id, day.id, input, id);
      if (saved.error) return apply(saved);
      return apply(setRule(saved.state, routine.id, day.id, id, chosen.rule));
    },
  });
};

// SCR-12: the rule and its next target (PRG-6), `Linear · Next: 102.5 kg × 5`.
const nextText = (routine, day, item) => {
  const summary = nextSummary(state, routine.id, day.id, item.id);
  if (!summary) return null;
  const weight = weightText(summary.weight, summary.unit);
  const target = summary.reps === null ? weight : `${weight} × ${summary.reps}`;
  const week = summary.week === null ? '' : ` · ${t('rule.weekOf', { n: summary.week })}`;
  return `${t(`rule.${summary.type}`)} · ${t('rule.next', { target })}${week}`;
};

const iconAction = (name, label, run) => {
  const button = el('button', { className: 'button icon', type: 'button', onclick: run }, [icon(name)]);
  button.setAttribute('aria-label', label);
  return button;
};

const itemRow = (routine, day, item, index) => {
  const name = exerciseName(item.exerciseId);
  const next = nextText(routine, day, item);
  const body = el('div', { className: 'item-row-body' }, [
    el('button', { className: 'item-row-name', type: 'button', onclick: () => itemSheet(routine, day, item) }, [
      el('span', { className: 'item-row-label', textContent: name }),
      el('small', { className: 'item-row-meta', textContent: targetText(item) }),
      ...(next ? [el('small', { className: 'item-row-meta', textContent: next })] : []),
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

// SCR-13: the short and the long name of each weekday, Monday first (0 = Monday, RT-7). 1 January 2024
// is a Monday.
const weekdayNames = (style) => {
  const format = new Intl.DateTimeFormat(lang, { weekday: style });
  return Array.from({ length: 7 }, (_, index) => format.format(new Date(2024, 0, 1 + index)));
};

const weekdayChooser = (routine, day) => {
  const short = weekdayNames('short');
  const long = weekdayNames('long');
  return el('div', { className: 'weekdays' }, short.map((text, weekday) => {
    const on = day.weekdays.includes(weekday);
    const chip = el('button', { className: 'chip', type: 'button', textContent: text, onclick: () => {
      const next = on ? day.weekdays.filter((w) => w !== weekday) : [...day.weekdays, weekday];
      apply(setWeekdays(state, routine.id, day.id, next));
    } });
    chip.setAttribute('aria-pressed', String(on));
    chip.setAttribute('aria-label', t('routines.weekday', { day: long[weekday], name: day.name }));
    return chip;
  }));
};

const dayNodes = (routine, day) => [
  el('h3', { className: 'list-group-head', textContent: day.name }),
  weekdayChooser(routine, day),
  el('ul', { className: 'item-list' }, day.items.map((item, index) => itemRow(routine, day, item, index))),
  ...(day.items.length ? [] : [el('p', { className: 'empty-state inline', textContent: t('routines.dayEmpty') })]),
  el('div', { className: 'cluster' }, [
    el('button', { className: 'button tonal', type: 'button', textContent: t('routines.start'), disabled: !day.items.length, onclick: () => start(routine, day) }),
    el('button', { className: 'button outline', type: 'button', textContent: t('routines.addItem'), onclick: () => itemSheet(routine, day) }),
    el('button', { className: 'button outline', type: 'button', textContent: t('routines.renameDay'), onclick: () => nameSheet(t('routines.renameDay'), day.name, (name) => renameDay(state, routine.id, day.id, name)) }),
    el('button', { className: 'button outline danger', type: 'button', textContent: t('routines.deleteDay'), onclick: () => apply(deleteDay(state, routine.id, day.id), { undoText: t('toast.dayDeleted') }) }),
  ]),
];

// RT-5: the copy opens.
const duplicate = (routine) => {
  const id = crypto.randomUUID();
  const result = duplicateRoutine(state, routine.id, new Date(), id);
  if (!result.error) ui.routineId = id;
  apply(result);
};

const detailNodes = (routine) => [
  el('h2', { className: 'detail-title', textContent: routine.name }),
  ...(routine.archived ? [el('p', { className: 'detail-meta', textContent: t('routines.isArchived') })] : []),
  el('div', { className: 'cluster' }, [
    el('button', { className: 'button outline', type: 'button', textContent: t('routines.rename'), onclick: () => nameSheet(t('routines.rename'), routine.name, (name) => renameRoutine(state, routine.id, name)) }),
    el('button', { className: 'button outline', type: 'button', textContent: t('routines.duplicate'), onclick: () => duplicate(routine) }),
    el('button', { className: 'button outline', type: 'button', textContent: t(routine.archived ? 'routines.restore' : 'routines.archive'), onclick: () => apply(archiveRoutine(state, routine.id, !routine.archived)) }),
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

// SCR-4: the archived routines are behind a closed head with their count, as in Exercises.
const listNodes = (routines) => {
  const active = routines.filter((r) => !r.archived);
  const archived = routines.filter((r) => r.archived);
  const nodes = active.map(row);
  if (archived.length) {
    const toggle = el('button', { className: 'section-head-button', type: 'button', onclick: () => {
      ui.showArchivedRoutines = !ui.showArchivedRoutines;
      render();
    } }, [el('span', { textContent: t('routines.archived', { count: archived.length }) }), el('span', { className: 'chevron', textContent: ui.showArchivedRoutines ? '▾' : '▸' })]);
    toggle.setAttribute('aria-expanded', String(ui.showArchivedRoutines));
    nodes.push(el('li', { className: 'section-head' }, [toggle]));
    if (ui.showArchivedRoutines) nodes.push(...archived.map(row));
  }
  return nodes;
};

export const renderRoutines = () => {
  $('routines').hidden = ui.view !== 'routines';
  if (ui.view !== 'routines') return;
  const routines = sortedRoutines(state);
  $('routine-list').replaceChildren(...listNodes(routines));
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
