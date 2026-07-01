const DEFAULT_LOOKBACK = 40;
const OVERLAP_WINDOW = 10;
const BARBWIRE_OVERLAP_THRESHOLD = 0.65;
const BARBWIRE_WIDTH_ATR_MAX = 3.0;
const BARBWIRE_SCORE_THRESHOLD = 0.6;
const BREAKOUT_RECLAIM_BARS = 5;
const BREAKOUT_TEST_TOLERANCE_ATR = 0.15;

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function currentAtr(frame) {
  const atr = frame.indicators?.atr14?.[0];
  return Number.isFinite(atr) && atr > 0 ? atr : null;
}

function rangeEnvelope(window) {
  if (!window.length) return [null, null];
  return [
    round(Math.max(...window.map((bar) => bar.high)), 6),
    round(Math.min(...window.map((bar) => bar.low)), 6)
  ];
}

function zoneFromPosition(position) {
  if (!Number.isFinite(position)) return "unknown";
  if (position >= 2 / 3) return "upper_third";
  if (position <= 1 / 3) return "lower_third";
  return "middle_third";
}

function meanOverlapRatio(window, count) {
  const ratios = [];
  for (let i = 0; i < Math.min(count, window.length - 1); i += 1) {
    const cur = window[i];
    const prev = window[i + 1];
    const high = Math.min(cur.high, prev.high);
    const low = Math.max(cur.low, prev.low);
    const denominator = Math.max(cur.high, prev.high) - Math.min(cur.low, prev.low);
    if (denominator > 0) ratios.push(Math.max(0, high - low) / denominator);
  }
  if (!ratios.length) return null;
  return round(ratios.reduce((a, b) => a + b, 0) / ratios.length);
}

function dojiInsideRatio(window, count) {
  const rows = window.slice(0, count);
  if (!rows.length) return null;
  let matched = 0;
  rows.forEach((bar, idx) => {
    const range = bar.high - bar.low;
    const body = Math.abs(bar.close - bar.open);
    const prev = window[idx + 1];
    if ((range > 0 && body / range <= 0.25) || (prev && bar.high <= prev.high && bar.low >= prev.low)) {
      matched += 1;
    }
  });
  return round(matched / rows.length);
}

function barbwireScore(overlapMean, dojiRatio, rangeWidthAtr) {
  let score = 0;
  if (Number.isFinite(overlapMean)) score += Math.min(1, overlapMean / BARBWIRE_OVERLAP_THRESHOLD) * 0.45;
  if (Number.isFinite(dojiRatio)) score += Math.min(1, dojiRatio / 0.5) * 0.35;
  if (Number.isFinite(rangeWidthAtr)) {
    score += Math.max(0, Math.min(1, (BARBWIRE_WIDTH_ATR_MAX - rangeWidthAtr) / BARBWIRE_WIDTH_ATR_MAX)) * 0.2;
  }
  return score;
}

function findSwingsWithSeq(bars) {
  const pivots = [];
  for (let i = 0; i < bars.length; i += 1) {
    let isHigh = true;
    let isLow = true;
    if (i > 0) {
      if (bars[i].high <= bars[i - 1].high) isHigh = false;
      if (bars[i].low >= bars[i - 1].low) isLow = false;
    }
    if (i + 1 < bars.length) {
      if (bars[i].high <= bars[i + 1].high) isHigh = false;
      if (bars[i].low >= bars[i + 1].low) isLow = false;
    }
    if (isHigh) pivots.push({ seq: bars[i].seq, kind: "high", price: round(bars[i].high, 6) });
    if (isLow) pivots.push({ seq: bars[i].seq, kind: "low", price: round(bars[i].low, 6) });
  }
  return pivots.sort((a, b) => a.seq - b.seq);
}

function labelSwingStructure(swings) {
  const highs = swings.filter((p) => p.kind === "high").sort((a, b) => a.seq - b.seq);
  const lows = swings.filter((p) => p.kind === "low").sort((a, b) => a.seq - b.seq);
  if (highs.length < 2 || lows.length < 2) return "insufficient";
  const hh = highs[0].price > highs[1].price;
  const hl = lows[0].price > lows[1].price;
  const ll = lows[0].price < lows[1].price;
  const lh = highs[0].price < highs[1].price;
  if (hh && hl) return "HH+HL";
  if (ll && lh) return "LL+LH";
  return "mixed";
}

