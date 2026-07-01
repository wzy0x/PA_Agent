function roundOrNull(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function isInside(bar, prev) {
  return !!bar && !!prev && bar.high <= prev.high && bar.low >= prev.low;
}

function isOutside(bar, prev) {
  return !!bar && !!prev && bar.high >= prev.high && bar.low <= prev.low;
}

function overlapRatio(bar, prev) {
  if (!prev) return null;
  const high = Math.min(bar.high, prev.high);
  const low = Math.max(bar.low, prev.low);
  const overlap = Math.max(0, high - low);
  const denominator = Math.max(bar.high, prev.high) - Math.min(bar.low, prev.low);
  if (denominator <= 0) return null;
  return overlap / denominator;
}

function classifyBar(bar, prev, bodyRatio, closePosition) {
  if (prev) {
    if (isInside(bar, prev)) return "inside";
    if (isOutside(bar, prev)) return bar.close >= bar.open ? "outside_bull" : "outside_bear";
  }
  if (!Number.isFinite(bodyRatio) || !Number.isFinite(closePosition)) return "flat";
  if (bodyRatio <= 0.25) return "doji";
  if (bar.close > bar.open && closePosition >= 0.65) return "trend_bull";
  if (bar.close < bar.open && closePosition <= 0.35) return "trend_bear";
  return "other";
}

function insideSequence(bar, prev, prev2, prev3) {
  if (isInside(bar, prev) && isInside(prev, prev2) && isInside(prev2, prev3)) return "iii";
  if (isInside(bar, prev) && isInside(prev, prev2)) return "ii";
  return "none";
}

function isIoi(bar, prev, prev2, prev3) {
  return isInside(prev2, prev3) && isOutside(prev, prev2) && isInside(bar, prev);
}

function microDouble(bar, prev, atr) {
  if (!prev) return "none";
  const tolerance = Number.isFinite(atr) && atr > 0 ? atr * 0.02 : 0;
  if (Math.abs(bar.low - prev.low) <= tolerance) return "MDB";
  if (Math.abs(bar.high - prev.high) <= tolerance) return "MDT";
  return "none";
}

function gapBar(bar, ema) {
  if (!Number.isFinite(ema)) return "none";
  if (bar.low > ema) return "bull_gap";
  if (bar.high < ema) return "bear_gap";
  return "none";
}

function emaGapCount(bars, idx, emaValues) {
  const ema = emaValues[idx];
  if (!Number.isFinite(ema)) return 0;
  const side = gapBar(bars[idx], ema);
  if (side === "none") return 0;
  let count = 0;
  for (let j = idx; j < bars.length; j += 1) {
    if (!Number.isFinite(emaValues[j]) || gapBar(bars[j], emaValues[j]) !== side) break;
    count += 1;
  }
  return count;
}

function breakoutPrevRange(bars, idx, lookback = 5) {
  const prevBars = bars.slice(idx + 1, idx + 1 + lookback);
  if (prevBars.length === 0) return "none";
  const brokeHigh = bars[idx].high > Math.max(...prevBars.map((bar) => bar.high));
  const brokeLow = bars[idx].low < Math.min(...prevBars.map((bar) => bar.low));
  if (brokeHigh && brokeLow) return "both";
  if (brokeHigh) return "up";
  if (brokeLow) return "down";
  return "none";
}

function followThrough12(bars, idx) {
  if (idx === 0) return "pending";
  const bar = bars[idx];
  const newer = bars.slice(Math.max(0, idx - 2), idx);
  if (newer.length === 0) return "pending";
  const direction = bar.close > bar.open ? 1 : bar.close < bar.open ? -1 : 0;
  if (direction === 0) return "pending";
  let same = 0;
  let opposite = 0;
  for (const nbar of newer) {
    if (direction > 0) {
      if (nbar.close > bar.close) same += 1;
      if (nbar.close < bar.open) opposite += 1;
    } else {
      if (nbar.close < bar.close) same += 1;
      if (nbar.close > bar.open) opposite += 1;
    }
  }
  if (same > 0) return "yes";
  if (opposite > 0) return "failed";
  return "no";
}

export function computeKlineGeometryFeatures(frame, { limit = null } = {}) {
  const bars = frame.bars || [];
  const ema20 = frame.indicators?.ema20 || [];
  const atr14 = frame.indicators?.atr14 || [];
  const features = bars.map((bar, idx) => {
    const prev = bars[idx + 1] || null;
    const prev2 = bars[idx + 2] || null;
    const prev3 = bars[idx + 3] || null;
    const high = Math.max(bar.high, bar.low);
    const low = Math.min(bar.high, bar.low);
    const range = high - low;
    const body = Math.abs(bar.close - bar.open);
    const bodyRatio = range > 0 ? body / range : null;
    const upperWickRatio = range > 0 ? (high - Math.max(bar.open, bar.close)) / range : null;
    const lowerWickRatio = range > 0 ? (Math.min(bar.open, bar.close) - low) / range : null;
    const closePosition = range > 0 ? Math.max(0, Math.min(1, (bar.close - low) / range)) : null;
    const atr = atr14[idx];
    const ema = ema20[idx];
    const rangeAtrRatio = range > 0 && Number.isFinite(atr) && atr > 0 ? range / atr : null;
    const emaRelation = Number.isFinite(ema)
      ? bar.close > ema ? "above" : bar.close < ema ? "below" : "touch"
      : "unknown";

    return {
      seq: bar.seq,
      bar_type: classifyBar(bar, prev, bodyRatio, closePosition),
      body_ratio: roundOrNull(bodyRatio),
      upper_wick_ratio: roundOrNull(upperWickRatio),
      lower_wick_ratio: roundOrNull(lowerWickRatio),
      close_position: roundOrNull(closePosition),
      range_atr_ratio: roundOrNull(rangeAtrRatio),
      ema_relation: emaRelation,
      overlap_prev_ratio: roundOrNull(overlapRatio(bar, prev)),
      inside_sequence: insideSequence(bar, prev, prev2, prev3),
      ioi_pattern: isIoi(bar, prev, prev2, prev3),
      micro_double: microDouble(bar, prev, atr),
      gap_bar: gapBar(bar, ema),
      ema_gap_count: emaGapCount(bars, idx, ema20),
      breakout_prev: breakoutPrevRange(bars, idx),
      follow_through_1_2: followThrough12(bars, idx)
    };
  });
  return limit == null ? features : features.slice(0, limit);
}
