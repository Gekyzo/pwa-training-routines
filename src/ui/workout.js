// The Workout section: the start (Today, the next day of each routine, an empty workout, the past
// workouts), and the open or past workout with its sets (RT-3, RT-7, WO-1 to WO-19, SCR-1 to SCR-3,
// SCR-7 to SCR-11).
import { FIELDS, SET_KINDS, findById, localDate, sortedExercises, sortedWorkouts } from '#training';
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
  groupEntries,
  ungroupEntry,
  restsAfter,
  nextInGroup,
  duration,
  autoClose,
  repeatWorkout,
  skipEntry,
  unskipEntry,
  substituteEntry,
  addWarmups,
} from '#workouts';
import { activeRoutines, todayDays } from '#routines';
import { nextTarget } from '#progression';
import { RECORDS, bestsOf } from '#bests';
import { platesFor, warmupSets } from '#plates';
import { BACKUP_KEY, backupDue, normalizeBackupInfo, workoutText } from '#backup';
import { exportJson, exportFilename, keyOf } from '#storage';
import { start as startWatch, shown, finished as watchDone, stop as stopWatch, normalizeStopwatch } from '#stopwatch';
import { restFor } from '#timer';
import { convert, shownWeight } from '#units';
import { $, el, ui, state, storage, t, apply, render, showToast } from '#ui/context';
import { icon, download } from '#ui/controls';
import { openSheet, closeSheet, field, numberInput } from '#ui/sheet';
import { openExerciseSheet } from '#ui/exercises';
import { startRest, stop as stopRest, renderTimer } from '#ui/timer';
import { exerciseName, typeOf, dateText, targetText, weightText, clock } from '#ui/format';

// The workout in view: a past one that the user opened, else the open one, else none.
const current = () => (ui.workoutId ? findById(state.workouts, ui.workoutId) : null) ?? openWorkout(state);

// DATA-7: a workout start asks once that the browser keeps the data; nothing waits for the answer.
const askPersist = () => {
  const manager = navigator.storage;
  if (!manager?.persist) return;
  Promise.resolve(manager.persisted?.() ?? false)
    .then((persisted) => persisted || manager.persist())
    .catch(() => {});
};

const start = (result) => {
  if (!apply(result)) return false;
  ui.workoutId = null;
  askPersist();
  return true;
};

// The name of a workout: its routine and day, or Free workout.
const titleOf = (workout) => (workout.routineName ? `${workout.routineName} · ${workout.dayName}` : t('workout.free'));

const finishedCount = () => state.workouts.filter((w) => w.finished !== null).length;

// ---- The stopwatch of a set (TMR-4, TMR-5) ----

const WATCH_KEY = keyOf('stopwatch');
const WATCH_TYPES = Object.keys(FIELDS).filter((type) => FIELDS[type].includes('seconds'));

const loadWatch = () => {
  try {
    return normalizeStopwatch(JSON.parse(storage?.getItem(WATCH_KEY) ?? 'null'));
  } catch {
    return null;
  }
};

let watch = loadWatch();
let watchTick = null;

const saveWatch = () => {
  try {
    if (watch) storage?.setItem(WATCH_KEY, JSON.stringify(watch));
    else storage?.removeItem(WATCH_KEY);
  } catch {
    // The stopwatch still runs for this start.
  }
};

// The workout and the entry of a set, or null when the set is gone.
const placeOf = (setId) => {
  for (const workout of state.workouts) {
    const entry = workout.entries.find((e) => e.sets.some((s) => s.id === setId));
    if (entry) return { workout, entry };
  }
  return null;
};

const clearWatch = () => {
  watch = null;
  clearInterval(watchTick);
  watchTick = null;
  saveWatch();
};

// TMR-4: the stop writes the seconds to the set.
const finishWatch = () => {
  if (!watch) return;
  const { setId } = watch;
  const seconds = stopWatch(watch, Date.now());
  const place = placeOf(setId);
  clearWatch();
  if (place) apply(editSet(state, place.workout.id, place.entry.id, setId, { seconds: String(seconds) }));
  else render();
};

