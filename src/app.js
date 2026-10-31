import { $, ui, storage, t, setRender, render, showToast, hideToast, toastAction, clickGuardUntil } from '#ui/context';
import { bind as bindNav, renderNav } from '#ui/nav';
import { bind as bindSheet, renderSheet, closeSheet } from '#ui/sheet';
import { bind as bindWorkout, renderWorkout, closeStale } from '#ui/workout';
import { bind as bindTimer } from '#ui/timer';
import { bind as bindRoutines, renderRoutines, openRoutineSheet } from '#ui/routines';
import { bind as bindExercises, renderExercises, openExerciseSheet } from '#ui/exercises';
import { bind as bindSettings, applyLanguage, renderSettings } from '#ui/settings';
import { bind as bindInstall, renderInstall } from '#ui/install';
import { readVersion, renderVersion, offerUpdate } from '#ui/update';
import { bind as bindOnboarding, closeOnboarding, turnOnboarding } from '#ui/onboarding';
import { bind as bindWhatsNew, startWhatsNew, isWhatsNewOpen, closeWhatsNew } from '#ui/whatsnew';
import { bind as bindAccount, renderAccount, startAccount, goOnline, isAccountOpen, closeAccount } from '#ui/account';
import { readOAuthReturn } from '#session';

// The return of the Google sign-in (ACC-4): `code`, `state` and `error` leave the URL at once.
const { oauth, clean } = readOAuthReturn(new URL(location.href));
if (oauth) history.replaceState(history.state, '', clean);

const renderAll = () => {
  renderNav();
  $('title').textContent = t(`nav.${ui.view}`);
  renderWorkout();
  renderRoutines();
  renderExercises();
  renderSheet();
  // The add button makes a routine or an exercise, in their sections.
  $('fab').hidden = ui.sheetOpen || !['routines', 'exercises'].includes(ui.view);
  $('settings').hidden = ui.view !== 'settings';
  if (ui.view === 'settings') renderSettings();
  renderVersion();
  renderInstall();
  renderAccount();
};
setRender(renderAll);

bindNav();
bindSheet();
bindWorkout();
bindTimer();
bindRoutines();
bindExercises();
bindSettings();
bindInstall();
bindOnboarding();
bindWhatsNew();
bindAccount();

document.addEventListener(
  'click',
  (event) => {
    if (Date.now() >= clickGuardUntil) return;
    event.preventDefault();
    event.stopPropagation();
  },
  true,
);

document.addEventListener('keydown', (event) => {
  // The account screens cover the app, the walkthrough too. Only Sign in over an open app closes (ACC-2).
  if (isAccountOpen()) {
    if (event.key === 'Escape') closeAccount();
    return;
  }
  if (ui.onboarding !== null) {
    if (event.key === 'Escape') closeOnboarding();
    else if (event.key === 'ArrowRight') turnOnboarding(1);
    else if (event.key === 'ArrowLeft') turnOnboarding(-1);
    return;
  }
  if (event.key !== 'Escape') return;
  if (isWhatsNewOpen()) {
    closeWhatsNew();
    return;
  }
  if (ui.sheetOpen) closeSheet();
  else if (ui.view === 'routines' && ui.routineId !== null) {
    ui.routineId = null;
    render();
  } else if (ui.view === 'exercises' && ui.exerciseId !== null) {
    ui.exerciseId = null;
    render();
  } else if (ui.view === 'workout' && ui.workoutId !== null) {
    ui.workoutId = null;
    render();
  }
});

$('fab').addEventListener('click', () => (ui.view === 'routines' ? openRoutineSheet() : openExerciseSheet()));

$('toast-action').addEventListener('click', () => {
  const action = toastAction;
  hideToast();
  action?.run();
});

// WO-14: a stale open workout closes before applyLanguage renders the start.
closeStale();
applyLanguage();
if (ui.onboarding !== null) $('onboarding-next').focus();
startAccount(oauth);
window.addEventListener('online', goOnline);
if (!storage) showToast(t('error.noStorage'));
navigator.serviceWorker?.register('./sw.js').catch(() => {});
// Read once at the start: the worker answers from the cache, then stores the file of the next deploy.
readVersion('./version.json').then((running) => {
  ui.version.running = running;
  renderVersion();
  startWhatsNew(running);
  navigator.serviceWorker?.ready.then(offerUpdate).catch(() => {});
});
