import { cleanRule, checkNumber, findById, sortedWorkouts, MAX_RULE_WEEKS, MAX_RULE_SETS } from '#training';
import { reachableBelow, barOf } from '#plates';
import { convert, toKg } from '#units';

// Progression: the rule of an item and its next target, derived from the history at each read and
// never stored (PRG-1 to PRG-5).

export const DEFAULT_INCREMENT = Object.freeze({ kg: 2.5, lb: 5 });
// A weight typed from the text of another unit is one decimal off; it still reaches the target.
const TOLERANCE_KG = 0.05;

const tidy = (value) => Math.round(value * 100) / 100;

const locate = (state, routineId, dayId, itemId) => {
  const routine = findById(state.routines, routineId);
  if (!routine) return { error: { key: 'error.routineMissing' } };
  const day = findById(routine.days, dayId);
  if (!day) return { error: { key: 'error.dayMissing' } };
  const item = findById(day.items, itemId);
  if (!item) return { error: { key: 'error.itemMissing' } };
  return { routine, day, item };
};

// PRG-1: the rule of an item, `null` for none (`error.rule` when it is not valid).
export const setRule = (state, routineId, dayId, itemId, rule) => {
  const { error } = locate(state, routineId, dayId, itemId);
  if (error) return { state, error };
  const clean = cleanRule(rule);
  if (clean === undefined) return { state, error: { key: 'error.rule' } };
  const items = (list) => list.map((i) => (i.id === itemId ? { ...i, rule: clean } : i));
  const days = (list) => list.map((d) => (d.id === dayId ? { ...d, items: items(d.items) } : d));
  return { state: { ...state, routines: state.routines.map((r) => (r.id === routineId ? { ...r, days: days(r.days) } : r)) } };
};

// SCR-12: the weeks of 5/3/1: 65/75/85+, 70/80/90+, 75/85/95+ and the deload week 40/50/60.
const week = (pcts, reps, amrap) => pcts.map((pct, index) => ({ pct, reps: reps[index], amrap: amrap && index === pcts.length - 1 }));
export const PRESET_531 = [
  week([65, 75, 85], [5, 5, 5], true),
  week([70, 80, 90], [3, 3, 3], true),
  week([75, 85, 95], [5, 3, 1], true),
  week([40, 50, 60], [5, 5, 5], false),
];

// SCR-12: the weeks of a percent rule as text: one line a week, `65×5, 75×5, 85×5+` (`+` is AMRAP).
export const weeksText = (weeks) => weeks.map((sets) => sets.map((s) => `${s.pct}×${s.reps}${s.amrap ? '+' : ''}`).join(', ')).join('\n');

const SET = String.raw`(\d+(?:[.,]\d+)?)\s*%?\s*[x×*]\s*(\d+)\s*(\+?)`;
const LINE = new RegExp(`^${SET}(?:\\s*[,;]\\s*${SET})*$`, 'i');
const SETS = new RegExp(SET, 'gi');

// SCR-12: the weeks of `weeksText`. A set is `<pct>[%] x|×|* <reps>[+]`; a comma or a semicolon parts
// the sets of a line. The reps are whole, so a comma inside a percent (`62,5x5`) is a decimal.
// Empty lines are skipped. Anything else is `error.ruleWeeks`.
export const parseWeeks = (text) => {
  const bad = { error: { key: 'error.ruleWeeks' } };
  const lines = String(text ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length || lines.length > MAX_RULE_WEEKS) return bad;
  const weeks = [];
  for (const line of lines) {
    if (!LINE.test(line)) return bad;
    const sets = [];
    for (const [, pctText, repsText, plus] of line.matchAll(SETS)) {
      const pct = checkNumber('pct', pctText);
      const reps = checkNumber('pctReps', repsText);
      if (pct.error || reps.error) return bad;
      sets.push({ pct: pct.value, reps: reps.value, amrap: plus === '+' });
    }
    if (sets.length > MAX_RULE_SETS) return bad;
    weeks.push(sets);
  }
  return { weeks };
};

// SCR-12: the rule of the fields of the item sheet, all text: `type` '' is no rule. A percent rule
// takes `unit`. An empty `failAfter` or `deload` takes its default, an empty `step` is 0.
export const ruleFromInput = ({ type, failAfter = '', deload = '', tm = '', step = '', weeks = '' }, unit) => {
  if (!type) return { rule: null };
  const numbers = {};
  const fields = type === 'percent' ? [['tm', tm, false], ['step', step, true]] : [['failAfter', failAfter, true], ['deload', deload, true]];
  for (const [key, value, optional] of fields) {
    const result = checkNumber(key, value, { optional });
    if (result.error) return { error: result.error };
    numbers[key] = result.value;
  }
  let draft;
  if (type === 'percent') {
    const parsed = parseWeeks(weeks);
    if (parsed.error) return parsed;
    draft = { type, tm: numbers.tm, unit, step: numbers.step ?? 0, weeks: parsed.weeks };
  } else draft = { type, failAfter: numbers.failAfter ?? 3, deload: numbers.deload ?? 10 };
  const rule = cleanRule(draft);
  return rule ? { rule } : { error: { key: 'error.rule' } };
};