const showWatch = () => {
  if (!watch) return;
  if (!placeOf(watch.setId)) {
    clearWatch();
    return;
  }
  if (watchDone(watch, Date.now())) {
    navigator.vibrate?.([200, 100, 200]);
    finishWatch();
    return;
  }
  const button = document.querySelector(`[data-watch="${CSS.escape(watch.setId)}"]`);
  if (button) button.textContent = clock(shown(watch, Date.now()));
};

const runWatch = () => {
  clearInterval(watchTick);
  watchTick = setInterval(showWatch, 250);
  saveWatch();
};

// A start on another set stops the one that runs. A set not done counts down from its seconds.
const toggleWatch = (set) => {
  if (watch?.setId === set.id) {
    finishWatch();
    return;
  }
  finishWatch();
  watch = startWatch(set.id, Date.now(), set.done ? null : set.seconds);
  runWatch();
  render();
};

const watchButton = (set, index) => {
  const running = watch?.setId === set.id;
  const button = el('button', { className: running ? 'button icon accent set-row-watch' : 'button icon', type: 'button', onclick: () => toggleWatch(set) }, running ? [] : [icon('timer')]);
  if (running) button.textContent = clock(shown(watch, Date.now()));
  button.dataset.watch = set.id;
  button.dataset.key = `${set.id}:watch`;
  button.setAttribute('aria-label', t('set.stopwatch', { n: index + 1 }));
  button.setAttribute('aria-pressed', String(running));
  return button;
};

// ---- Sets ----

const PLACEHOLDER = { reps: 'set.repsShort', seconds: 'set.seconds', meters: 'set.meters' };

const boxInput = (set, key, value, { decimal, placeholder, label, onchange }) => {
  const input = el('input', {
    className: 'input set-row-input',
    type: 'text',
    inputMode: decimal ? 'decimal' : 'numeric',
    value: value ?? '',
    placeholder,
    onchange,
  });
  input.dataset.key = `${set.id}:${key}`;
  input.setAttribute('aria-label', label);
  return input;
};

// One box of a set. The value is shown in the unit of the settings (PR-8); the edit stores it so.
const fieldInput = (workout, entry, set, field) =>
  boxInput(set, field, field === 'weight' ? shownWeight(set.weight, set.unit, state.settings.unit) : set[field], {
    decimal: field === 'weight' || field === 'meters',
    placeholder: field === 'weight' ? state.settings.unit : t(PLACEHOLDER[field]),
    label: t(`set.${field}`),
    onchange: (event) => apply(editSet(state, workout.id, entry.id, set.id, { [field]: event.target.value })),
  });

// SCR-8: the effort box, with a scale only (WO-12).
const effortInput = (workout, entry, set) => {
  const scale = state.settings.effort;
  return boxInput(set, 'effort', set.effort, {
    decimal: scale === 'rpe',
    placeholder: t(`set.effort.${scale}`),
    label: t('set.effort'),
    onchange: (event) => apply(editSet(state, workout.id, entry.id, set.id, { effort: event.target.value })),
  });
};

// SCR-8: the number of a working set, else the letter of its kind; a tap gives the next kind (WO-11).
// The number counts the sets that are not warm-ups.
const kindButton = (workout, entry, set, index) => {
  const next = SET_KINDS[(SET_KINDS.indexOf(set.kind) + 1) % SET_KINDS.length];
  const number = entry.sets.slice(0, index + 1).filter((s) => s.kind !== 'warmup').length;
  const button = el('button', {
    className: 'button quiet set-row-kind',
    type: 'button',
    textContent: set.kind === 'working' ? String(number) : t(`set.kindShort.${set.kind}`),
    onclick: () => apply(editSet(state, workout.id, entry.id, set.id, { kind: next })),
  });
  button.dataset.key = `${set.id}:kind`;
  button.setAttribute('aria-label', t('set.kind', { n: index + 1, kind: t(`set.kind.${set.kind}`) }));
  return button;
};

