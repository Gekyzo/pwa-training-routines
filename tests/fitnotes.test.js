import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTraining, normalizeTraining } from '#training';
import { parseFitNotes, previewImport, applyImport } from '#fitnotes';

const HEAD = 'Date,Exercise,Category,Weight (kgs),Reps,Distance,Distance Unit,Time,Comment';
const csv = (...lines) => `${[HEAD, ...lines].join('\r\n')}\r\n`;
const counter = () => { let n = 0; return () => `id${++n}`; };

test('rows parse with quotes, commas, newlines, CRLF and a BOM', () => {
  const { rows } = parseFitNotes(`﻿${csv('2026-01-01,"Press, ""flat""",Chest,60,5,,,,"a\nb"')}`);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    date: '2026-01-01', exercise: 'Press, "flat"', category: 'Chest', weight: 60, unit: 'kg', reps: 5, meters: null, seconds: null, comment: 'a\nb',
  });
});

test('headers: lbs, and Weight with Weight Unit', () => {
  assert.equal(parseFitNotes('Date,Exercise,Category,Weight (lbs),Reps\n2026-01-01,A,,100,5').rows[0].unit, 'lb');
  const { rows } = parseFitNotes('Date,Exercise,Category,Weight,Weight Unit,Reps\n2026-01-01,A,,100,lbs,5\n2026-01-01,B,,50,,5');
  assert.deepEqual(rows.map((r) => r.unit), ['lb', null]);
});

test('time and distance units convert', () => {
  const { rows } = parseFitNotes(csv(
    '2026-01-01,Run,Cardio,,,5,km,25:30,', '2026-01-01,Row,Cardio,,,1,mi,1:02:05,', '2026-01-01,Plank,Core,,,,,90,', '2026-01-01,Sled,,,,10,yd,,', '2026-01-01,Hop,,,,10,,,',
  ));
  assert.deepEqual(rows.map((r) => r.seconds), [1530, 3725, 90, null, null]);
  assert.deepEqual(rows.map((r) => r.meters), [5000, 1609.34, null, 9.14, 10]);
});

test('a file that is not FitNotes is an error', () => {
  for (const bad of ['', 'a,b\n1,2', 'Date,Exercise\n2026-01-01,A']) {
    assert.deepEqual(parseFitNotes(bad), { error: 'error.fitnotesFormat' });
  }
});

test('bad rows are dropped', () => {
  const { rows } = parseFitNotes(csv('nope,A,,1,1,,,,', '2026-01-01,,,1,1,,,,', '2026-01-01,A,,x,1,,,,', '2026-01-01,A,,1,1,,,,'));
  assert.equal(rows.length, 1);
});

const rows = parseFitNotes(csv(
  '2026-01-01,Squat,Legs,100,5,,,,', '2026-01-01,Squat,Legs,100,5,,,,', '2026-01-01,Plank,Core,,,,,60,', '2026-01-02,Run,Cardio,,,5,km,25:00,',
)).rows;

test('preview counts and the types from the filled columns', () => {
  const p = previewImport(emptyTraining(), rows);
  assert.equal(p.workouts, 2);
  assert.equal(p.sets, 4);
  assert.deepEqual(p.newExercises.map((e) => [e.name, e.type]), [['Squat', 'weight_reps'], ['Plank', 'time'], ['Run', 'distance_time']]);
  assert.deepEqual(p.newCategories, ['Legs', 'Core', 'Cardio']);
  assert.deepEqual(p.conflicts, []);
});

test('a type from every column set', () => {
  const p = previewImport(emptyTraining(), parseFitNotes(csv(
    '2026-01-01,Pull,,20,,,,0:30,', '2026-01-01,Carry,,40,,50,m,,', '2026-01-01,Dip,,0,8,,,,',
  )).rows);
  assert.deepEqual(p.newExercises.map((e) => e.type), ['weight_time', 'weight_distance', 'reps']);
});

const held = () => {
  const s = emptyTraining();
  return { ...s, categories: [{ id: 'c', name: 'legs' }], exercises: [{ id: 'sq', name: 'SQUAT', categoryId: 'c', type: 'time', archived: false }] };
};

test('a name of another type is a conflict; the same type reuses the exercise', () => {
  const p = previewImport(held(), rows);
  assert.deepEqual(p.conflicts, [{ name: 'Squat', type: 'weight_reps', existingType: 'time' }]);
  assert.deepEqual(p.newCategories, ['Core', 'Cardio']);
  const same = { ...held(), exercises: [{ ...held().exercises[0], type: 'weight_reps' }] };
  assert.deepEqual(previewImport(same, rows).conflicts, []);
  assert.ok(!previewImport(same, rows).newExercises.some((e) => e.name === 'Squat'));
});

test('apply creates workouts, sets, exercises and categories; the doc stays valid', () => {
  const { state, added } = applyImport(emptyTraining(), rows, {}, counter());
  assert.deepEqual(added, { workouts: 2, sets: 4, exercises: 3, categories: 3 });
  const w = state.workouts.find((x) => x.id === 'fitnotes-2026-01-01');
  assert.equal(w.finished, w.started);
  assert.equal(w.entries.length, 2);
  assert.equal(w.entries[0].sets.length, 2);
  assert.deepEqual(
    { done: w.entries[0].sets[0].done, kind: w.entries[0].sets[0].kind, at: w.entries[0].sets[0].at, unit: w.entries[0].sets[0].unit },
    { done: true, kind: 'working', at: null, unit: 'kg' },
  );
  assert.ok(normalizeTraining(state));
});

test('a second import adds nothing', () => {
  const once = applyImport(emptyTraining(), rows, {}, counter()).state;
  const p = previewImport(once, rows);
  assert.deepEqual([p.workouts, p.sets, p.newExercises.length, p.skippedDates], [0, 0, 0, ['2026-01-01', '2026-01-02']]);
  const twice = applyImport(once, rows, {}, counter());
  assert.equal(twice.state.workouts.length, 2);
  assert.equal(twice.state.exercises.length, 3);
});

test('a conflict maps to an existing exercise or creates the name plus (2), then (3)', () => {
  const mapped = applyImport(held(), rows, { Squat: 'sq' }, counter()).state;
  assert.equal(mapped.exercises.length, 3);
  assert.equal(mapped.workouts[0].entries.find((e) => e.exerciseId === 'sq').sets.length, 2);
  const created = applyImport(held(), rows, { Squat: 'create' }, counter()).state;
  assert.ok(created.exercises.some((e) => e.name === 'Squat (2)' && e.type === 'weight_reps'));
  const unmapped = applyImport({ ...held(), exercises: [...held().exercises, { id: 'x', name: 'squat (2)', type: 'reps' }] }, rows, {}, counter()).state;
  assert.ok(unmapped.exercises.some((e) => e.name === 'Squat (3)'));
});

test('a long name keeps the suffix within 60 characters', () => {
  const name = 'A'.repeat(60);
  const s = { ...emptyTraining(), exercises: [{ id: 'l', name, type: 'time' }] };
  const r = parseFitNotes(csv(`2026-01-01,${name},,10,5,,,,`)).rows;
  const out = applyImport(s, r, {}, counter()).state;
  assert.ok(out.exercises.every((e) => e.name.length <= 60));
  assert.ok(out.exercises.some((e) => e.name.endsWith(' (2)')));
});
