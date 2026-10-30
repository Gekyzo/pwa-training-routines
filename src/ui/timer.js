// The rest timer of the open workout (TMR-1 to TMR-3). It is a state of the device, under its own key.
import { startTimer, remaining, addTime, normalizeTimer } from '#timer';
import { keyOf } from '#storage';
import { $, storage, t } from '#ui/context';
import { clock } from '#ui/format';

const TIMER_KEY = keyOf('timer');
const STEP = 15;

const load = () => {
  try {
    return normalizeTimer(JSON.parse(storage?.getItem(TIMER_KEY) ?? 'null'));
  } catch {
    return null;
  }
};

let timer = load();
let tick = null;

const save = () => {
  try {
    if (timer) storage?.setItem(TIMER_KEY, JSON.stringify(timer));
    else storage?.removeItem(TIMER_KEY);
  } catch {
    // The timer still runs for this start.
  }
};

// TMR-1: at zero the phone vibrates, and a notification shows while the app is out of sight.
const ring = () => {
  navigator.vibrate?.([200, 100, 200]);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready.then((registration) => registration.showNotification(t('timer.done'), { tag: 'rest', silent: false })).catch(() => {});
  }
};

const show = () => {
  const left = remaining(timer, Date.now());
  $('rest-timer').hidden = !timer;
  $('rest-timer-time').textContent = timer ? clock(left) : '';
  if (timer && left === 0) {
    stop();
    ring();
  }
};

export const stop = () => {
  timer = null;
  clearInterval(tick);
  tick = null;
  save();
  $('rest-timer').hidden = true;
};

const run = () => {
  clearInterval(tick);
  tick = setInterval(show, 250);
  save();
  show();
};

export const startRest = (seconds) => {
  if (!seconds) return;
  // The first rest asks once for the notification of TMR-1.
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  timer = startTimer(seconds, Date.now());
  run();
};

export const renderTimer = () => show();

export const bind = () => {
  $('rest-less').addEventListener('click', () => {
    if (!timer) return;
    timer = addTime(timer, -STEP, Date.now());
    run();
  });
  $('rest-more').addEventListener('click', () => {
    if (!timer) return;
    timer = addTime(timer, STEP, Date.now());
    run();
  });
  $('rest-skip').addEventListener('click', stop);
  // A timer of a start before goes on, or rings when its time is past.
  if (timer) run();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && timer) show();
  });
};
