import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_SLUG } from '#config';
import {
  TRAINING_KEY,
  TRAINING_VERSION,
  MAX_NAME,
  TYPES,
  FIELDS,
  LIMITS,
  DEFAULT_SETTINGS,
  emptyTraining,
  normalizeTraining,
  isNewerTraining,
  checkName,
  checkNumber,
  nameTaken,
  setUnit,
  setRest,
  sortedExercises,
  sortedRoutines,
  sortedWorkouts,
  localDate,
} from '#training';

const set = (over = {}) => ({
  id: 's1', weight: 60, unit: 'kg', reps: 5, seconds: null, meters: null, done: true, comment: '',
  kind: 'working', effort: null, at: '2026-10-02T18:10:00.000Z', ...over,
});

const settings = () => ({
  unit: 'kg',
  rest: 120,
  formula: 'epley',
  effort: 'none',
  plates: { kg: [25, 20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] },
  bar: { kg: 20, lb: 45 },
  sex: null,
  measures: [],
  stallAfter: 4,
});

const item = (over = {}) => ({ id: 'i1', exerciseId: 'e1', sets: 3, reps: 8, repsMax: 12, weight: null, rest: 90, rule: null, ...over });

const entry = (over = {}) => ({
  id: 'n1', exerciseId: 'e1', sets: [set()], itemId: 'i1', target: null, group: null, skipped: false, substituteFor: null, ...over,
});

const full = () => ({
  version: 2,
  settings: settings(),
  categories: [{ id: 'c1', name: 'Chest', weekMin: null, weekMax: null }],
  exercises: [
    {
      id: 'e1', name: 'Bench press', categoryId: 'c1', type: 'weight_reps', rest: null, archived: false,
      increment: null, bar: null, unit: null, equipment: null, notes: '', unilateral: false,
    },
  ],
  routines: [
    {
      id: 'r1',
      name: 'Push',
      created: '2026-10-01T10:00:00.000Z',
      archived: false,
      days: [{ id: 'd1', name: 'A', weekdays: [], items: [item()] }],
    },
  ],
  workouts: [
    {
      id: 'w1',
      date: '2026-10-02',
      started: '2026-10-02T18:00:00.000Z',
      finished: null,
      routineId: 'r1',
      dayId: 'd1',
      routineName: 'Push',
      dayName: 'A',
      comment: '',
      entries: [entry()],
    },
  ],
  bodies: [],
  goals: [],
});

// The doc of phase 1, with none of the fields of version 2.
const v1 = () => ({
  version: 1,
  settings: { unit: 'lb', rest: 120 },
  categories: [{ id: 'c1', name: 'Chest' }],
  exercises: [{ id: 'e1', name: 'Bench press', categoryId: 'c1', type: 'weight_reps', rest: null, archived: false }],
  routines: [
    {
      id: 'r1',
      name: 'Push',
      created: '2026-10-01T10:00:00.000Z',
      days: [{ id: 'd1', name: 'A', items: [{ id: 'i1', exerciseId: 'e1', sets: 3, reps: 8, repsMax: 12, weight: null, rest: 90 }] }],
    },
  ],
  workouts: [
    {
      id: 'w1',
      date: '2026-10-02',
      started: '2026-10-02T18:00:00.000Z',
      finished: null,
      routineId: 'r1',
      dayId: 'd1',
      routineName: 'Push',
      dayName: 'A',
      comment: '',
      entries: [{ id: 'n1', exerciseId: 'e1', sets: [{ id: 's1', weight: 60, unit: 'kg', reps: 5, seconds: null, meters: null, done: true, comment: '' }] }],
    },
  ],
});

// The doc after one change by `edit`, normalized.
const withEdit = (edit) => {
  const doc = full();
  edit(doc);
  return normalizeTraining(doc);
};

test('the key of the doc has the slug', () => {
  assert.equal(TRAINING_KEY, `${APP_SLUG}.training`);
});