function pullbackMetrics(swings, atr, close) {
  if (!swings.length || !atr) return [null, null];
  const highs = swings.filter((p) => p.kind === "high");
  const lows = swings.filter((p) => p.kind === "low");
  if (!highs.length && !lows.length) return [null, null];
  const useHigh = highs.length && (!lows.length || highs.at(-1).seq >= lows.at(-1).seq);
  const pivot = useHigh ? highs.at(-1) : lows.at(-1);
  const depth = useHigh ? Math.max(0, pivot.price - close) : Math.max(0, close - pivot.price);
  return [round(depth / atr), Math.max(0, pivot.seq - 1)];
}

function detectBreakoutEvents(bars, tick, atr) {
  const tolerance = (atr || 0) * BREAKOUT_TEST_TOLERANCE_ATR;
  const minTick = tick > 0 ? tick : 0.01;
  const chronological = [...bars].reverse();
  const events = [];
  let runningHigh = null;
  let runningLow = null;
  let brokeUp = null;
  let brokeDown = null;

  for (const bar of chronological) {
    const seq = bar.seq;
    if (runningHigh != null && runningLow != null) {
      if (bar.close > runningHigh + minTick) {
        brokeUp = { seq, level: runningHigh };
        events.push({ level_price: round(runningHigh, 6), level_kind: "range_high", event: "breakout", trigger_seq: seq, bar_range: `K${seq}`, note: "收盘突破当时区间上沿" });
      } else if (brokeUp) {
        const barsAfter = seq < brokeUp.seq ? brokeUp.seq - seq : 0;
        if (bar.close < brokeUp.level - minTick && barsAfter <= BREAKOUT_RECLAIM_BARS) {
          events.push({ level_price: round(brokeUp.level, 6), level_kind: "range_high", event: "failed", trigger_seq: seq, bar_range: `K${brokeUp.seq}-K${seq}`, note: "突破后收回区间内" });
          brokeUp = null;
        } else if (bar.low <= brokeUp.level + tolerance && bar.close > brokeUp.level && barsAfter <= BREAKOUT_RECLAIM_BARS) {
          events.push({ level_price: round(brokeUp.level, 6), level_kind: "range_high", event: "test", trigger_seq: seq, bar_range: `K${brokeUp.seq}-K${seq}`, note: "回测上沿后仍收上沿之上" });
        }
      }

      if (bar.close < runningLow - minTick) {
        brokeDown = { seq, level: runningLow };
        events.push({ level_price: round(runningLow, 6), level_kind: "range_low", event: "breakout", trigger_seq: seq, bar_range: `K${seq}`, note: "收盘跌破当时区间下沿" });
      } else if (brokeDown) {
        const barsAfter = seq < brokeDown.seq ? brokeDown.seq - seq : 0;
        if (bar.close > brokeDown.level + minTick && barsAfter <= BREAKOUT_RECLAIM_BARS) {
          events.push({ level_price: round(brokeDown.level, 6), level_kind: "range_low", event: "failed", trigger_seq: seq, bar_range: `K${brokeDown.seq}-K${seq}`, note: "跌破后收回区间内" });
          brokeDown = null;
        } else if (bar.high >= brokeDown.level - tolerance && bar.close < brokeDown.level && barsAfter <= BREAKOUT_RECLAIM_BARS) {
          events.push({ level_price: round(brokeDown.level, 6), level_kind: "range_low", event: "test", trigger_seq: seq, bar_range: `K${brokeDown.seq}-K${seq}`, note: "回测下沿后仍收下沿之下" });
        }
      }
    }
    runningHigh = runningHigh == null ? bar.high : Math.max(runningHigh, bar.high);
    runningLow = runningLow == null ? bar.low : Math.min(runningLow, bar.low);
  }

  const priority = { failed: 0, breakout: 1, test: 2 };
  return events
    .filter((ev) => ev.trigger_seq <= 12)
    .sort((a, b) => a.trigger_seq - b.trigger_seq || priority[a.event] - priority[b.event])
    .slice(0, 6);
}

