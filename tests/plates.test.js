import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platesFor, warmupSets } from '#plates';

const KG = [25, 20, 15, 10, 5, 2.5, 1.25];
const LB = [45, 35, 25, 10, 5, 2.5];

test('platesFor gives the plates of a side, heaviest first (PR-6)', () => {
  assert.deepEqual(platesFor(100, 20, KG), { plates: [25, 15], load: 100 });
  assert.deepEqual(platesFor(142.5, 20, KG), { plates: [25, 25, 10, 1.25], load: 142.5 });
  assert.deepEqual(platesFor(225, 45, LB), { plates: [45, 45], load: 225 });
});

test('platesFor of the bar alone has no plates', () => {
  assert.deepEqual(platesFor(20, 20, KG), { plates: [], load: 20 });
});

test('platesFor of an unreachable target gives the loads around it', () => {
  assert.deepEqual(platesFor(101, 20, KG), { lower: 100, higher: 102.5 });
  assert.deepEqual(platesFor(20.5, 20, KG), { lower: 20, higher: 22.5 });
});

test('platesFor below the bar gives the bar as the higher load', () => {
  assert.deepEqual(platesFor(15, 20, KG), { lower: null, higher: 20 });
});

test('platesFor finds a higher load with plates that do not make every step', () => {
  // Only 10 kg plates: reachable loads are 20, 40, 60, ...
  assert.deepEqual(platesFor(45, 20, [10]), { lower: 40, higher: 60 });
});

test('platesFor with no plates reaches the bar only', () => {
  assert.deepEqual(platesFor(60, 20, []), { lower: 20, higher: null });
  assert.deepEqual(platesFor(20, 20, []), { plates: [], load: 20 });
});

test('platesFor handles decimals without drift', () => {
  assert.deepEqual(platesFor(52.5, 20, KG), { plates: [15, 1.25], load: 52.5 });
});

test('warmupSets: the bar, then 40, 60 and 80 % rounded down (PR-7)', () => {
  assert.deepEqual(warmupSets(100, 20, KG), [
    { weight: 20, reps: 10 }, { weight: 40, reps: 8 }, { weight: 60, reps: 5 }, { weight: 80, reps: 3 },
  ]);
  assert.deepEqual(warmupSets(105, 20, KG).map((s) => s.weight), [20, 40, 62.5, 82.5]);
});

test('warmupSets drops loads at or under the bar and duplicates', () => {
  // 40 % of 45 is 18, 60 % is 27 -> 27.5 not reachable, rounds to 25 (bar 20 + 2 x 2.5), 80 % is 36 -> 35.
  assert.deepEqual(warmupSets(45, 20, KG).map((s) => s.weight), [20, 25, 35]);
  // 40 % and 60 % of 50 round to 20 and 30: the first is the bar.
  assert.deepEqual(warmupSets(50, 20, KG).map((s) => s.weight), [20, 30, 40]);
  // Both 40 % and 60 % of 33 (13.2, 19.8) are under the bar.
  assert.deepEqual(warmupSets(33, 20, KG).map((s) => s.weight), [20, 25]);
});

test('warmupSets of a working weight at or under the bar is empty', () => {
  assert.deepEqual(warmupSets(20, 20, KG), []);
  assert.deepEqual(warmupSets(0, 20, KG), []);
  assert.deepEqual(warmupSets(null, 20, KG), []);
});
