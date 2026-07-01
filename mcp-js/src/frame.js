import { computeIndicatorsNewestFirst } from "./indicators.js";
import { computeKlineGeometryFeatures } from "./kline-features.js";
import { computeSimpleMarketFeatures } from "./market-features.js";

export const INDICATOR_WARMUP_BARS = 50;

function normalizeBar(bar, seq, closed = true) {
  const high = Math.max(Number(bar.high), Number(bar.low));
  const low = Math.min(Number(bar.high), Number(bar.low));
  const close = Math.max(low, Math.min(high, Number(bar.close)));
  return {
    seq,
    ts_open: Number(bar.ts_open),
    open: Number(bar.open),
    high,
    low,
    close,
    volume: Number(bar.volume || 0),
    amount: Number(bar.amount || 0),
    pct_chg: bar.pct_chg ?? null,
    closed
  };
}

function newestClosedSlice(barsNewestFirst, n) {
  if (!Array.isArray(barsNewestFirst) || barsNewestFirst.length === 0) return null;
  const hasForming = barsNewestFirst[0]?.closed === false;
  const start = hasForming ? 1 : 0;
  const sliced = barsNewestFirst.slice(start, start + n);
  if (sliced.length < n) return null;
  return sliced;
}

export function buildAnalysisFrame({ bars, n, symbol, timeframe, source = "unknown" }) {
  const count = Math.max(1, Number(n) || 100);
  const fetchN = count + INDICATOR_WARMUP_BARS;
  const requestedRaw = newestClosedSlice(bars, fetchN);
  const fallbackRaw = newestClosedSlice(bars, count);
  const closedRaw = requestedRaw || fallbackRaw;
  if (!closedRaw || closedRaw.length < count) {
    const available = countClosedBars(bars);
    throw new Error(`Need at least ${count} closed bars; got ${available}`);
  }

  const all = closedRaw.map((bar, index) => normalizeBar(bar, index + 1, true));
  const indicatorsAll = computeIndicatorsNewestFirst(all);
  const sliced = all.slice(0, count);
  const frame = {
    source,
    symbol,
    timeframe,
    bars: sliced,
    indicators: {
      ema20: indicatorsAll.ema20.slice(0, count),
      atr14: indicatorsAll.atr14.slice(0, count)
    },
    snapshot_ts_local_ms: Date.now()
  };
  attachProgramFeatures(frame);
  return frame;
}

export function buildLiveFrame({ bars, nClosed, symbol, timeframe, source = "unknown" }) {
  const count = Math.max(1, Number(nClosed) || 100);
  const hasForming = bars?.[0]?.closed === false;
  const raw = hasForming ? bars.slice(0, count + 1) : bars.slice(0, count);
  if (raw.length < count) {
    throw new Error(`Need at least ${count} bars; got ${raw.length}`);
  }
  let closedSeq = 0;
  const normalized = raw.map((bar, index) => {
    const forming = hasForming && index === 0;
    if (!forming) closedSeq += 1;
    return normalizeBar(bar, forming ? 0 : closedSeq, !forming);
  });
  const frame = {
    source,
    symbol,
    timeframe,
    bars: normalized,
    indicators: computeIndicatorsNewestFirst(normalized),
    snapshot_ts_local_ms: Date.now()
  };
  attachProgramFeatures(frame);
  return frame;
}

export function renderKlineTable(frame, limit = 120) {
  const rows = frame.bars.slice(0, Math.max(1, Number(limit) || 120));
  const lines = [
    "seq,ts_open,open,high,low,close,volume,ema20,atr14"
  ];
  rows.forEach((bar, index) => {
    lines.push([
      `K${bar.seq}`,
      new Date(bar.ts_open).toISOString(),
      num(bar.open),
      num(bar.high),
      num(bar.low),
      num(bar.close),
      num(bar.volume),
      num(frame.indicators.ema20[index]),
      num(frame.indicators.atr14[index])
    ].join(","));
  });
  return lines.join("\n");
}

function num(value) {
  return Number.isFinite(value) ? Number(value).toPrecision(8) : "";
}

function countClosedBars(bars) {
  if (!Array.isArray(bars)) return 0;
  return bars.filter((bar) => bar?.closed !== false).length;
}

function attachProgramFeatures(frame) {
  frame.kline_features = computeKlineGeometryFeatures(frame);
  frame.program_features = computeSimpleMarketFeatures(frame);
}
