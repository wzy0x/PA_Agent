# PA Agent JS MCP

Bun/JavaScript MCP server for PA Agent workflows. It is intentionally separate
from the existing Python desktop app.

## Tools

- `eastmoney_klines`: fetch A-share OHLCV bars from EastMoney public endpoints.
- `analysis_frame`: build the closed-only frame used for AI analysis.
- `live_frame`: build the chart frame, including a forming bar when present.
- `pa_analysis_task`: convert a closed-only frame into a compact task payload for
  Codex/Agent skills.

## Install

```powershell
cd F:\a股\PA_Agent\mcp-js
bun install
```

If `bun install` is slow on the current network, `npm install` also works. The
runtime command still uses Bun.

## Install Skill

```powershell
cd F:\a股\PA_Agent\mcp-js
npm run install-skill
```

This copies `skills/pa-price-action` into the active Codex skills directory.

## Run Manually

```powershell
bun src/server.js
```

The server uses stdio transport, so it normally waits for an MCP client.

## Register In Codex

```powershell
codex mcp add pa-agent-js -- bun F:\a股\PA_Agent\mcp-js\src\server.js
```

Then restart the Codex session and ask Codex to use the `pa-agent-js` MCP tools.

## Smoke Test

```powershell
cd F:\a股\PA_Agent\mcp-js
npm run smoke
```

Expected output includes:

```text
tools=eastmoney_klines,analysis_frame,live_frame,pa_analysis_task
eastmoney=sh600519 bars=5
```

## Intended Flow

1. Fetch public market data with `eastmoney_klines`.
2. Build a closed-only analysis frame with `analysis_frame`.
3. Generate a skill-friendly analysis payload with `pa_analysis_task`.
4. Let Codex use a Price Action skill to produce the final diagnosis/decision JSON.

No Python runtime is required for this MCP server.
