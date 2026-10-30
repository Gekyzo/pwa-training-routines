import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert, toKg, shownWeight, clock, KG_PER_LB } from '#units';

test('a weight converts between kg and lb, and the same unit returns it as it is', () => {
  assert.equal(convert(100, 'kg', 'kg'), 100);
  assert.equal(convert(1, 'lb', 'kg'), KG_PER_LB);
  assert.ok(Math.abs(convert(KG_PER_LB, 'kg', 'lb') - 1) < 1e-12);
  assert.equal(toKg(null, 'lb'), null);
});

test('a shown weight is rounded to one decimal (PR-8)', () => {
  assert.equal(shownWeight(100, 'kg', 'lb'), 220.5);
  assert.equal(shownWeight(225, 'lb', 'kg'), 102.1);
  assert.equal(shownWeight(null, 'kg', 'lb'), null);
});

test('clock shows minutes and seconds, and hours when there are', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(90), '1:30');
  assert.equal(clock(3725), '1:02:05');
  assert.equal(clock(-5), '0:00');
});
