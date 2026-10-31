import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchUrl, parseSearch, categoryFor } from '#wger';

test('the URL encodes the term and keeps en or es', () => {
  assert.equal(searchUrl('bench press', 'es'), 'https://wger.de/api/v2/exercise/search/?term=bench%20press&language=es');
  assert.equal(searchUrl('a&b', 'en'), 'https://wger.de/api/v2/exercise/search/?term=a%26b&language=en');
  assert.match(searchUrl('x', 'fr'), /language=en$/);
});

test('the suggestions give name and category, with no duplicate', () => {
  const json = { suggestions: [
    { value: 'x', data: { name: 'Squat', category: 'Legs' } },
    { data: { name: 'squat', category: 'Legs' } },
    { data: { name: ' Curl ', category: 'Arms' } },
  ] };
  assert.deepEqual(parseSearch(json), [{ name: 'Squat', category: 'Legs' }, { name: 'Curl', category: 'Arms' }]);
});

test('at most 20 suggestions', () => {
  const suggestions = Array.from({ length: 30 }, (_, i) => ({ data: { name: `E${i}`, category: 'c' } }));
  assert.equal(parseSearch({ suggestions }).length, 20);
});

test('garbage gives an empty list', () => {
  for (const bad of [null, undefined, 5, 'x', {}, { suggestions: 'x' }, { suggestions: [null, 1, {}, { data: null }, { data: { name: 3 } }] }]) {
    assert.deepEqual(parseSearch(bad), []);
  }
  assert.deepEqual(parseSearch({ suggestions: [{ data: { name: 'A' } }] }), [{ name: 'A', category: '' }]);
});

test('a long name is cut to 60 characters', () => {
  assert.equal(parseSearch({ suggestions: [{ data: { name: 'N'.repeat(100), category: 'c' } }] })[0].name.length, 60);
});

test('categoryFor finds the category of the name with no regard to case or spaces', () => {
  const categories = [{ id: 'c1', name: 'Chest' }, { id: 'c2', name: ' Legs ' }];
  assert.equal(categoryFor(categories, 'chest').id, 'c1');
  assert.equal(categoryFor(categories, 'LEGS').id, 'c2');
  assert.equal(categoryFor(categories, 'Pecs'), null);
  assert.equal(categoryFor(categories, ''), null);
  assert.equal(categoryFor([], 'Chest'), null);
});