// WO-5, WO-15: a done set starts the rest timer at the end of a round, in the open workout only
// (TMR-1, TMR-2); in a superset the next exercise comes into view.
const toggleDone = (workout, entry, set, done) => {
  if (!apply(markDone(state, workout.id, entry.id, set.id, done, new Date()))) {
    render();
    return;
  }
  if (!done || workout.finished !== null) return;
  const updated = findById(state.workouts, workout.id);
  if (restsAfter(updated, entry.id)) startRest(restFor(state, updated, entry.exerciseId));
  const next = nextInGroup(updated, entry.id);
  if (next && next !== entry.id) showEntry(updated, next);
};

const showEntry = (workout, entryId) => {
  const entry = findById(workout.entries, entryId);
  const set = entry?.sets.find((s) => !s.done);
  const check = set && $('workout-entries').querySelector(`[data-key="${CSS.escape(`${set.id}:done`)}"]`);
  if (!check) return;
  const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  check.focus({ preventScroll: true });
  check.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
};

// PR-4 and the AMRAP set of a percent rule (PRG-5).
const marksOf = (names, amrap) => {
  const pills = names.map((name) => el('span', { className: 'pill', textContent: t(`record.${name}`) }));
  if (amrap) pills.unshift(el('span', { className: 'pill ghost', textContent: t('set.amrap') }));
  return pills.length ? [el('div', { className: 'set-row-marks' }, pills)] : [];
};

const setRow = (workout, entry, set, index, { records, amrap }) => {
  const type = typeOf(entry.exerciseId);
  const check = el('input', { className: 'item-row-check', type: 'checkbox', checked: set.done, onchange: (event) => toggleDone(workout, entry, set, event.target.checked) });
  check.setAttribute('aria-label', t('set.done', { n: index + 1 }));
  check.dataset.key = `${set.id}:done`;
  const remove = el('button', { className: 'button icon', type: 'button', onclick: () => apply(deleteSet(state, workout.id, entry.id, set.id)) }, [icon('trash')]);
  remove.setAttribute('aria-label', t('set.delete', { n: index + 1 }));
  const boxes = FIELDS[type].map((field) => fieldInput(workout, entry, set, field));
  if (state.settings.effort !== 'none') boxes.push(effortInput(workout, entry, set));
  const end = WATCH_TYPES.includes(type) && workout.finished === null ? [watchButton(set, index), remove] : [remove];
  return el('li', { className: set.done ? 'item-row done' : 'item-row' }, [
    el('div', { className: 'item-row-body set-row' }, [check, kindButton(workout, entry, set, index), ...boxes, el('div', { className: 'item-row-end' }, end)]),
    ...marksOf(records, amrap),
  ]);
};

// The records that each done set of the entry holds now (PR-4): one read of the bests per entry.
const recordsOf = (entry) => {
  if (!entry.sets.some((s) => s.done)) return () => [];
  const bests = bestsOf(state, entry.exerciseId);
  const names = RECORDS[typeOf(entry.exerciseId)] ?? [];
  return (set) => (set.done ? names.filter((name) => bests[name]?.set?.id === set.id) : []);
};

// The AMRAP mark of each working set, from the plan of the item while the workout is open (PRG-5).
const amrapOf = (workout, entry) => {
  if (workout.finished !== null || !entry.itemId || !workout.routineId) return () => false;
  const plan = nextTarget(state, workout.routineId, workout.dayId, entry.itemId)?.plan ?? null;
  if (!plan) return () => false;
  const working = entry.sets.filter((s) => s.kind !== 'warmup');
  return (set) => Boolean(plan[working.indexOf(set)]?.amrap);
};

// ---- Exercises of a workout ----

