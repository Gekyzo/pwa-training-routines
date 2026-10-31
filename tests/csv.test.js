import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTraining } from '#training';
import { toCsv, csvFilename, COLUMNS } from '#csv';

const set = (id, extra) => ({ id, weight: null, unit: 'kg', reps: null, seconds: null, meters: null, done: true, comment: '', ...extra });
const workout = (id, date, entries) => ({
  id, date, started: `${date}T10:00:00.000Z`, finished: null, routineId: null, dayId: null, routineName: '', dayName: '', comment: '', entries,
});

const state = {
  ...emptyTraining(),
  categories: [{ id: 'c', name: 'Legs' }],
  exercises: [
    { id: 'sq', name: 'Squat', categoryId: 'c', type: 'weight_reps', rest: null, archived: false },
    { id: 'run', name: 'Run, easy', categoryId: null, type: 'distance_time', rest: null, archived: false },
  ],
  workouts: [
    workout('w2', '2026-10-02', [{ id: 'e2', exerciseId: 'run', sets: [set('r', { meters: 5000, seconds: 1530 })] }]),
    workout('w1', '2026-10-01', [
      { id: 'e1', exerciseId: 'sq', sets: [set('a', { weight: 100, reps: 5, comment: 'said "easy"' }), set('b', { weight: 120, reps: 1, done: false })] },
      { id: 'e3', exerciseId: 'gone', sets: [set('g', { reps: 3 })] },
    ]),
  ],
};

test('the CSV has the header, then each done set oldest first (DATA-2)', () => {
  const lines = toCsv(state, { unknown: 'Deleted' }).split('\r\n');
  assert.equal(lines[0], COLUMNS.join(','));
  assert.equal(lines[1], '2026-10-01,Squat,Legs,100,kg,5,,,,"said ""easy"""');
  assert.equal(lines[2], '2026-10-01,Deleted,,,,3,,,,');
  assert.equal(lines[3], '2026-10-02,"Run, easy",,,,,5000,m,25:30,');
  assert.equal(lines[4], '');
  assert.equal(lines.length, 5);
});

test('an empty doc gives the header alone', () => {
  assert.equal(toCsv(emptyTraining()), `${COLUMNS.join(',')}\r\n`);
});

test('the CSV file takes the name of the JSON export', () => {
  assert.equal(csvFilename('app-2026-10-31-101500.json'), 'app-2026-10-31-101500.csv');
});

test('weight_time and weight_distance sets write weight with time or distance (DATA-2)', () => {
  const doc = {
    ...emptyTraining(),
    exercises: [
      { id: 'h', name: 'Hold', categoryId: null, type: 'weight_time', rest: null, archived: false },
      { id: 'c', name: 'Carry', categoryId: null, type: 'weight_distance', rest: null, archived: false },
    ],
    workouts: [workout('w1', '2026-10-01', [
      { id: 'e1', exerciseId: 'h', sets: [set('a', { weight: 20, seconds: 75 })] },
      { id: 'e2', exerciseId: 'c', sets: [set('b', { weight: 40, meters: 30 })] },
    ])],
  };
  const lines = toCsv(doc).split('\r\n');
  assert.equal(lines[1], '2026-10-01,Hold,,20,kg,,,,1:15,');
  assert.equal(lines[2], '2026-10-01,Carry,,40,kg,,30,m,,');
});