function computeHlCount(bars, atr) {
  if (bars.length < 2) {
    return { bull_count: 0, bear_count: 0, last_bull_trigger_seq: null, last_bear_trigger_seq: null, bull_candidate: "none", bear_candidate: "none", bar_range: "不适用" };
  }
  let bull = 0;
  let bear = 0;
  let lastBull = null;
  let lastBear = null;
  const resetRange = (atr || 0) * 1.2;
  for (let olderIdx = bars.length - 1; olderIdx > 0; olderIdx -= 1) {
    const newer = bars[olderIdx - 1];
    const older = bars[olderIdx];
    const newerRange = newer.high - newer.low;
    if (newer.high > older.high) {
      bull += 1;
      lastBull = newer.seq;
    } else if (newer.close < older.low && resetRange > 0 && newerRange >= resetRange) {
      bull = 0;
    }
    if (newer.low < older.low) {
      bear += 1;
      lastBear = newer.seq;
    } else if (newer.close > older.high && resetRange > 0 && newerRange >= resetRange) {
      bear = 0;
    }
  }
  const tag = (count, prefix) => count <= 0 ? "none" : count === 1 ? `${prefix}1` : count === 2 ? `${prefix}2` : `${prefix}3`;
  return {
    bull_count: bull,
    bear_count: bear,
    last_bull_trigger_seq: lastBull,
    last_bear_trigger_seq: lastBear,
    bull_candidate: tag(bull, "h"),
    bear_candidate: tag(bear, "l"),
    bar_range: `K${bars[0].seq}-K${bars.at(-1).seq}`
  };
}

function structureLevels(close, swings) {
  const seen = new Set();
  const supports = [];
  const resistances = [];
  for (const pivot of [...swings].reverse()) {
    const key = pivot.price.toFixed(8);
    if (seen.has(key)) continue;
    seen.add(key);
    if (pivot.kind === "low" && pivot.price < close) supports.push(pivot.price);
    if (pivot.kind === "high" && pivot.price > close) resistances.push(pivot.price);
  }
  supports.sort((a, b) => b - a);
  resistances.sort((a, b) => a - b);
  return [supports.slice(0, 3), resistances.slice(0, 3)];
}

function measuredMoves(rangeHigh, rangeLow, swings, close, lookback) {
  const out = [];
  if (rangeHigh != null && rangeLow != null && rangeHigh > rangeLow) {
    const height = round(rangeHigh - rangeLow, 6);
    out.push({ kind: "range_up", reference: "区间高度向上翻测", height, target_price: round(rangeHigh + height, 6), bar_range: `K${lookback}-K1` });
    out.push({ kind: "range_down", reference: "区间高度向下翻测", height, target_price: round(rangeLow - height, 6), bar_range: `K${lookback}-K1` });
  }
  const highs = swings.filter((p) => p.kind === "high").sort((a, b) => a.seq - b.seq);
  const lows = swings.filter((p) => p.kind === "low").sort((a, b) => a.seq - b.seq);
  if (highs.length && lows.length) {
    const height = round(highs[0].price - lows[0].price, 6);
    if (height > 0) {
      out.push({ kind: "leg_up", reference: `最近leg K${lows[0].seq}-K${highs[0].seq}`, height, target_price: round(close + height, 6), bar_range: `K${highs[0].seq}-K${lows[0].seq}` });
      out.push({ kind: "leg_down", reference: `最近leg K${highs[0].seq}-K${lows[0].seq}`, height, target_price: round(close - height, 6), bar_range: `K${highs[0].seq}-K${lows[0].seq}` });
    }
  }
  return out;
}

