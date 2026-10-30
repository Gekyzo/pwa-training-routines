import { normalizeTraining, setUnit, setRest, UNITS } from '#training';
import { toCsv, csvFilename } from '#csv';
import { clock } from '#units';
import { exportJson, exportFilename, importJson, resetAll } from '#storage';
import { LANGUAGES, LANGUAGE_NAMES } from '#i18n';
import { switchModule } from '#modules';
import {
  $,
  el,
  state,
  storage,
  t,
  lang,
  chosen,
  hand,
  theme,
  off,
  isOn,
  textOf,
  showToast,
  apply,
  render,
  setLanguage,
  setHand,
  setTheme,
  setModules,
  setNavMotion,
} from '#ui/context';
import { runUpdate } from '#ui/update';
import { renderOnboarding } from '#ui/onboarding';
import { signedIn, resetSync } from '#ui/account';
import { download } from '#ui/controls';

// The value of a row of Preferences is the text of the option that its select has.
const renderValues = () => {
  for (const id of ['language', 'hand', 'theme', 'unit', 'rest']) {
    $(`${id}-value`).textContent = $(id).selectedOptions[0]?.textContent ?? '';
  }
};

// The rests that Settings offers: every 15 s up to 5 min, and the stored one.
const RESTS = Array.from({ length: 20 }, (_, i) => (i + 1) * 15);

// The rows of Training follow the doc, which a sync can change (TRN-6).
export const renderSettings = () => {
  const rests = [...new Set([...RESTS, state.settings.rest])].sort((a, b) => a - b);
  const option = (value, text, selected) => el('option', { value, textContent: text, selected });
  $('unit').replaceChildren(...UNITS.map((unit) => option(unit, t(`unit.${unit}`), unit === state.settings.unit)));
  $('rest').replaceChildren(...rests.map((rest) => option(String(rest), clock(rest), rest === state.settings.rest)));
  renderValues();
};

// Writes the fixed text of the page, then the text that a render builds.
export const applyLanguage = () => {
  document.documentElement.lang = lang;
  document.title = t('app.title');
  // The worker answers the manifest in this language (SW-13).
  const text = { type: 'manifest', lang, name: t('app.title'), description: t('app.description') };
  navigator.serviceWorker?.ready.then((registration) => registration.active?.postMessage(text)).catch(() => {});
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-attr]').forEach((node) => {
    node.dataset.i18nAttr.split(',').forEach((pair) => {
      const [name, key] = pair.split(':');
      node.setAttribute(name, t(key));
    });
  });
  const option = (value, text) => el('option', { value, textContent: text, selected: value === (chosen ?? '') });
  $('language').replaceChildren(
    option('', t('settings.automatic')),
    ...LANGUAGES.map((code) => option(code, LANGUAGE_NAMES[code])),
  );
  const handOption = (value, key) => el('option', { value, textContent: t(key), selected: value === hand });
  $('hand').replaceChildren(handOption('right', 'settings.handRight'), handOption('left', 'settings.handLeft'));
  const themeOption = (value, key) => el('option', { value, textContent: t(key), selected: value === theme });
  $('theme').replaceChildren(
    themeOption('system', 'settings.automatic'),
    themeOption('light', 'settings.themeLight'),
    themeOption('dark', 'settings.themeDark'),
  );
  document.querySelectorAll('[data-module]').forEach((box) => {
    box.checked = isOn(box.dataset.module);
  });
  renderValues();
  render();
  renderOnboarding();
};

export const bind = () => {
  $('export').addEventListener('click', () => {
    download(exportFilename(new Date()), exportJson(state));
  });
  // DATA-2: the done sets, for a spreadsheet or another log.
  $('export-csv').addEventListener('click', () => {
    download(csvFilename(exportFilename(new Date())), toCsv(state, { unknown: t('exercise.unknown') }), 'text/csv');
  });
  $('unit').addEventListener('change', (event) => apply(setUnit(state, event.target.value)));
  $('rest').addEventListener('change', (event) => apply(setRest(state, event.target.value)));
  $('import').addEventListener('click', () => $('import-file').click());
  // SET-2: the app starts again as a new install, with the walkthrough. With no storage the data is
  // only in memory, so the reload alone clears it. The session key goes too, so a signed-in device
  // opens Sign in.
  $('reset').addEventListener('click', () => {
    // DATA-6: a copy first, when the user wants one.
    if (state.workouts.length && window.confirm(t('reset.exportFirst'))) download(exportFilename(new Date()), exportJson(state));
    if (!window.confirm(t(signedIn() ? 'reset.confirmLocal' : 'reset.confirm'))) return;
    // SYNC-13: the sync stops first, and the account keeps its data.
    resetSync();
    if (storage && !resetAll(storage)) {
      showToast(t('error.resetFailed'));
      return;
    }
    location.reload();
  });
  $('language').addEventListener('change', (event) => {
    setLanguage(event.target.value || null);
    applyLanguage();
  });
  $('hand').addEventListener('change', (event) => setHand(event.target.value));
  $('theme').addEventListener('change', (event) => setTheme(event.target.value));
  for (const id of ['hand', 'theme']) $(id).addEventListener('change', renderValues);
  document.querySelectorAll('[data-module]').forEach((box) => {
    box.addEventListener('change', () => {
      setModules(switchModule(off, box.dataset.module, box.checked));
      setNavMotion(true);
      render();
      setNavMotion(false);
    });
  });
  $('update').addEventListener('click', () => runUpdate($('update')));
  $('import-file').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    const result = importJson(await file.text(), normalizeTraining);
    if (result.error) {
      showToast(textOf(result.error));
      return;
    }
    const workouts = t('workout.count', { count: result.state.workouts.length });
    // SYNC-9: with a session the import replaces the data of the account too.
    if (!window.confirm(t(signedIn() ? 'import.confirmAccount' : 'import.confirm', { workouts }))) return;
    apply(result, { undoText: t('toast.imported'), explicit: true });
  });
};