test('the empty doc is valid and has the default settings', () => {
  assert.deepEqual(normalizeTraining(emptyTraining()), emptyTraining());
  assert.deepEqual(emptyTraining().settings, { ...settings(), rest: 90 });
  assert.equal(emptyTraining().version, 2);
  assert.deepEqual(emptyTraining().bodies, []);
  assert.deepEqual(emptyTraining().goals, []);
});

test('a full doc passes unchanged', () => {
  assert.deepEqual(normalizeTraining(full()), full());
});

test('a doc that is not version 1 or 2 or has a list that is not an array is refused', () => {
  assert.equal(TRAINING_VERSION, 2);
  assert.equal(normalizeTraining(null), null);
  assert.equal(normalizeTraining({ ...full(), version: 3 }), null);
  assert.equal(normalizeTraining({ ...full(), version: '2' }), null);
  assert.equal(normalizeTraining({ ...full(), workouts: {} }), null);
  assert.equal(normalizeTraining({ ...full(), bodies: undefined }), null);
  assert.equal(normalizeTraining({ ...full(), goals: {} }), null);
});

test('isNewerTraining is true only for a doc of a version above 2', () => {
  assert.equal(isNewerTraining({ ...full(), version: 3 }), true);
  assert.equal(isNewerTraining({ version: 2.5 }), true);
  assert.equal(isNewerTraining(full()), false);
  assert.equal(isNewerTraining(v1()), false);
  assert.equal(isNewerTraining({ version: '3' }), false);
  assert.equal(isNewerTraining(null), false);
  assert.equal(isNewerTraining([]), false);
});

test('a version 1 doc migrates to version 2, each new field with its default', () => {
  const doc = normalizeTraining(v1());
  const expected = full();
  expected.settings = { ...settings(), unit: 'lb' };
  expected.workouts[0].entries[0] = entry({ itemId: null, sets: [set({ at: null })] });
  assert.deepEqual(doc, expected);
});

test('the migration leaves the version 1 doc alone', () => {
  const doc = v1();
  normalizeTraining(doc);
  assert.deepEqual(doc, v1());
});

test('a version 1 doc with lists of version 2 drops them', () => {
  const doc = { ...v1(), bodies: [{ id: 'b1', date: '2026-10-01', measure: 'weight', value: 80, unit: 'kg' }], goals: 'x' };
  assert.deepEqual(normalizeTraining(doc).bodies, []);
  assert.deepEqual(normalizeTraining(doc).goals, []);
});

test('a version 2 doc normalizes to itself', () => {
  const once = normalizeTraining(full());
  assert.deepEqual(normalizeTraining(once), once);
});

test('names are trimmed and unknown fields are dropped', () => {
  const doc = full();
  doc.categories[0] = { id: 'c1', name: '  Chest ', extra: 1 };
  assert.deepEqual(normalizeTraining(doc).categories, [{ id: 'c1', name: 'Chest', weekMin: null, weekMax: null }]);
});

test('two exercises with one name, with no regard to case, are refused', () => {
  const doc = full();
  doc.exercises.push({ ...doc.exercises[0], id: 'e2', name: 'BENCH PRESS' });
  assert.equal(normalizeTraining(doc), null);
});

test('a duplicate id is refused', () => {
  const doc = full();
  doc.categories.push({ id: 'c1', name: 'Back' });
  assert.equal(normalizeTraining(doc), null);
});

test('an unknown exercise type is refused', () => {
  const doc = full();
  doc.exercises[0].type = 'swim';
  assert.equal(normalizeTraining(doc), null);
});

test('a number out of its limits is refused', () => {
  for (const over of [{ reps: -1 }, { reps: 2.5 }, { weight: 1001 }, { seconds: 1.5 }, { meters: -1 }]) {
    const doc = full();
    doc.workouts[0].entries[0].sets[0] = set(over);
    assert.equal(normalizeTraining(doc), null, JSON.stringify(over));
  }
});

