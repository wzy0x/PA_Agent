import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));

const transport = new StdioClientTransport({
  command: "bun",
  args: ["src/server.js"],
  cwd
});

const client = new Client({
  name: "pa-agent-js-smoke",
  version: "0.1.0"
});

await client.connect(transport);

const tools = await client.listTools();
console.log(`tools=${tools.tools.map((tool) => tool.name).join(",")}`);

const result = await client.callTool({
  name: "eastmoney_klines",
  arguments: {
    symbol: "600519",
    timeframe: "1d",
    count: 5
  }
});

const text = result.content?.[0]?.text || "{}";
const payload = JSON.parse(text);
console.log(`eastmoney=${payload.symbol} bars=${payload.bars.length} first=${payload.bars[0].time}`);

await client.close();
