import { test } from 'node:test';
import assert from 'node:assert/strict';
import { start, elapsed, shown, finished, stop, normalizeStopwatch } from '#stopwatch';

const T0 = Date.UTC(2026, 9, 1, 18, 0, 0);

test('a stopwatch counts the whole seconds since its start (TMR-4)', () => {
  const watch = start('s1', T0);
  assert.deepEqual(watch, { setId: 's1', startedAt: T0, from: null });
  assert.equal(elapsed(watch, T0 + 999), 0);
  assert.equal(elapsed(watch, T0 + 61500), 61);
  assert.equal(shown(watch, T0 + 61500), 61);
  assert.equal(finished(watch, T0 + 10 ** 9), false);
  assert.equal(stop(watch, T0 + 61500), 61);
});

test('a clock that goes back gives zero, never less (TMR-4)', () => {
  assert.equal(elapsed(start('s1', T0), T0 - 5000), 0);
});

test('a set with planned seconds counts down and stops at them (TMR-4)', () => {
  const watch = start('s1', T0, 60);
  assert.equal(shown(watch, T0 + 20000), 40);
  assert.equal(finished(watch, T0 + 59000), false);
  assert.equal(finished(watch, T0 + 60000), true);
  assert.equal(shown(watch, T0 + 90000), 0);
  assert.equal(stop(watch, T0 + 45000), 45);
  assert.equal(stop(watch, T0 + 90000), 60);
});

test('a stop before one second gives null, so the set keeps its seconds (TMR-4)', () => {
  assert.equal(stop(start('s1', T0, 60), T0 + 400), null);
  assert.equal(stop(start('s1', T0), T0), null);
});

test('zero or no planned seconds is a stopwatch (TMR-4)', () => {
  assert.equal(start('s1', T0, 0).from, null);
  assert.equal(start('s1', T0, null).from, null);
  assert.equal(start('s1', T0, -5).from, null);
});

test('a stored stopwatch is read back, and anything else is null (TMR-5)', () => {
  assert.deepEqual(normalizeStopwatch({ setId: 's1', startedAt: T0, from: 30 }), { setId: 's1', startedAt: T0, from: 30 });
  assert.deepEqual(normalizeStopwatch({ setId: 's1', startedAt: T0 }), { setId: 's1', startedAt: T0, from: null });
  for (const bad of [null, 'x', [], {}, { setId: '', startedAt: T0 }, { setId: 's1', startedAt: 'now' }, { setId: 's1', startedAt: T0, from: 1.5 }, { setId: 's1', startedAt: T0, from: -1 }]) {
    assert.equal(normalizeStopwatch(bad), null, JSON.stringify(bad));
  }
});