test('a range whose top is below its bottom is refused', () => {
  const doc = full();
  doc.routines[0].days[0].items[0] = item({ repsMax: 6 });
  assert.equal(normalizeTraining(doc), null);
});

test('missing optional fields read as null, false or empty', () => {
  const doc = full();
  delete doc.exercises[0].rest;
  delete doc.exercises[0].archived;
  delete doc.workouts[0].comment;
  delete doc.workouts[0].finished;
  for (const field of ['increment', 'bar', 'unit', 'equipment', 'notes', 'unilateral']) delete doc.exercises[0][field];
  delete doc.categories[0].weekMin;
  delete doc.routines[0].archived;
  delete doc.routines[0].days[0].weekdays;
  delete doc.routines[0].days[0].items[0].rule;
  for (const field of ['itemId', 'target', 'group', 'skipped', 'substituteFor']) delete doc.workouts[0].entries[0][field];
  for (const field of ['kind', 'effort', 'at']) delete doc.workouts[0].entries[0].sets[0][field];
  const clean = normalizeTraining(doc);
  assert.deepEqual(clean.exercises[0], { ...full().exercises[0], rest: null });
  assert.equal(clean.categories[0].weekMin, null);
  assert.equal(clean.routines[0].archived, false);
  assert.deepEqual(clean.routines[0].days[0].weekdays, []);
  assert.equal(clean.routines[0].days[0].items[0].rule, null);
  assert.deepEqual(clean.workouts[0].entries[0], entry({ itemId: null, sets: [set({ at: null })] }));
  assert.equal(clean.exercises[0].rest, null);
  assert.equal(clean.exercises[0].archived, false);
  assert.equal(clean.workouts[0].comment, '');
  assert.equal(clean.workouts[0].finished, null);
});

test('settings out of range fall back to the defaults', () => {
  const doc = full();
  doc.settings = {
    unit: 'stone', rest: 9999, formula: 'lander', effort: 'rpx', plates: { kg: [20, -5], lb: 'x' },
    bar: { kg: 101, lb: -1 }, sex: 'x', measures: [{ id: 'm1', name: 'Waist', unit: 'mm' }], stallAfter: 1,
  };
  assert.deepEqual(normalizeTraining(doc).settings, { ...settings(), rest: 90 });
  assert.deepEqual(normalizeTraining({ ...full(), settings: null }).settings, emptyTraining().settings);
});

test('each setting falls back alone', () => {
  const doc = full();
  doc.settings = { ...settings(), plates: { kg: [20, 10], lb: [] }, bar: { kg: 15, lb: 'x' }, stallAfter: 21, sex: 'female' };
  const clean = normalizeTraining(doc).settings;
  assert.deepEqual(clean.plates, { kg: [20, 10], lb: [] });
  assert.deepEqual(clean.bar, { kg: 15, lb: 45 });
  assert.equal(clean.stallAfter, 4);
  assert.equal(clean.sex, 'female');
});

test('the settings take each value of the design', () => {
  const doc = full();
  doc.settings = {
    ...settings(), formula: 'brzycki', effort: 'rir', sex: 'male', stallAfter: 20, bar: { kg: 0, lb: 100 },
    plates: { kg: [0.25, 100], lb: [45] }, measures: [{ id: 'm1', name: ' Waist ', unit: 'cm' }, { id: 'm2', name: 'Fat', unit: '%' }],
  };
  const clean = normalizeTraining(doc).settings;
  assert.deepEqual(clean, { ...doc.settings, measures: [{ id: 'm1', name: 'Waist', unit: 'cm' }, { id: 'm2', name: 'Fat', unit: '%' }] });
});

test('a list of measures with a bad entry, a duplicate or the id weight is empty', () => {
  for (const measures of [
    [{ id: 'm1', name: 'Waist', unit: 'cm' }, { id: 'm1', name: 'Hips', unit: 'cm' }],
    [{ id: 'm1', name: 'Waist', unit: 'cm' }, { id: 'm2', name: 'waist', unit: 'in' }],
    [{ id: 'weight', name: 'Mass', unit: 'cm' }],
    [{ id: 'm1', name: '', unit: 'cm' }],
    'x',
  ]) {
    assert.deepEqual(withEdit((doc) => { doc.settings.measures = measures; }).settings.measures, [], JSON.stringify(measures));
  }
});

