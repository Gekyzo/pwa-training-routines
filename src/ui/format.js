// The text of the numbers of the domain: weights, sets, targets, dates and rests.
import { findById } from '#training';
import { shownWeight, clock } from '#units';
import { state, lang, t } from '#ui/context';

const number = (value) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(value);

// PR-8: a weight in the unit of the settings.
export const weightText = (weight, unit) => `${number(shownWeight(weight, unit, state.settings.unit))} ${state.settings.unit}`;

export const typeOf = (exerciseId) => findById(state.exercises, exerciseId)?.type ?? 'weight_reps';

export const exerciseName = (exerciseId) => findById(state.exercises, exerciseId)?.name ?? t('exercise.unknown');

const distance = (meters) => (meters >= 1000 ? `${number(meters / 1000)} km` : `${number(meters)} m`);

// One set as text, by the type of its exercise.
export const setText = (set, type) => {
  if (type === 'reps') return t('set.reps', { reps: set.reps ?? 0 });
  if (type === 'time') return clock(set.seconds ?? 0);
  if (type === 'distance_time') return [set.meters === null ? null : distance(set.meters), set.seconds === null ? null : clock(set.seconds)].filter(Boolean).join(' · ');
  const reps = set.reps ?? 0;
  return set.weight === null ? t('set.reps', { reps }) : `${weightText(set.weight, set.unit)} × ${reps}`;
};

// The target of an item of a day: `3 × 8–12 · 60 kg · 1:30`.
export const targetText = (item) => {
  const reps = item.reps === null ? '' : item.repsMax === null ? ` × ${item.reps}` : ` × ${item.reps}–${item.repsMax}`;
  const parts = [`${item.sets}${reps}`];
  if (item.weight !== null) parts.push(weightText(item.weight, state.settings.unit));
  if (item.rest !== null) parts.push(clock(item.rest));
  return parts.join(' · ');
};

// A local date `YYYY-MM-DD` as a long date of the language.
export const dateText = (date) =>
  new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`));

export const typeName = (type) => t(`type.${type}`);

export { clock };