// The letter of each superset of the workout, in the order of the list (SCR-9).
const groupLetters = (workout) => {
  const letters = new Map();
  for (const { group } of workout.entries) if (group !== null && !letters.has(group)) letters.set(group, String.fromCharCode(65 + letters.size));
  return letters;
};

const exerciseOf = (entry) => findById(state.exercises, entry.exerciseId);

// PR-6: the bar of a barbell exercise in the unit of the settings.
const barOf = (exercise, unit) =>
  exercise.bar === null || exercise.bar === undefined ? state.settings.bar[unit] : Math.round(convert(exercise.bar, exercise.unit ?? unit, unit) * 100) / 100;

const isBarbell = (exercise) => exercise?.equipment === 'barbell' && FIELDS[exercise.type].includes('weight');

// The weight that the plates and the warm-up start from: the first working set not done, else the first working set.
const workingWeight = (entry) => {
  const working = entry.sets.filter((s) => s.kind === 'working' && s.weight !== null);
  const set = working.find((s) => !s.done) ?? working[0];
  return set ? shownWeight(set.weight, set.unit, state.settings.unit) : null;
};

const parseLoad = (text) => {
  const value = Number(String(text).trim().replace(',', '.'));
  return String(text).trim() === '' || !Number.isFinite(value) ? null : value;
};

// SCR-10: the plates of a side for the load of the box (PR-6).
const platesText = (exercise, load) => {
  const unit = state.settings.unit;
  const bar = barOf(exercise, unit);
  const found = platesFor(load, bar, state.settings.plates[unit]);
  if ('load' in found) {
    if (!found.plates.length) return [t('plates.barOnly', { bar: weightText(bar, unit) })];
    return [t('plates.perSide', { plates: found.plates.map((p) => weightText(p, unit)).join(' + ') })];
  }
  return [
    t('plates.unreachable'),
    found.lower === null ? null : t('plates.lower', { weight: weightText(found.lower, unit) }),
    found.higher === null ? null : t('plates.higher', { weight: weightText(found.higher, unit) }),
  ].filter(Boolean);
};

const openPlates = (entry) => {
  const exercise = exerciseOf(entry);
  const result = el('div', { className: 'plates-result' });
  const show = (text) => {
    const load = parseLoad(text);
    result.replaceChildren(...(load === null ? [] : platesText(exercise, load).map((line) => el('span', { textContent: line }))));
  };
  const input = numberInput('load', workingWeight(entry), { decimal: true, labelKey: 'plates.load' });
  input.addEventListener('input', (event) => show(event.target.value));
  show(input.value);
  openSheet({ title: `${t('workout.plates')} · ${exercise.name}`, body: [field('plates.load', input), result] });
};

// WO-19: the warm-up of the working weight (PR-7).
const addWarmupSets = (workout, entry) => {
  const exercise = exerciseOf(entry);
  const unit = state.settings.unit;
  const sets = warmupSets(workingWeight(entry), barOf(exercise, unit), state.settings.plates[unit]);
  closeSheet();
  if (!sets.length) {
    showToast(t('toast.noWarmup'));
    return;
  }
  apply(addWarmups(state, workout.id, entry.id, sets));
};

const pickerRow = (text, meta, run) =>
  el('li', {}, [el('button', { className: 'list-row', type: 'button', onclick: () => apply(run()) && closeSheet() }, [
    el('span', { className: 'list-row-text', textContent: text }),
    ...(meta ? [el('span', { className: 'list-row-meta', textContent: meta })] : []),
  ])]);

// WO-15: the other exercises of the workout that are not in the superset of this one.
const pickSuperset = (workout, entry) => {
  const own = entry.group === null ? [entry.id] : workout.entries.filter((e) => e.group === entry.group).map((e) => e.id);
  const letters = groupLetters(workout);
  const rows = workout.entries
    .filter((e) => !own.includes(e.id))
    .map((e) => pickerRow(exerciseName(e.exerciseId), e.group === null ? '' : t('workout.group', { letter: letters.get(e.group) }), () => groupEntries(state, workout.id, [...own, e.id])));
  openSheet({ title: t('workout.superset'), body: [el('p', { className: 'workout-note', textContent: t('workout.supersetNote') }), el('ul', { className: 'list-group plain' }, rows)] });
};