test('the default settings are not shared by two empty docs', () => {
  const doc = emptyTraining();
  doc.settings.plates.kg.push(50);
  doc.settings.measures.push({ id: 'm1' });
  assert.deepEqual(emptyTraining().settings.plates.kg, DEFAULT_SETTINGS.plates.kg);
  assert.deepEqual(emptyTraining().settings.measures, []);
});

test('the six types and their fields (EX-2)', () => {
  assert.deepEqual(TYPES, ['weight_reps', 'reps', 'time', 'distance_time', 'weight_time', 'weight_distance']);
  assert.deepEqual(FIELDS.weight_time, ['weight', 'seconds']);
  assert.deepEqual(FIELDS.weight_distance, ['weight', 'meters']);
  for (const type of TYPES) assert.ok(FIELDS[type], type);
  assert.notEqual(withEdit((doc) => { doc.exercises[0].type = 'weight_distance'; }), null);
});

test('the limits of the new numbers (TRN-4)', () => {
  assert.deepEqual(LIMITS.load, [-1000, 1000, false]);
  assert.deepEqual(LIMITS.weight, [0, 1000, false]);
  assert.deepEqual(LIMITS.rpe, [6, 10, false]);
  assert.deepEqual(LIMITS.rir, [0, 10, true]);
  assert.deepEqual(LIMITS.bodyWeight, [20, 400, false]);
  assert.deepEqual(LIMITS.measure, [0, 1000, false]);
  assert.deepEqual(LIMITS.week, [0, 100, true]);
  assert.deepEqual(LIMITS.stallAfter, [2, 20, true]);
  assert.deepEqual(LIMITS.increment, [0.1, 100, false]);
  assert.deepEqual(LIMITS.bar, [0, 100, false]);
  assert.deepEqual(checkNumber('rpe', '7,5'), { value: 7.5 });
  assert.equal(checkNumber('rir', '2.5').error.key, 'error.numberRange');
  assert.equal(checkNumber('bodyWeight', '19').error.key, 'error.numberRange');
});

test('a category takes a weekly range of working sets', () => {
  const ok = (over) => withEdit((doc) => { Object.assign(doc.categories[0], over); });
  assert.deepEqual(ok({ weekMin: 10, weekMax: 20 }).categories[0], { id: 'c1', name: 'Chest', weekMin: 10, weekMax: 20 });
  assert.equal(ok({ weekMin: 10, weekMax: null }).categories[0].weekMin, 10);
  assert.equal(ok({ weekMin: null, weekMax: 0 }).categories[0].weekMax, 0);
  for (const over of [{ weekMin: 20, weekMax: 10 }, { weekMin: 101 }, { weekMax: 2.5 }, { weekMin: -1 }]) {
    assert.equal(ok(over), null, JSON.stringify(over));
  }
});

test('an exercise takes its defaults, equipment, notes and the unilateral flag', () => {
  const ok = (over) => withEdit((doc) => { Object.assign(doc.exercises[0], over); });
  const over = { increment: 1.25, bar: 15, unit: 'lb', equipment: 'barbell', notes: 'Grip', unilateral: true };
  assert.deepEqual(ok(over).exercises[0], { ...full().exercises[0], ...over });
  assert.equal(ok({ increment: 0.1, bar: 0 }).exercises[0].increment, 0.1);
  for (const bad of [
    { increment: 0 }, { increment: 101 }, { bar: 101 }, { bar: -1 }, { unit: 'st' }, { equipment: 'kettlebell' },
    { notes: 'a'.repeat(501) }, { notes: 5 },
  ]) {
    assert.equal(ok(bad), null, JSON.stringify(bad));
  }
});

