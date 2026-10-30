// The edit sheet: one sheet for every form of the app. A view fills its body and its submit.
import { bindSheetDrag } from '#ds/sheet';
import { $, el, ui, t, render } from '#ui/context';

let submit = null;

// `onSubmit(values)` returns true when the sheet may close. With no `onSubmit` the sheet has no foot:
// its body holds the choices (a picker).
export const openSheet = ({ title, body, submitLabel = t('common.save'), onSubmit = null }) => {
  submit = onSubmit;
  $('edit-title').textContent = title;
  $('edit-body').replaceChildren(...body);
  $('edit-submit').textContent = submitLabel;
  $('edit-foot').hidden = !onSubmit;
  ui.sheetOpen = true;
  render();
  $('edit-body').querySelector('input, select, textarea')?.focus();
};

export const closeSheet = () => {
  submit = null;
  ui.sheetOpen = false;
  render();
};

export const renderSheet = () => {
  $('edit-sheet').hidden = !ui.sheetOpen;
};

// The value of each named control of the form, as text.
const values = () => Object.fromEntries(new FormData($('edit-form')).entries());

export const field = (labelKey, input) => el('label', { className: 'field' }, [input, el('span', { className: 'field-label', textContent: t(labelKey) })]);

export const textInput = (name, value = '', { maxLength = 60, labelKey } = {}) =>
  el('input', { className: 'input field-input', type: 'text', name, value, maxLength, placeholder: labelKey ? t(labelKey) : '' });

// A number box with the keyboard of numbers; a decimal one takes a comma or a point.
export const numberInput = (name, value, { decimal = false, labelKey } = {}) =>
  el('input', {
    className: 'input field-input',
    type: 'text',
    name,
    value: value ?? '',
    inputMode: decimal ? 'decimal' : 'numeric',
    placeholder: labelKey ? t(labelKey) : '',
  });

export const selectInput = (name, options, value) =>
  el('select', { className: 'select', name }, options.map(([key, text]) => el('option', { value: key, textContent: text, selected: key === (value ?? '') })));

export const bind = () => {
  $('edit-veil').addEventListener('click', closeSheet);
  $('edit-close').addEventListener('click', closeSheet);
  bindSheetDrag($('edit-sheet'), { close: closeSheet });
  $('edit-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (submit?.(values())) closeSheet();
  });
};