// The increment of an exercise in `unit`: its own, in its unit, else 2.5 kg or 5 lb.
export const incrementOf = (exercise, unit) =>
  exercise?.increment ? convert(exercise.increment, exercise.unit ?? unit, unit) : DEFAULT_INCREMENT[unit];

// PR-6, PR-10: a barbell target rounds down to a load the plates reach, with the bar of the exercise
// (in its unit) or of the settings. `null` when it is no barbell, has no plates, or lies under the bar.
const platesLoad = (state, exercise, weight, unit) => {
  const plates = state.settings.plates[unit];
  if (exercise?.equipment !== 'barbell' || !plates.length) return null;
  return reachableBelow(weight, barOf(state.settings, exercise, unit), plates);
};

// A weight of a target, from 0 to 1000: a barbell target rounds down to the plates (PR-6); another
// one to the increment when the increment is in `unit`, else it keeps one decimal (a floor in another
// unit would undo the increment).
export const roundLoad = (state, exercise, weight, unit) => {
  if (weight === null) return null;
  const reached = platesLoad(state, exercise, weight, unit);
  if (reached !== null) return Math.min(reached, 1000);
  const foreign = Boolean(exercise?.increment) && (exercise.unit ?? unit) !== unit;
  const step = incrementOf(exercise, unit);
  const value = foreign ? Math.round(weight * 10) / 10 : tidy(Math.floor(weight / step + 1e-9) * step);
  return Math.min(Math.max(value, 0), 1000);
};

// The finished sessions of an item, oldest first: its entries of its exercise that are not skipped.
// A substitute does not count.
export const itemHistory = (state, item) =>
  sortedWorkouts(state)
    .filter((w) => w.finished !== null)
    .reverse()
    .flatMap((w) => w.entries.filter((e) => e.itemId === item.id && e.exerciseId === item.exerciseId && !e.skipped));

// LOG-5: warm-up sets do not count for progression.
const counted = (entry) => entry.sets.filter((s) => s.done && s.kind !== 'warmup');

const ownTarget = (state, item) => ({
  sets: item.sets, reps: item.reps, repsMax: item.repsMax, weight: item.weight, unit: state.settings.unit, rest: item.rest,
});

// The first session: the weight of the item as it is, else the heaviest counted set of the newest
// finished workout of the exercise, rounded.
const firstWeight = (state, exercise, item, unit) => {
  if (item.weight !== null) return item.weight;
  for (const workout of sortedWorkouts(state).filter((w) => w.finished !== null)) {
    const weights = workout.entries
      .filter((e) => e.exerciseId === item.exerciseId)
      .flatMap((e) => counted(e).filter((s) => s.weight !== null).map((s) => convert(s.weight, s.unit, unit)));
    if (weights.length) return roundLoad(state, exercise, Math.max(...weights), unit);
  }
  return null;
};

// A session against its target: every target set has a done set with `need` reps at the target weight.
const outcome = (entry, target, need, unit) => {
  const sets = counted(entry).slice(0, target.sets);
  const heavy = (s) => target.weight === null || toKg(s.weight ?? 0, s.unit) >= toKg(target.weight, target.unit) - TOLERANCE_KG;
  const success = sets.length === target.sets && sets.every((s) => (s.reps ?? 0) >= (need ?? 0) && heavy(s));
  const weights = sets.filter((s) => s.weight !== null).map((s) => convert(s.weight, s.unit, unit));
  return { success, sets, done: weights.length ? Math.min(...weights) : null };
};

