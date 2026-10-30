import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, switchModule, visibleSections } from '#modules';

test('MODULES is routines', () => {
  assert.deepEqual(MODULES, ['routines']);
});

test('visibleSections with no module off is the full navigation', () => {
  assert.deepEqual(visibleSections([]), ['workout', 'routines', 'exercises', 'settings']);
});

test('visibleSections without routines keeps the others', () => {
  assert.deepEqual(visibleSections(['routines']), ['workout', 'exercises', 'settings']);
});

test('visibleSections ignores an unknown id', () => {
  assert.deepEqual(visibleSections(['shops']), ['workout', 'routines', 'exercises', 'settings']);
});

test('switchModule turns a module off and on', () => {
  assert.deepEqual(switchModule([], 'routines', false), ['routines']);
  assert.deepEqual(switchModule(['routines'], 'routines', true), []);
  assert.deepEqual(switchModule([], 'routines', true), []);
});

test('switchModule ignores an unknown id and does not change its input', () => {
  const off = ['routines'];
  assert.deepEqual(switchModule(off, 'shops', false), ['routines']);
  assert.deepEqual(off, ['routines']);
});
