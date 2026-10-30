# Changelog

User-visible changes, newest first.

## Unreleased

- The routines replace the notes demo (07-training): `src/training.js` holds the doc `pwa-training-routines.training` (settings, categories, exercises, routines, workouts; no stored order), with `src/exercises.js`, `src/routines.js`, `src/workouts.js`, `src/bests.js`, `src/units.js`, `src/timer.js` and `src/csv.js` as pure modules. Three sections, Workout, Routines and Exercises (SCR-1 to SCR-6): a day of a routine starts a workout of planned sets, each new set copies the values of the last time (WO-8), a done set starts the rest timer (TMR-1), and Exercises shows the records (PR-1) and the history (WO-10) of each exercise. **Add common exercises** seeds 29 exercises with fixed ids (EX-4). Settings gains the weight unit, the default rest, **Export CSV** (DATA-2) and an export offer before **Delete all data** (DATA-6). The drag, swipe and motion modules go with the demo; the cache goes to `v2` (SW-10).
- Sync with the account (09-sync): a signed-in, approved device sends each change to the `training_records` collection of `pwa-server` and pulls the changes of the other devices, with a queue that waits offline, the realtime stream and the retry series of pwa-shopping-list, with no shares (`src/records.js`, `src/sync.js`, `src/syncer.js`, the records API of `src/pocketbase.js`). The first login of a device merges; another user clears first; Log out sends the queue first (ACC-11 to ACC-13).
- What's new shows the text between two `**` of a note in bold (VER-22): `textParts` of `src/onboarding.js` gives such a part `strong: true`, also for a key inside it, and `src/ui/whatsnew.js` wraps it in a `<strong>`. A `**` with no pair stays as text.

## 0.1.1 - 2026-10-30

- First release, from pwa-template 0.1.3: offline shell, install, update toast, What's new, Google or offline account, English and Spanish, light and dark themes. The notes demo stands in for the routines. The release notes start with this version; the template's 0.1.2 and 0.1.3 entries, which this app never shipped, go.
- New art in `icons/source.png`, a kettlebell with a coral stopwatch made with ChatGPT from the prompts of `pwa-icon-prompts-family.md`; `npm run icons` wrote the PNG icons and the logo again (VER-15). The RGB 1254 px image became the 512 px RGBA source: cropped square so the art takes 0.777 of the side, as in pwa-nexus, and lifted by 255/253 so its background is pure white.
- **Delete all data** in Settings › Backup, as in pwa-shopping-list (SET-2): `resetAll` in `src/storage.js` removes each `localStorage` key of the app, `<slug>.*`, and no key of another app of the origin; the page loads again as a new install. With a session the question says that it also logs out (`signedIn` of `src/ui/account.js`). Keys `settings.reset`, `reset.confirm`, `reset.confirmLocal`, `error.resetFailed`.