// WO-17: any exercise that is not archived, of any type.
const pickSubstitute = (workout, entry) => {
  const rows = sortedExercises(state)
    .filter((e) => !e.archived && e.id !== entry.exerciseId)
    .map((e) => pickerRow(e.name, '', () => substituteEntry(state, workout.id, entry.id, e.id)));
  openSheet({ title: t('workout.substitute'), body: [el('ul', { className: 'list-group plain' }, rows)] });
};

const menuEntry = (labelKey, run) => el('button', { className: 'entry', type: 'button', onclick: run }, [el('span', { textContent: t(labelKey) })]);

const runAndClose = (result, options) => {
  closeSheet();
  apply(result, options);
};

// SCR-9: the secondary actions of an exercise, in one sheet.
const openEntryMenu = (workout, entry) => {
  const exercise = exerciseOf(entry);
  const done = entry.sets.some((s) => s.done);
  const others = workout.entries.some((e) => e.id !== entry.id && (entry.group === null || e.group !== entry.group));
  const body = [
    ...(others ? [menuEntry('workout.superset', () => pickSuperset(workout, entry))] : []),
    ...(entry.group !== null ? [menuEntry('workout.ungroup', () => runAndClose(ungroupEntry(state, workout.id, entry.id)))] : []),
    ...(entry.skipped ? [menuEntry('workout.unskip', () => runAndClose(unskipEntry(state, workout.id, entry.id)))] : []),
    ...(!entry.skipped && !done ? [menuEntry('workout.skip', () => runAndClose(skipEntry(state, workout.id, entry.id)))] : []),
    menuEntry('workout.substitute', () => pickSubstitute(workout, entry)),
    ...(isBarbell(exercise) && exercise.type === 'weight_reps' ? [menuEntry('workout.warmups', () => addWarmupSets(workout, entry))] : []),
    ...(isBarbell(exercise) ? [menuEntry('workout.plates', () => openPlates(entry))] : []),
    menuEntry('workout.removeExercise', () => runAndClose(deleteEntry(state, workout.id, entry.id), { undoText: t('toast.entryRemoved') })),
  ];
  openSheet({ title: exerciseName(entry.exerciseId), body });
};

// SCR-9: the target of the start and the notes of the exercise (EX-8) under its name.
const noteLines = (workout, entry) => {
  const lines = [];
  if (workout.finished === null && entry.target) lines.push(t('workout.target', { target: targetText(entry.target) }));
  if (entry.substituteFor) lines.push(t('workout.substituteFor', { name: exerciseName(entry.substituteFor) }));
  const notes = exerciseOf(entry)?.notes;
  if (notes) lines.push(notes);
  return lines;
};

const entryNodes = (workout, entry, letters) => {
  const menu = el('button', { className: 'button icon', type: 'button', onclick: () => openEntryMenu(workout, entry) }, [icon('more')]);
  menu.setAttribute('aria-label', t('workout.menu', { name: exerciseName(entry.exerciseId) }));
  const pills = [
    ...(entry.group !== null ? [el('span', { className: 'pill ghost', textContent: t('workout.group', { letter: letters.get(entry.group) }) })] : []),
    ...(entry.skipped ? [el('span', { className: 'pill ghost', textContent: t('workout.skipped') })] : []),
  ];
  const head = el('li', { className: 'group-head' }, [
    el('span', { className: 'workout-entry-name', textContent: exerciseName(entry.exerciseId) }),
    el('span', { className: 'workout-entry-end' }, [...pills, el('span', { textContent: `${entry.sets.filter((s) => s.done).length}/${entry.sets.length}` }), menu]),
  ]);
  head.dataset.entry = entry.id;
  const lines = noteLines(workout, entry);
  const records = recordsOf(entry);
  const amrap = amrapOf(workout, entry);
  return [
    head,
    ...(lines.length ? [el('li', { className: 'workout-note' }, lines.map((line) => el('span', { textContent: line })))] : []),
    ...entry.sets.map((set, index) => setRow(workout, entry, set, index, { records: records(set), amrap: amrap(set) })),
    ...(entry.skipped ? [] : [el('li', { className: 'workout-actions' }, [
      el('button', { className: 'button tonal', type: 'button', textContent: t('workout.addSet'), onclick: () => apply(addSet(state, workout.id, entry.id)) }),
    ])]),
  ];
};

