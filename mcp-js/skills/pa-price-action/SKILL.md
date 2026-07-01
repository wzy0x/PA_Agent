---
name: pa-price-action
description: Price Action market diagnosis and trading decision workflow for KlineFrame payloads from the pa-agent-js MCP server. Use when Codex receives a pa_price_action_analysis_task, K-line OHLCV frame, A-share chart analysis request, stage1/stage2 PA diagnosis task, or needs to convert candles into strict JSON research output.
---

# PA Price Action

Analyze only the supplied payload. Do not fetch market data, browse, inspect files, or call unrelated tools unless the user explicitly asks for implementation work.

Treat `K1` as the newest closed candle. If a forming candle exists in a chart view, ignore it for analysis.

This is research output, not investment advice.

## Workflow

1. Read the task payload.
2. Verify it contains `kind: "pa_price_action_analysis_task"` and a closed-only `frame`.
3. Use the CSV table and frame JSON as the only market source.
4. Produce `stage1` diagnosis first:
   - cycle position
   - direction
   - market phase
   - support and resistance
   - key signals
   - five-bar summary for K5 through K1 when available
5. If task mode is `full` or `stage2`, produce a trading decision:
   - no order when signal quality is unclear
   - otherwise include entry, stop, target, risk notes, confidence, and invalidation
6. Return strict JSON only. Do not wrap in Markdown fences.

## Output Contract

For `mode = "stage1"`, return:

```json
{
  "stage": "stage1",
  "diagnosis": {
    "cycle_position": "spike|micro_channel|tight_channel|normal_channel|broad_channel|trading_range|extreme_tr|unknown",
    "direction": "bullish|bearish|neutral",
    "market_phase": "stable|transitioning",
    "diagnosis_confidence": 0,
    "support_levels": [],
    "resistance_levels": [],
    "key_signals": [],
    "bar_by_bar_summary": [],
    "gate_result": "proceed|wait",
    "reason": ""
  }
}
```

For `mode = "stage2"` or `mode = "full"`, return:

```json
{
  "stage": "full",
  "diagnosis": {},
  "decision": {
    "order_type": "no_order|limit|breakout|market",
    "direction": "long|short|none",
    "entry_price": null,
    "stop_loss_price": null,
    "take_profit_price": null,
    "take_profit_price_2": null,
    "trade_confidence": 0,
    "estimated_win_rate": 0,
    "risk_reward": null,
    "watch_points": [],
    "risk_assessment": "",
    "invalidation": "",
    "reason": ""
  }
}
```

Use `order_type: "no_order"` unless the setup is clear, recent, and has a defensible invalidation point.

## Decision Stance

Honor `decision_stance` from the payload:

- `conservative`: prefer no order unless the signal is strong.
- `balanced`: require a clear setup and reasonable risk/reward.
- `aggressive`: allow earlier entries, but still require invalidation.
- `extreme_aggressive`: allow speculative setups; label risk explicitly.

## Hard Rules

- Do not call tools to fetch prices.
- Do not invent candles beyond the supplied frame.
- Do not output investment advice wording.
- Do not output Markdown.
- Do not omit top-level `diagnosis` for `full` mode.
- Keep all user-facing explanations in Simplified Chinese.