test('a routine takes the archive flag and a day its weekdays', () => {
  const ok = (edit) => withEdit(edit);
  assert.equal(ok((doc) => { doc.routines[0].archived = true; }).routines[0].archived, true);
  assert.deepEqual(ok((doc) => { doc.routines[0].days[0].weekdays = [0, 6, 3]; }).routines[0].days[0].weekdays, [0, 6, 3]);
  for (const weekdays of [[7], [-1], [1, 1], [1.5], ['1'], 'x']) {
    assert.equal(ok((doc) => { doc.routines[0].days[0].weekdays = weekdays; }), null, JSON.stringify(weekdays));
  }
});

test('an item takes the three rules of progression', () => {
  const rules = [
    { type: 'linear', failAfter: 3, deload: 10 },
    { type: 'double', failAfter: 1, deload: 0 },
    { type: 'percent', tm: 100, unit: 'kg', step: 2.5, weeks: [[{ pct: 65, reps: 5, amrap: false }, { pct: 85, reps: 5, amrap: true }]] },
  ];
  for (const rule of rules) {
    assert.deepEqual(withEdit((doc) => { doc.routines[0].days[0].items[0].rule = rule; }).routines[0].days[0].items[0].rule, rule);
  }
});

test('a rule with no failAfter or deload takes 3 and 10, an amrap missing reads false', () => {
  const clean = (rule) => withEdit((doc) => { doc.routines[0].days[0].items[0].rule = rule; }).routines[0].days[0].items[0].rule;
  assert.deepEqual(clean({ type: 'linear' }), { type: 'linear', failAfter: 3, deload: 10 });
  assert.deepEqual(clean({ type: 'percent', tm: 0, unit: 'lb', step: 0, weeks: [[{ pct: 1, reps: 1 }]] }).weeks, [[{ pct: 1, reps: 1, amrap: false }]]);
  assert.equal(normalizeTraining({ ...full() }).routines[0].days[0].items[0].rule, null);
});

test('a rule out of its limits is refused', () => {
  const week = (n, over = {}) => Array.from({ length: n }, () => ({ pct: 70, reps: 5, amrap: false, ...over }));
  const percent = (over) => ({ type: 'percent', tm: 100, unit: 'kg', step: 5, weeks: [week(3)], ...over });
  for (const rule of [
    { type: 'wave' },
    'linear',
    { type: 'linear', failAfter: 0 },
    { type: 'linear', failAfter: 11 },
    { type: 'double', deload: 51 },
    { type: 'double', failAfter: 2.5 },
    percent({ tm: 1001 }),
    percent({ tm: null }),
    percent({ unit: 'st' }),
    percent({ step: 101 }),
    percent({ weeks: [] }),
    percent({ weeks: Array.from({ length: 9 }, () => week(1)) }),
    percent({ weeks: [[]] }),
    percent({ weeks: [week(11)] }),
    percent({ weeks: [week(1, { pct: 0 })] }),
    percent({ weeks: [week(1, { pct: 151 })] }),
    percent({ weeks: [week(1, { reps: 0 })] }),
    percent({ weeks: [week(1, { reps: 101 })] }),
    percent({ weeks: [week(1, { amrap: 'yes' })] }),
  ]) {
    assert.equal(withEdit((doc) => { doc.routines[0].days[0].items[0].rule = rule; }), null, JSON.stringify(rule));
  }
  const max = percent({ weeks: Array.from({ length: 8 }, () => week(10)) });
  assert.notEqual(withEdit((doc) => { doc.routines[0].days[0].items[0].rule = max; }), null);
});