// WO-3: a picker of the exercises that are not archived, and New exercise.
const pickExercise = (workout) => {
  const add = (exerciseId) => apply(addEntry(state, workout.id, exerciseId));
  const rows = sortedExercises(state)
    .filter((e) => !e.archived)
    .map((e) => el('li', {}, [el('button', { className: 'list-row', type: 'button', onclick: () => add(e.id) && closeSheet() }, [el('span', { className: 'list-row-text', textContent: e.name })])]));
  const create = el('li', {}, [el('button', { className: 'list-row accent', type: 'button', textContent: t('exercises.new'), onclick: () => openExerciseSheet(null, { onAdded: add }) })]);
  openSheet({ title: t('workout.addExercise'), body: [el('ul', { className: 'list-group plain' }, [create, ...rows])] });
};

// ---- The start ----

const dayRow = (routine, day, meta) =>
  el('button', { className: 'list-row', type: 'button', onclick: () => start(startFromDay(state, routine.id, day.id, new Date())) }, [
    el('span', { className: 'list-row-text', textContent: routine.name }),
    el('span', { className: 'list-row-meta', textContent: meta }),
  ]);

// RT-7: the days of today's weekday, of the routines that are not archived.
const todayNodes = () =>
  todayDays(state, new Date())
    .filter(({ day }) => day.items.length)
    .map(({ routine, day }) => dayRow(routine, day, t('workout.day', { day: day.name })));

// RT-3, RT-5: the next day of each routine that is not archived.
const startNodes = () =>
  activeRoutines(state)
    .map((routine) => [routine, nextDay(state, routine.id)])
    .filter(([, day]) => day?.items.length)
    .map(([routine, day]) => dayRow(routine, day, t('workout.day', { day: day.name })));

const historyRow = (workout) => {
  const sets = workout.entries.reduce((sum, e) => sum + e.sets.filter((s) => s.done).length, 0);
  const seconds = duration(workout);
  const meta = [titleOf(workout), t('workout.summary', { exercises: workout.entries.length, sets }), seconds === null ? null : clock(seconds)].filter(Boolean).join(' · ');
  return el('li', { className: 'item-row' }, [el('div', { className: 'item-row-body' }, [
    el('button', { className: 'item-row-name', type: 'button', onclick: () => {
      ui.workoutId = workout.id;
      render();
    } }, [el('span', { className: 'item-row-label', textContent: dateText(workout.date) }), el('small', { className: 'item-row-meta', textContent: meta })]),
  ])]);
};

const showGroup = (listId, headId, nodes) => {
  $(listId).replaceChildren(...nodes);
  $(listId).hidden = !nodes.length;
  $(headId).hidden = !nodes.length;
};

// ---- Repeat, share, backup ----

// SCR-11: Repeat asks the date and whether the values come too (WO-16).
const openRepeat = (workout) => {
  const date = el('input', { className: 'input field-input', type: 'date', name: 'date', value: localDate(new Date()), required: true });
  const values = el('input', { className: 'switch-input', type: 'checkbox', name: 'values', checked: true });
  values.setAttribute('role', 'switch');
  openSheet({
    title: t('workout.repeat'),
    body: [field('workout.date', date), el('label', { className: 'switch' }, [el('span', { textContent: t('workout.repeatValues') }), values])],
    submitLabel: t('workout.repeatStart'),
    onSubmit: (input) => start(repeatWorkout(state, workout.id, input.date, { values: input.values === 'on' }, new Date())),
  });
};

