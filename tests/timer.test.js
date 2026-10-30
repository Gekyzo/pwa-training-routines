import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTraining } from '#training';
import { restFor, startTimer, remaining, addTime, normalizeTimer } from '#timer';

const state = {
  ...emptyTraining(),
  settings: { unit: 'kg', rest: 90 },
  exercises: [
    { id: 'e1', name: 'A', categoryId: null, type: 'reps', rest: 60, archived: false },
    { id: 'e2', name: 'B', categoryId: null, type: 'reps', rest: null, archived: false },
  ],
  routines: [{ id: 'r', name: 'R', created: '2026-01-01T00:00:00Z', days: [{ id: 'd', name: 'A', items: [{ id: 'i', exerciseId: 'e1', sets: 3, reps: null, repsMax: null, weight: null, rest: 180 }] }] }],
};

test('the rest is of the item, else of the exercise, else of the settings (TMR-2)', () => {
  assert.equal(restFor(state, { routineId: 'r', dayId: 'd' }, 'e1'), 180);
  assert.equal(restFor(state, { routineId: null, dayId: null }, 'e1'), 60);
  assert.equal(restFor(state, { routineId: null, dayId: null }, 'e2'), 90);
  assert.equal(restFor(state, null, 'gone'), 90);
});

test('the time left counts from the end, and never goes below zero (TMR-1)', () => {
  const timer = startTimer(90, 1000);
  assert.equal(remaining(timer, 1000), 90);
  assert.equal(remaining(timer, 1000 + 45_500), 45);
  assert.equal(remaining(timer, 1000 + 200_000), 0);
  assert.equal(remaining(null, 0), 0);
});

test('time is added and taken, never below now (TMR-3)', () => {
  const timer = startTimer(30, 0);
  assert.equal(remaining(addTime(timer, 15, 0), 0), 45);
  assert.equal(remaining(addTime(timer, -60, 0), 0), 0);
});

test('a stored timer is read back, and anything else is null', () => {
  assert.deepEqual(normalizeTimer({ endsAt: 5, total: 90, x: 1 }), { endsAt: 5, total: 90 });
  assert.equal(normalizeTimer(null), null);
  assert.equal(normalizeTimer({ endsAt: 'a', total: 1 }), null);
});
