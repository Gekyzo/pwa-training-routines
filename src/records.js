// The training doc as records, one for each category, exercise, routine and workout and one for
// the settings (SYNC-1), and the diff of two such sets (SYNC-2). Pure: no storage, no clock, no DOM.
import { normalizeTraining } from '#training';

// The kind of a record and the list of the doc that holds its entities. `settings` has no list.
export const LISTS = { category: 'categories', exercise: 'exercises', routine: 'routines', workout: 'workouts' };
export const KINDS = [...Object.keys(LISTS), 'settings'];
export const SETTINGS_KEY = 'settings';

export const recordKey = (kind, key) => `${kind}:${key}`;

const entry = (kind, key, data) => [recordKey(kind, key), { kind, key, data }];

// TRN-3: no order is stored, so a record carries no position and an add sends one record.
export const toRecords = (doc) =>
  new Map([
    ...Object.entries(LISTS).flatMap(([kind, list]) => doc[list].map(({ id, ...data }) => entry(kind, id, data))),
    entry('settings', SETTINGS_KEY, { ...doc.settings }),
  ]);

const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// The raw doc of a set of records, each list in the order of the record ids. The app sorts each
// list when it reads it (TRN-3).
export const rawDoc = (records) => {
  const recs = [...records.values()].sort((a, b) => byKey(recordKey(a.kind, a.key), recordKey(b.kind, b.key)));
  const ofKind = (kind) => recs.filter((rec) => rec.kind === kind).map(({ key, data }) => ({ ...data, id: key }));
  return {
    version: 1,
    settings: records.get(recordKey('settings', SETTINGS_KEY))?.data,
    ...Object.fromEntries(Object.entries(LISTS).map(([kind, list]) => [list, ofKind(kind)])),
  };
};

// A clean doc, or null when the validation refuses the records (TRN-2).
export const fromRecords = (records) => normalizeTraining(rawDoc(records));

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((name) => [name, canonical(value[name])]));
  }
  return value;
};

export const sameData = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

// Deletes first, then upserts, each sorted by record id.
export const diffRecords = (prev, next) => {
  const deletes = [...prev.keys()]
    .filter((id) => !next.has(id))
    .sort(byKey)
    .map((id) => ({ kind: prev.get(id).kind, key: prev.get(id).key, op: 'delete' }));
  const upserts = [...next.keys()]
    .filter((id) => !prev.has(id) || !sameData(prev.get(id).data, next.get(id).data))
    .sort(byKey)
    .map((id) => ({ kind: next.get(id).kind, key: next.get(id).key, op: 'upsert', data: next.get(id).data }));
  return [...deletes, ...upserts];
};