// INT-1: the share of the phone, else the clipboard.
const share = async (workout) => {
  const text = workoutText(state, workout.id, t, state.settings.unit);
  if (navigator.share) {
    try {
      await navigator.share({ title: titleOf(workout), text });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast(t('toast.copied'));
  } catch {
    showToast(t('error.share'));
  }
};

const loadBackupInfo = () => {
  try {
    return normalizeBackupInfo(JSON.parse(storage?.getItem(BACKUP_KEY) ?? 'null'));
  } catch {
    return null;
  }
};

// DATA-5: the export of the reminder writes the device key, as Export JSON does.
const exportNow = () => {
  const now = new Date();
  download(exportFilename(now), exportJson(state));
  try {
    storage?.setItem(BACKUP_KEY, JSON.stringify({ lastExport: now.toISOString(), workoutsAtExport: finishedCount() }));
  } catch {
    // The reminder comes again after the next finish.
  }
};

// WO-14: an open workout whose last done set is over 4 hours old finishes at that set.
const closeStale = () => {
  const result = autoClose(state, new Date());
  if (result.state === state) return false;
  stopRest();
  apply(result);
  showToast(t('toast.autoClosed'));
  return true;
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
  if (closeStale()) return;
  const workout = current();
  if (ui.workoutId && !workout) ui.workoutId = null;
  $('workout-start').hidden = Boolean(workout);
  $('workout-open').hidden = !workout;
  if (!workout) {
    showGroup('workout-today', 'workout-today-head', todayNodes());
    showGroup('workout-routines', 'workout-routines-head', startNodes());
    const past = sortedWorkouts(state).filter((w) => w.finished !== null);
    $('workout-history').replaceChildren(...past.map(historyRow));
    $('workout-history-empty').hidden = past.length > 0;
    return;
  }
  const open = workout.finished === null;
  $('workout-back').hidden = open;
  $('workout-title').textContent = titleOf(workout);
  const seconds = duration(workout);
  $('workout-duration').hidden = seconds === null;
  $('workout-duration').textContent = seconds === null ? '' : t('workout.duration', { time: clock(seconds) });
  $('workout-date').value = workout.date;
  if (document.activeElement !== $('workout-comment')) $('workout-comment').value = workout.comment;
  $('workout-finish').hidden = !open;
  $('workout-repeat').hidden = open;
  const letters = groupLetters(workout);
  keepFocus(() => $('workout-entries').replaceChildren(...workout.entries.flatMap((entry) => entryNodes(workout, entry, letters))));
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
  // WO-7: a workout with no done set goes, with a note. DATA-5: the backup reminder follows a finish.
  $('workout-finish').addEventListener('click', () => {
    finishWatch();
    const result = finishWorkout(state, current().id, new Date());
    if (!apply(result)) return;
    stopRest();
    if (result.deleted) showToast(t('toast.workoutEmpty'));
    else if (backupDue(loadBackupInfo(), finishedCount(), new Date())) showToast(t('toast.backupDue'), { action: { label: t('settings.export'), run: exportNow } });
    else showToast(t('toast.workoutFinished'));
  });
  $('workout-repeat').addEventListener('click', () => openRepeat(current()));
  $('workout-share').addEventListener('click', () => share(current()));
  $('workout-delete').addEventListener('click', () => {
    if (!window.confirm(t('workout.deleteConfirm'))) return;
    const { id, finished } = current();
    if (finished === null) stopRest();
    ui.workoutId = null;
    apply(deleteWorkout(state, id), { undoText: t('toast.workoutDeleted') });
  });
  // A stopwatch of a start before goes on, or stops when its countdown is past.
  if (watch) runWatch();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    showWatch();
    if (ui.view === 'workout') render();
  });
};
