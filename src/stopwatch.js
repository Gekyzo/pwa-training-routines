// The stopwatch of a set of a type with seconds (TMR-4, TMR-5). It holds its start as a time, so a
// reload or a locked screen keeps it. It is a state of the device: it does not sync.

const planned = (from) => (Number.isInteger(from) && from > 0 ? from : null);

// `from` is the planned seconds of the set: the stopwatch then counts down from them.
export const start = (setId, now, from = null) => ({ setId, startedAt: now, from: planned(from) });

// The whole seconds since the start, never below zero.
export const elapsed = (watch, now) => Math.max(0, Math.floor((now - watch.startedAt) / 1000));

// The seconds on the screen: the seconds left of a countdown, else the seconds since the start.
export const shown = (watch, now) => (watch.from === null ? elapsed(watch, now) : Math.max(0, watch.from - elapsed(watch, now)));

// True when a countdown reached zero.
export const finished = (watch, now) => watch.from !== null && elapsed(watch, now) >= watch.from;

// The seconds that the set takes at the stop: a countdown gives at most its planned seconds.
export const stop = (watch, now) => (watch.from === null ? elapsed(watch, now) : Math.min(watch.from, elapsed(watch, now)));

// A stored stopwatch, or null.
export const normalizeStopwatch = (data) => {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const { setId, startedAt, from = null } = data;
  if (typeof setId !== 'string' || !setId || !Number.isFinite(startedAt)) return null;
  if (from !== null && planned(from) === null) return null;
  return { setId, startedAt, from };
};