export function computeSimpleMarketFeatures(frame, { lookback = DEFAULT_LOOKBACK } = {}) {
  const bars = frame.bars || [];
  const window = bars.slice(0, Math.min(lookback, bars.length));
  if (!window.length) return null;
  const atr = currentAtr(frame);
  const close = window[0].close;
  const [rangeHigh, rangeLow] = rangeEnvelope(window);
  const width = rangeHigh != null && rangeLow != null ? rangeHigh - rangeLow : null;
  const rangeWidthAtr = width != null && atr ? round(width / atr) : null;
  const pricePosition = width > 0 ? round((close - rangeLow) / width) : null;
  const overlapMean = meanOverlapRatio(window, Math.min(OVERLAP_WINDOW, window.length));
  const dojiRatio = dojiInsideRatio(window, Math.min(OVERLAP_WINDOW, window.length));
  const score = barbwireScore(overlapMean, dojiRatio, rangeWidthAtr);
  const swings = findSwingsWithSeq(window);
  const [pullbackDepthAtr, pullbackBars] = pullbackMetrics(swings, atr, close);
  const [supports, resistances] = structureLevels(close, swings);
  const usedLookback = window.length;

  return {
    lookback_bars: usedLookback,
    range_high: rangeHigh,
    range_low: rangeLow,
    range_width_atr: rangeWidthAtr,
    price_position: pricePosition,
    zone: zoneFromPosition(pricePosition),
    dist_to_high_atr: rangeHigh != null && atr ? round((rangeHigh - close) / atr) : null,
    dist_to_low_atr: rangeLow != null && atr ? round((close - rangeLow) / atr) : null,
    overlap_mean_10: overlapMean,
    doji_inside_ratio_10: dojiRatio,
    barbwire_score: round(score),
    barbwire_candidate: score >= BARBWIRE_SCORE_THRESHOLD,
    swing_structure: labelSwingStructure(swings),
    swings,
    pullback_depth_atr: pullbackDepthAtr,
    pullback_bars: pullbackBars,
    breakout_events: detectBreakoutEvents(window, 0.01, atr),
    hl_count: computeHlCount(window, atr),
    supports,
    resistances,
    invalidation_long: supports[0] ?? null,
    invalidation_short: resistances[0] ?? null,
    measured_moves: measuredMoves(rangeHigh, rangeLow, swings, close, usedLookback)
  };
}

export function renderSimpleMarketFeatures(features) {
  if (!features) return "## 程序结构辅助特征\n- 数据不足，未计算。";
  const lines = [
    "## 程序结构辅助特征（简单预计算，客观参考；楔形/MTR 等复杂形态仍由模型判断）",
    "",
    "### 区间位置",
    `- 近${features.lookback_bars}棒包络：高 ${features.range_high} / 低 ${features.range_low}`,
    `- 区间宽度：${features.range_width_atr ?? "NA"}×ATR；收盘位置分位：${features.price_position ?? "NA"}（${features.zone}）`,
    `- 距上沿 ${features.dist_to_high_atr ?? "NA"}×ATR / 距下沿 ${features.dist_to_low_atr ?? "NA"}×ATR`,
    "",
    "### 重叠 / 铁丝网",
    `- 近10棒平均重叠：${features.overlap_mean_10 ?? "NA"}；十字星+内包占比：${features.doji_inside_ratio_10 ?? "NA"}`,
    `- 铁丝网分数：${features.barbwire_score}（${features.barbwire_candidate ? "候选铁丝网/TTR" : "未达阈值"}）`,
    "",
    "### 波段结构",
    `- 结构标签：${features.swing_structure}`,
    `- 最近枢轴（新→旧）：${features.swings.slice(0, 6).map((p) => `K${p.seq}${p.kind === "high" ? "高" : "低"}${p.price}`).join(", ") || "无"}`,
    `- 自最近极点回撤：${features.pullback_depth_atr ?? "NA"}×ATR，持续${features.pullback_bars ?? "NA"}棒`,
    "",
    "### 突破 / 收回 / 回测",
    ...(features.breakout_events.length
      ? features.breakout_events.slice(0, 4).map((ev) => `- ${ev.event} ${ev.level_kind} ${ev.level_price} @ K${ev.trigger_seq}（${ev.bar_range}）${ev.note}`)
      : ["- 近窗口内无显著区间突破/收回事件"]),
    "",
    "### H/L 计数与结构位",
    `- 多头计数：${features.hl_count.bull_count}（候选 ${features.hl_count.bull_candidate.toUpperCase()}）；空头计数：${features.hl_count.bear_count}（候选 ${features.hl_count.bear_candidate.toUpperCase()}）`,
    `- 支撑：${features.supports.join(", ") || "无"}；压力：${features.resistances.join(", ") || "无"}`,
    `- 测量目标：${features.measured_moves.slice(0, 4).map((m) => `${m.kind}:${m.target_price}`).join(", ") || "无"}`
  ];
  return lines.join("\n");
}
