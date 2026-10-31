import { BODY_WEIGHT } from '#training';

// The body log (BODY-1). Task 7 adds the entries and the measures; this holds the lookup that LOG-9 needs.

// BODY-1: the body weight of a date, `{ value, unit }`: the latest weight entry on or before it. Of two
// entries on one date the later one in the list wins. `null` when there is none.
export const bodyWeightOn = (state, date) => {
  let found = null;
  for (const entry of state.bodies) {
    if (entry.measure !== BODY_WEIGHT || entry.date > date) continue;
    if (!found || entry.date >= found.date) found = entry;
  }
  return found ? { value: found.value, unit: found.unit } : null;
};
