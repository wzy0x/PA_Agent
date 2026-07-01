import { fetchEastMoneyKlines } from "./src/eastmoney.js";
import { buildAnalysisFrame, renderKlineTable } from "./src/frame.js";
import { renderSimpleMarketFeatures } from "./src/market-features.js";

const SYMBOL = "603260";       // 合盛硅业
const TIMEFRAME = "1d";
const COUNT = 100;

try {
  // Step 1: fetch klines
  const raw = await fetchEastMoneyKlines({
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    count: COUNT + 50,
    adjust: "qfq"
  });
  console.log(`\n=== 合盛硅业 (${raw.symbol}) ${TIMEFRAME} K线 ===`);
  console.log(`获取到 ${raw.bars.length} 根K线`);

  // Step 2: build analysis frame
  const frame = buildAnalysisFrame({
    bars: raw.bars,
    n: COUNT,
    symbol: raw.symbol,
    timeframe: raw.timeframe,
    source: "eastmoney"
  });
  console.log(`分析帧: ${frame.bars.length} 根已收盘K线`);

  // Step 3: print latest bars
  console.log("\n--- 最近K线 (前10根) ---");
  const recent = frame.bars.slice(0, 10);
  for (const b of recent) {
    const dt = new Date(b.ts_open).toISOString().slice(0, 10);
    const ema = frame.indicators.ema20[b.seq - 1]?.toFixed(2) ?? "-";
    const atr = frame.indicators.atr14[b.seq - 1]?.toFixed(2) ?? "-";
    console.log(`K${b.seq}  ${dt}  O:${b.open.toFixed(2)} H:${b.high.toFixed(2)} L:${b.low.toFixed(2)} C:${b.close.toFixed(2)} V:${(b.volume/10000).toFixed(0)}万  EMA20:${ema}  ATR14:${atr}`);
  }

  // Step 4: print features
  console.log("\n--- K线特征 ---");
  const features = frame.kline_features?.slice(0, 10) ?? [];
  for (const f of features) {
    const tags = f.shape_tags?.join(", ") ?? "-";
    const vol = f.volume_ratio !== undefined ? f.volume_ratio.toFixed(2) : "-";
    console.log(`K${f.seq}: ${tags}  volRatio:${vol}`);
  }

  console.log("\n--- 市场特征 ---");
  const pf = frame.program_features;
  if (pf) {
    for (const [k, v] of Object.entries(pf)) {
      if (typeof v === "number") console.log(`  ${k}: ${v.toFixed(4)}`);
      else console.log(`  ${k}: ${v}`);
    }
  }

  // Step 5: build analysis task payload
  const klineCsv = renderKlineTable(frame);
  const featureBrief = renderSimpleMarketFeatures(frame.program_features);
  const payload = {
    kind: "pa_price_action_analysis_task",
    instructions: [
      "Use the pa-price-action skill if available.",
      "Do not fetch external market data; analyze only the supplied KlineFrame.",
      "K1 is the newest closed candle. Ignore any forming candle.",
      "Return strict JSON only. Do not use markdown fences."
    ],
    mode: "full",
    decision_stance: "balanced",
    frame: {
      source: frame.source,
      symbol: frame.symbol,
      timeframe: frame.timeframe,
      bars_count: frame.bars.length,
      latest_close: frame.bars[0]?.close,
      ema20_latest: frame.indicators.ema20[0],
      atr14_latest: frame.indicators.atr14[0]
    },
    kline_table_csv: klineCsv,
    program_features_brief: featureBrief
  };

  console.log("\n--- PA分析任务载荷 (可发送给AI做完整分析) ---");
  console.log(JSON.stringify(payload, null, 2));

} catch (err) {
  console.error("分析失败:", err.message);
  process.exit(1);
}
