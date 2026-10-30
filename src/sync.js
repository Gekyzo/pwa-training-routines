// The queue of record changes, the merge of pulled records, the check of each record and the
// duplicate names (SYNC-5 to SYNC-7). Pure: no storage, no clock, no DOM. Every function returns new
// values and leaves its inputs alone.
import { recordKey, rawDoc, KINDS, SETTINGS_KEY } from '#records';
import { normalizeTraining } from '#training';

const changeKey = (change) => recordKey(change.kind, change.key);

// One entry for each record: a later change replaces an earlier one and moves to the end.
export const enqueue = (queue, changes) => {
  const latest = new Map();
  for (const change of [...queue, ...changes]) {
    latest.delete(changeKey(change));
    latest.set(changeKey(change), change);
  }
  return [...latest.values()];
};

const plain = ({ kind, key, data }) => ({ kind, key, data });

// SYNC-5: a queued change wins over a pulled record. SYNC-6: a pulled record with `deleted` removes the record.
export const mergePulled = ({ local, server, queue, pulled }) => {
  const queued = new Set(queue.map(changeKey));
  const nextLocal = new Map(local);
  const nextServer = new Map(server);
  for (const rec of pulled) {
    const id = recordKey(rec.kind, rec.key);
    nextServer.set(id, rec);
    if (queued.has(id)) continue;
    if (rec.deleted) nextLocal.delete(id);
    else nextLocal.set(id, plain(rec));
  }
  return { local: nextLocal, server: nextServer };
};

// SYNC-7: a record is valid when a doc that holds it alone, with empty other lists, is valid. A
// reference to an entity that the doc does not hold is valid (TRN-5).
export const validRecord = (rec) => {
  if (!KINDS.includes(rec?.kind) || typeof rec.key !== 'string') return false;
  if (rec.kind === 'settings') return rec.key === SETTINGS_KEY;
  return normalizeTraining(rawDoc(new Map([[recordKey(rec.kind, rec.key), rec]]))) !== null;
};

// SYNC-7: each record is checked alone, so one bad record never empties the doc. `dropped` holds
// the record ids of the records that the check refused.
export const checkRecords = (records) => {
  const local = new Map();
  const dropped = [];
  for (const [id, rec] of records) {
    if (validRecord(rec)) local.set(id, rec);
    else dropped.push(id);
  }
  return { local, dropped };
};

// The kinds whose names are unique, with no regard to case (TRN-2).
const NAMED = ['category', 'exercise', 'routine'];

// The same comparison as the validation, which trims the name first.
const nameOf = (rec) => rec.data.name.trim().toLowerCase();

// Greater than any `updated` text: a record that is not on the server yet counts as the newest.
const NOT_ON_SERVER = '￿';

// Equal ages: the greater record id wins.
const newer = (a, b, server) => {
  const ageA = server.get(recordKey(a.kind, a.key))?.updated ?? NOT_ON_SERVER;
  const ageB = server.get(recordKey(b.kind, b.key))?.updated ?? NOT_ON_SERVER;
  if (ageA !== ageB) return ageA > ageB ? a : b;
  return recordKey(a.kind, a.key) > recordKey(b.kind, b.key) ? a : b;
};

// SYNC-7: of two valid records of one named kind with one name the newer stays; `removed` holds a
// delete for each loser, so the tombstone reaches the other devices.
export const dedupe = (local, server) => {
  const nextLocal = new Map(local);
  const removed = [];
  for (const kind of NAMED) {
    const winners = new Map();
    const ofKind = [...local.values()].filter((rec) => rec.kind === kind).sort((a, b) => (a.key < b.key ? -1 : 1));
    for (const rec of ofKind) {
      const name = nameOf(rec);
      const other = winners.get(name);
      const winner = other ? newer(other, rec, server) : rec;
      if (other) {
        const loser = winner === rec ? other : rec;
        nextLocal.delete(recordKey(kind, loser.key));
        removed.push({ kind, key: loser.key, op: 'delete' });
      }
      winners.set(name, winner);
    }
  }
  return { local: nextLocal, removed };
};

// The greatest `updated` of the pulled records, or `previous` (SYNC-4).
export const cursorOf = (pulled, previous) =>
  pulled.reduce((greatest, rec) => (rec.updated > greatest ? rec.updated : greatest), previous);
