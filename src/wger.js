import { MAX_NAME } from '#training';

// INT-3: the search of the wger exercise catalog. Pure: the view makes the request.

export const MAX_SUGGESTIONS = 20;

export const searchUrl = (term, lang) =>
  `https://wger.de/api/v2/exercise/search/?term=${encodeURIComponent(term)}&language=${lang === 'es' ? 'es' : 'en'}`;

const text = (value) => (typeof value === 'string' ? value.trim() : '');

// [{ name, category }] from `suggestions[].data`; anything else is dropped.
export const parseSearch = (json) => {
  const suggestions = Array.isArray(json?.suggestions) ? json.suggestions : [];
  const seen = new Set();
  const result = [];
  for (const suggestion of suggestions) {
    const data = suggestion?.data;
    const name = text(data?.name).slice(0, MAX_NAME).trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    result.push({ name, category: text(data.category).slice(0, MAX_NAME).trim() });
    if (result.length === MAX_SUGGESTIONS) break;
  }
  return result;
};

// SCR-15: the category of the doc whose name is `name`, with no regard to case or to the spaces at
// the ends; `null` when none has it.
export const categoryFor = (categories, name) => {
  const wanted = String(name ?? '').trim().toLowerCase();
  if (!wanted) return null;
  return categories.find((c) => c.name.trim().toLowerCase() === wanted) ?? null;
};
