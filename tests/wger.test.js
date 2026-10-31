import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchUrl, parseSearch } from '#wger';

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
