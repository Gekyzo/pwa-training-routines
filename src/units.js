// The units of weight (PR-8). A set keeps the unit it was logged in; the screen converts.
export const KG_PER_LB = 0.45359237;

// A weight of `from` in `to`, with no rounding.
export const convert = (weight, from, to) => {
  if (weight === null || from === to) return weight;
  return from === 'lb' ? weight * KG_PER_LB : weight / KG_PER_LB;
};

export const toKg = (weight, unit) => convert(weight, unit, 'kg');

// PR-8: a weight to show in `to`, rounded to one decimal.
export const shownWeight = (weight, from, to) => {
  const value = convert(weight, from, to);
  return value === null ? null : Math.round(value * 10) / 10;
};

// `90` as `1:30`, `3725` as `1:02:05`.
export const clock = (seconds) => {
  const s = Math.max(0, Math.round(seconds));
  const pad = (n) => String(n).padStart(2, '0');
  const [h, m, r] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
};