test('an entry takes its item, its target snapshot, its group, the skip and the substitute', () => {
  const target = { sets: 3, reps: 8, repsMax: 12, weight: 60, unit: 'kg', rest: 90 };
  const over = { itemId: 'i1', target, group: 'g1', skipped: true, substituteFor: 'e9' };
  assert.deepEqual(withEdit((doc) => { Object.assign(doc.workouts[0].entries[0], over); }).workouts[0].entries[0], entry(over));
  const partial = withEdit((doc) => { doc.workouts[0].entries[0].target = { sets: 2, unit: 'lb' }; });
  assert.deepEqual(partial.workouts[0].entries[0].target, { sets: 2, reps: null, repsMax: null, weight: null, unit: 'lb', rest: null });
  for (const bad of [
    { itemId: '' }, { group: 5 }, { substituteFor: '' },
    { target: { ...target, sets: 0 } }, { target: { ...target, unit: 'st' } }, { target: { ...target, repsMax: 4 } },
    { target: { ...target, weight: -1 } }, { target: 'x' },
  ]) {
    assert.equal(withEdit((doc) => { Object.assign(doc.workouts[0].entries[0], bad); }), null, JSON.stringify(bad));
  }
});

test('a set takes its kind, its effort and the time it was done', () => {
  const ok = (over) => withEdit((doc) => { doc.workouts[0].entries[0].sets[0] = set(over); });
  for (const kind of ['working', 'warmup', 'drop', 'failure']) assert.equal(ok({ kind }).workouts[0].entries[0].sets[0].kind, kind);
  for (const effort of [0, 6.5, 10, null]) assert.equal(ok({ effort }).workouts[0].entries[0].sets[0].effort, effort);
  assert.equal(ok({ at: null }).workouts[0].entries[0].sets[0].at, null);
  assert.equal(ok({ weight: -20 }).workouts[0].entries[0].sets[0].weight, -20);
  assert.equal(ok({ weight: -1000 }).workouts[0].entries[0].sets[0].weight, -1000);
  for (const bad of [{ kind: 'cool' }, { effort: 10.5 }, { effort: -1 }, { effort: 7.3 }, { at: 'later' }, { weight: -1001 }]) {
    assert.equal(ok(bad), null, JSON.stringify(bad));
  }
});

test('a body entry holds the weight or a measure on a date', () => {
  const body = (over = {}) => ({ id: 'b1', date: '2026-10-01', measure: 'weight', value: 80.5, unit: 'kg', ...over });
  const ok = (...bodies) => withEdit((doc) => { doc.bodies = bodies; });
  assert.deepEqual(ok(body(), body({ id: 'b2', measure: 'm1', value: 90, unit: 'cm' })).bodies, [body(), body({ id: 'b2', measure: 'm1', value: 90, unit: 'cm' })]);
  assert.equal(ok(body({ measure: 'gone', value: 0, unit: '%' })).bodies[0].measure, 'gone');
  assert.equal(ok(body({ value: 1000, unit: 'lb' })).bodies[0].value, 1000);
  for (const bad of [
    body({ date: '1 Oct' }), body({ measure: '' }), body({ value: 1001 }), body({ value: -1 }), body({ value: null }),
    body({ unit: 'cm' }), body({ measure: 'm1', unit: 'kg' }), body({ id: '' }),
  ]) {
    assert.equal(ok(bad), null, JSON.stringify(bad));
  }
  assert.equal(ok(body(), body()), null);
});

test('a goal is of an exercise or of the body', () => {
  const goal = (over = {}) => ({
    id: 'g1', kind: 'exercise', exerciseId: 'e1', metric: 'e1rm', weight: 100, unit: 'kg', reps: null, date: null,
    created: '2026-10-01T10:00:00.000Z', ...over,
  });
  const body = { kind: 'body', exerciseId: null, metric: null, reps: null, weight: 75, date: '2027-01-01' };
  const ok = (...goals) => withEdit((doc) => { doc.goals = goals; });
  assert.deepEqual(ok(goal()).goals, [goal()]);
  assert.deepEqual(ok(goal({ metric: 'set', reps: 5 })).goals[0].reps, 5);
  assert.deepEqual(ok(goal(body)).goals, [goal(body)]);
  const missing = goal(body);
  delete missing.date;
  delete missing.exerciseId;
  assert.equal(ok(missing).goals[0].date, null);
  assert.equal(ok(goal({ exerciseId: 'gone' })).goals[0].exerciseId, 'gone');
  for (const bad of [
    goal({ kind: 'mind' }), goal({ exerciseId: null }), goal({ metric: null }), goal({ metric: 'volume' }),
    goal({ metric: 'set', reps: null }), goal({ reps: 5 }), goal({ ...body, metric: 'e1rm' }), goal({ ...body, reps: 5 }),
    goal({ ...body, exerciseId: 'e1' }), goal({ weight: null }), goal({ weight: 1001 }), goal({ unit: 'st' }),
    goal({ date: 'soon' }), goal({ created: 'now' }), goal({ created: undefined }),
  ]) {
    assert.equal(ok(bad), null, JSON.stringify(bad));
  }
});

