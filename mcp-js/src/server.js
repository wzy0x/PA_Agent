#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { fetchEastMoneyKlines } from "./eastmoney.js";
import { buildAnalysisFrame, buildLiveFrame, renderKlineTable } from "./frame.js";
import { renderSimpleMarketFeatures } from "./market-features.js";

const server = new McpServer({
  name: "pa-agent-js",
  version: "0.1.0"
});

const SourceSchema = {
  symbol: z.string().min(1).describe("A-share symbol, e.g. 600519, sh000300, sz399006."),
  timeframe: z.enum(["1m", "5m", "15m", "30m", "1h", "1d", "1w", "1M"]).default("1d"),
  count: z.number().int().min(1).max(5000).default(160),
  adjust: z.enum(["qfq", "hfq", "none"]).default("qfq")
};

server.registerTool(
  "eastmoney_klines",
  {
    title: "Fetch EastMoney A-share klines",
    description:
      "Fetch public A-share OHLCV bars from EastMoney. Returns newest-first bars for charting or analysis.",
    inputSchema: SourceSchema
  },
  async (args) => {
    const result = await fetchEastMoneyKlines(args);
    return jsonText(result);
  }
);

server.registerTool(
  "analysis_frame",
  {
    title: "Build closed-only analysis frame",
    description:
      "Build a KlineFrame for AI analysis. The newest forming bar is excluded, so K1 is always the newest closed bar.",
    inputSchema: {
      symbol: z.string().min(1),
      timeframe: z.string().min(1),
      source: z.string().default("external"),
      bars: z.array(z.object({
        seq: z.number().optional(),
        ts_open: z.number(),
        open: z.number(),
        high: z.number(),
        low: z.number(),
        close: z.number(),
        volume: z.number().optional(),
        amount: z.number().optional(),
        pct_chg: z.number().nullable().optional(),
        closed: z.boolean().optional()
      })).min(1).describe("Newest-first OHLCV bars."),
      n: z.number().int().min(2).max(5000).default(100)
    }
  },
  async (args) => jsonText(buildAnalysisFrame(args))
);

server.registerTool(
  "live_frame",
  {
    title: "Build live chart frame",
    description:
      "Build a chart frame that may include the current forming bar as seq=0 plus n closed bars.",
    inputSchema: {
      symbol: z.string().min(1),
      timeframe: z.string().min(1),
      source: z.string().default("external"),
      bars: z.array(z.object({
        seq: z.number().optional(),
        ts_open: z.number(),
        open: z.number(),
        high: z.number(),
        low: z.number(),
        close: z.number(),
        volume: z.number().optional(),
        amount: z.number().optional(),
        pct_chg: z.number().nullable().optional(),
        closed: z.boolean().optional()
      })).min(1).describe("Newest-first OHLCV bars."),
      nClosed: z.number().int().min(2).max(5000).default(100)
    }
  },
  async (args) => jsonText(buildLiveFrame(args))
);

server.registerTool(
  "pa_analysis_task",
  {
    title: "Create PA analysis task payload",
    description:
      "Create a compact, skill-friendly Price Action analysis task from a closed-only KlineFrame.",
    inputSchema: {
      frame: z.object({
        source: z.string().optional(),
        symbol: z.string(),
        timeframe: z.string(),
        bars: z.array(z.object({
          seq: z.number(),
          ts_open: z.number(),
          open: z.number(),
          high: z.number(),
          low: z.number(),
          close: z.number(),
          volume: z.number().optional(),
          amount: z.number().optional(),
          pct_chg: z.number().nullable().optional(),
          closed: z.boolean()
        })).min(2),
        indicators: z.object({
          ema20: z.array(z.number()),
          atr14: z.array(z.number())
        }),
        kline_features: z.array(z.record(z.string(), z.any())).optional(),
        program_features: z.record(z.string(), z.any()).nullable().optional(),
        snapshot_ts_local_ms: z.number()
      }),
      mode: z.enum(["stage1", "stage2", "full"]).default("full"),
      decisionStance: z.enum(["conservative", "balanced", "aggressive", "extreme_aggressive"]).default("balanced")
    }
  },
  async ({ frame, mode, decisionStance }) => {
    const payload = {
      kind: "pa_price_action_analysis_task",
      instructions: [
        "Use the pa-price-action skill if available.",
        "Do not fetch external market data; analyze only the supplied KlineFrame.",
        "K1 is the newest closed candle. Ignore any forming candle.",
        "Use frame.kline_features and frame.program_features as deterministic preprocessing from the original PA Agent flow.",
        "Return strict JSON only. Do not use markdown fences.",
        "This is research output, not investment advice."
      ],
      mode,
      decision_stance: decisionStance,
      frame,
      kline_table_csv: renderKlineTable(frame),
      program_features_brief: renderSimpleMarketFeatures(frame.program_features)
    };
    return jsonText(payload);
  }
);

function jsonText(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);
