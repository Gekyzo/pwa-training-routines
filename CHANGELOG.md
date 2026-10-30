# Changelog

User-visible changes, newest first.

## Unreleased

- New art in `icons/source.png`, a kettlebell with a coral stopwatch made with ChatGPT from the prompts of `pwa-icon-prompts-family.md`; `npm run icons` wrote the PNG icons and the logo again (VER-15). The RGB 1254 px image became the 512 px RGBA source: cropped square so the art takes 0.777 of the side, as in pwa-nexus, and lifted by 255/253 so its background is pure white.
- **Delete all data** in Settings › Backup, as in pwa-shopping-list (SET-2): `resetAll` in `src/storage.js` removes each `localStorage` key of the app, `<slug>.*`, and no key of another app of the origin; the page loads again as a new install. With a session the question says that it also logs out (`signedIn` of `src/ui/account.js`). Keys `settings.reset`, `reset.confirm`, `reset.confirmLocal`, `error.resetFailed`.
