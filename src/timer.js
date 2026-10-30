import { findById } from '#training';

// The rest timer (TMR-1). It holds its end as a time, so a reload or a locked screen keeps the time
// that is left. It is a state of the device: it does not sync.

// TMR-2: the rest of the item of the day of the workout, else of the exercise, else of the settings.
export const restFor = (state, workout, exerciseId) => {
  const routine = findById(state.routines, workout?.routineId);
  const day = routine ? findById(routine.days, workout.dayId) : null;
  const item = day?.items.find((i) => i.exerciseId === exerciseId);
  return item?.rest ?? findById(state.exercises, exerciseId)?.rest ?? state.settings.rest;
};

export const startTimer = (seconds, now) => ({ endsAt: now + seconds * 1000, total: seconds });

// The seconds left, never below zero.
export const remaining = (timer, now) => (timer ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000)) : 0);

// TMR-3: 15 s more or less, never below the time of `now`.
export const addTime = (timer, seconds, now) => {
  const endsAt = Math.max(now, timer.endsAt + seconds * 1000);
  return { endsAt, total: Math.max(0, timer.total + seconds) };
};

// A stored timer, or null.
export const normalizeTimer = (data) =>
  data && Number.isFinite(data.endsAt) && Number.isFinite(data.total) && data.total >= 0 ? { endsAt: data.endsAt, total: data.total } : null;
