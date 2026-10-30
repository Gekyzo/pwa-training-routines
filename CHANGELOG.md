# Changelog

User-visible changes, newest first.

## Unreleased

- **Delete all data** in Settings › Backup, as in pwa-shopping-list (SET-2): `resetAll` in `src/storage.js` removes each `localStorage` key of the app, `<slug>.*`, and no key of another app of the origin; the page loads again as a new install. With a session the question says that it also logs out (`signedIn` of `src/ui/account.js`). Keys `settings.reset`, `reset.confirm`, `reset.confirmLocal`, `error.resetFailed`.
