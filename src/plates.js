import { convert } from '#units';

// The plate calculator and the warm-up sets of a barbell (PR-6, PR-7). All weights are in one unit.

const EPSILON = 1e-6;
const tidy = (value) => Math.round(value * 100) / 100;

const WEIGHT_TYPES = ['weight_reps', 'weight_time', 'weight_distance'];

// PR-11: a barbell is an exercise with the `barbell` equipment and a type with a weight.
export const isBarbell = (exercise) => exercise?.equipment === 'barbell' && WEIGHT_TYPES.includes(exercise.type);

// PR-11: the bar of the exercise (in its unit), else the bar of the settings, in `unit`.
export const barOf = (settings, exercise, unit) =>
  exercise?.bar === null || exercise?.bar === undefined ? settings.bar[unit] : tidy(convert(exercise.bar, exercise.unit ?? unit, unit));

// Greedy from the heaviest, with as many pairs as the target needs. Exact when nothing is left.
const greedy = (perSide, plates) => {
  const list = [];
  let left = perSide;
  for (const plate of plates) {
    const count = Math.floor(left / plate + EPSILON);
    for (let i = 0; i < count; i += 1) list.push(plate);
    left -= count * plate;
  }
  return { list, exact: left < EPSILON };
};

// PR-6: the plates of a side for `target`, heaviest first, with the load they make; or, when no
// plates reach it, the nearest reachable loads `{ lower, higher }` (`null` when there is none).
export const platesFor = (target, bar, plates) => {
  if (target < bar) return { lower: null, higher: bar };
  const sorted = [...new Set(plates)].filter((p) => p > 0).sort((a, b) => b - a);
  const perSide = (target - bar) / 2;
  const own = greedy(perSide, sorted);
  if (own.exact) return { plates: own.list, load: tidy(bar + 2 * own.list.reduce((sum, p) => sum + p, 0)) };
  if (!sorted.length) return { lower: bar, higher: null };
  // Scan the multiples of the smallest plate below and above the target for the next reachable load.
  const step = sorted.at(-1);
  const base = Math.floor(perSide / step + EPSILON);
  let lower = bar;
  for (let k = base; k >= 0; k -= 1) {
    if (greedy(k * step, sorted).exact) { lower = tidy(bar + 2 * k * step); break; }
  }
  let higher = null;
  const limit = base + Math.ceil(sorted[0] / step) + 2;
  for (let k = base + 1; k <= limit; k += 1) {
    if (greedy(k * step, sorted).exact) { higher = tidy(bar + 2 * k * step); break; }
  }
  return { lower, higher };
};

// The nearest reachable load at or under `target`, or `null` under the bar.
export const reachableBelow = (target, bar, plates) => {
  const found = platesFor(target, bar, plates);
  return 'load' in found ? found.load : found.lower;
};

const STEPS = [[40, 8], [60, 5], [80, 3]];

// PR-7: the bar for 10 reps, then 40, 60 and 80 % of the working weight for 8, 5 and 3 reps, each rounded
// down to a reachable load. Loads at or under the bar and repeated loads drop out.
export const warmupSets = (working, bar, plates) => {
  if (working === null || working <= bar) return [];
  const sets = [{ weight: bar, reps: 10 }];
  for (const [percent, reps] of STEPS) {
    const weight = reachableBelow(tidy((working * percent) / 100), bar, plates);
    if (weight !== null && weight > bar && !sets.some((s) => s.weight === weight)) sets.push({ weight, reps });
  }
  return sets;
};
