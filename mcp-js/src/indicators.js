export function ema(values, period) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out = new Array(values.length).fill(Number.NaN);
  if (values.length < period) return out;

  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += values[i];
  seed /= period;
  out[period - 1] = seed;

  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i += 1) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

export function atr(bars, period) {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const out = new Array(bars.length).fill(Number.NaN);
  const trs = [];
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i];
    const prevClose = i === 0 ? b.close : bars[i - 1].close;
    trs.push(Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose)));
  }
  if (trs.length < period) return out;

  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += trs[i];
  seed /= period;
  out[period - 1] = seed;

  for (let i = period; i < trs.length; i += 1) {
    out[i] = (out[i - 1] * (period - 1) + trs[i]) / period;
  }
  return out;
}

export function computeIndicatorsNewestFirst(barsNewestFirst) {
  const asc = [...barsNewestFirst].reverse();
  const ema20Asc = ema(asc.map((b) => b.close), 20);
  const atr14Asc = atr(asc, 14);
  return {
    ema20: ema20Asc.reverse(),
    atr14: atr14Asc.reverse()
  };
}