test('a reference to a missing exercise or category is kept (TRN-5)', () => {
  const doc = full();
  doc.exercises[0].categoryId = 'gone';
  doc.workouts[0].entries[0].exerciseId = 'gone';
  assert.notEqual(normalizeTraining(doc), null);
});

test('checkName trims and refuses blank and long names', () => {
  assert.deepEqual(checkName('  Squat '), { clean: 'Squat' });
  assert.deepEqual(checkName(' '), { error: { key: 'error.nameRequired' } });
  assert.deepEqual(checkName('a'.repeat(MAX_NAME + 1)), { error: { key: 'error.nameTooLong', params: { max: MAX_NAME } } });
});

test('nameTaken ignores case and the entry itself', () => {
  const list = [{ id: 'a', name: 'Squat' }];
  assert.equal(nameTaken(list, 'squat'), true);
  assert.equal(nameTaken(list, 'squat', 'a'), false);
});

test('checkNumber reads a comma, rounds a weight to one decimal and refuses a fraction of reps', () => {
  assert.deepEqual(checkNumber('weight', '62,55'), { value: 62.6 });
  assert.deepEqual(checkNumber('reps', '8'), { value: 8 });
  assert.deepEqual(checkNumber('reps', '8.5'), { error: { key: 'error.numberRange', params: { min: 0, max: 1000 } } });
  assert.deepEqual(checkNumber('reps', ''), { error: { key: 'error.numberRequired' } });
  assert.deepEqual(checkNumber('reps', '', { optional: true }), { value: null });
  assert.deepEqual(checkNumber('rest', 'abc').error.key, 'error.numberRange');
});

test('setUnit and setRest change the settings and leave the input alone', () => {
  const state = emptyTraining();
  assert.equal(setUnit(state, 'lb').state.settings.unit, 'lb');
  assert.equal(setRest(state, '150').state.settings.rest, 150);
  assert.deepEqual(setUnit(state, 'st'), { state, error: { key: 'error.unit' } });
  assert.equal(setRest(state, '601').state, state);
  assert.deepEqual(state, emptyTraining());
});

test('exercises sort by name and routines by creation', () => {
  const state = {
    ...emptyTraining(),
    exercises: [{ id: '2', name: 'squat' }, { id: '1', name: 'Bench' }],
    routines: [{ id: 'b', created: '2026-02-01T00:00:00Z' }, { id: 'a', created: '2026-01-01T00:00:00Z' }],
  };
  assert.deepEqual(sortedExercises(state).map((e) => e.id), ['1', '2']);
  assert.deepEqual(sortedRoutines(state).map((r) => r.id), ['a', 'b']);
});

test('workouts sort newest first by date, then by start', () => {
  const state = {
    ...emptyTraining(),
    workouts: [
      { id: 'a', date: '2026-10-01', started: '2026-10-01T08:00:00Z' },
      { id: 'b', date: '2026-10-02', started: '2026-10-02T08:00:00Z' },
      { id: 'c', date: '2026-10-02', started: '2026-10-02T19:00:00Z' },
    ],
  };
  assert.deepEqual(sortedWorkouts(state).map((w) => w.id), ['c', 'b', 'a']);
});

test('localDate pads the month and the day', () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});