// PRG-1 to PRG-3: linear and double progression.
const progress = (state, item, exercise, rule, unit) => {
  const history = itemHistory(state, item);
  const round = (weight) => roundLoad(state, exercise, weight, unit);
  if (history.length === 0) return { weight: firstWeight(state, exercise, item, unit), plan: null, failures: 0 };
  const topOf = (target) => (rule.type === 'double' ? target.repsMax ?? target.reps : target.reps);
  let failures = 0;
  let deload = false;
  let last = null;
  for (const entry of history) {
    const target = entry.target ?? ownTarget(state, item);
    last = { target, ...outcome(entry, target, topOf(target), unit) };
    failures = last.success ? 0 : failures + 1;
    // PRG-3: `failAfter` failures in a row deload, and the count restarts.
    deload = failures >= rule.failAfter;
    if (deload) failures = 0;
  }
  const { target, success, sets, done } = last;
  const kept = target.weight !== null ? convert(target.weight, target.unit, unit) : done;
  if (success) return { weight: done === null ? null : round(done + incrementOf(exercise, unit)), plan: null, failures };
  if (deload) return { weight: kept === null ? null : round(kept * (1 - rule.deload / 100)), plan: null, failures };
  const weight = kept === null ? null : round(kept);
  const top = item.repsMax ?? item.reps;
  if (rule.type !== 'double' || top === null) return { weight, plan: null, failures };
  // PRG-2: each set plans one rep more than it did, up to the top; a set not done plans the reps.
  const plan = Array.from({ length: item.sets }, (_, index) => ({
    weight, reps: sets[index] ? Math.min(top, (sets[index].reps ?? 0) + 1) : item.reps, amrap: false,
  }));
  return { weight, plan, failures };
};

// PRG-5: the week is the sessions done mod the weeks; each full cycle adds `step` to the training max.
const percent = (state, item, exercise, rule) => {
  const sessions = itemHistory(state, item).length;
  const week = sessions % rule.weeks.length;
  const tm = tidy(rule.tm + Math.floor(sessions / rule.weeks.length) * rule.step);
  const plan = rule.weeks[week].map((s) => ({ weight: roundLoad(state, exercise, (tm * s.pct) / 100, rule.unit), reps: s.reps, amrap: s.amrap }));
  const top = plan.at(-1);
  return {
    sets: plan.length, reps: top.reps, repsMax: null, weight: top.weight, unit: rule.unit, rest: item.rest,
    plan, state: { failures: null, week, tm },
  };
};

// The next target of an item: its own targets with no rule, else the targets of its rule. `plan`
// gives each set its weight and reps when they differ; `state` is what the screen shows of the rule.
export const nextTarget = (state, routineId, dayId, itemId) => {
  const { item, error } = locate(state, routineId, dayId, itemId);
  if (error) return null;
  const own = ownTarget(state, item);
  const { rule } = item;
  if (!rule) return { ...own, plan: null, state: { failures: null, week: null, tm: null } };
  const exercise = findById(state.exercises, item.exerciseId);
  if (rule.type === 'percent') return percent(state, item, exercise, rule);
  const { weight, plan, failures } = progress(state, item, exercise, rule, own.unit);
  return { ...own, weight, plan, state: { failures, week: null, tm: null } };
};

// SCR-8: the ids of the sets of an open workout from a day that the plan of a percent rule marks
// AMRAP (PRG-5). The plan is read now, so it is live: the n-th set that is not a warm-up takes the
// n-th set of the plan. One read of the plan for each exercise.
export const amrapSets = (state, workout) => {
  const ids = new Set();
  if (workout.finished !== null || !workout.routineId) return ids;
  for (const entry of workout.entries) {
    if (!entry.itemId) continue;
    const plan = nextTarget(state, workout.routineId, workout.dayId, entry.itemId)?.plan;
    if (!plan) continue;
    entry.sets.filter((s) => s.kind !== 'warmup').forEach((s, index) => {
      if (plan[index]?.amrap) ids.add(s.id);
    });
  }
  return ids;
};

// PRG-6: what the screen shows of the next target of an item with a rule: its weight and unit, its
// reps as text (each set of a double plan `12/11/10`, the last set of a percent week with `+` for
// AMRAP, else the reps or the range `5–8`), and the week from 1 for a percent rule. `null` with no
// rule, no item or no weight.
export const nextSummary = (state, routineId, dayId, itemId) => {
  const { item, error } = locate(state, routineId, dayId, itemId);
  if (error || !item.rule) return null;
  const next = nextTarget(state, routineId, dayId, itemId);
  if (next.weight === null) return null;
  const repsOf = (s) => `${s.reps}${s.amrap ? '+' : ''}`;
  const percent = item.rule.type === 'percent';
  let reps;
  if (percent) reps = repsOf(next.plan.at(-1));
  else if (next.plan) reps = next.plan.map(repsOf).join('/');
  else if (next.reps === null) reps = null;
  else reps = next.repsMax === null ? String(next.reps) : `${next.reps}–${next.repsMax}`;
  return { type: item.rule.type, weight: next.weight, unit: next.unit, reps, week: percent ? next.state.week + 1 : null };
};
