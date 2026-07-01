const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  referer: "https://quote.eastmoney.com/"
};

const KLINE_HOSTS = [
  "https://push2his.eastmoney.com",
  "https://push2delay.eastmoney.com",
  "https://33.push2his.eastmoney.com",
  "https://63.push2his.eastmoney.com"
];
const UT = "fa5fd1943c7b386f172d6893dbfba10b";

const PERIOD_BY_TIMEFRAME = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "1d": "101",
  "1w": "102",
  "1M": "103"
};

export function normalizeAshareSymbol(symbol) {
  const raw = String(symbol || "").trim().toLowerCase();
  if (/^(sh|sz)\d{6}$/.test(raw)) return raw;
  const digits = raw.replace(/\D/g, "").slice(-6);
  if (!digits) return "";
  if (digits.startsWith("399")) return `sz${digits}`;
  if (digits.startsWith("0") || digits.startsWith("2") || digits.startsWith("3")) return `sz${digits}`;
  return `sh${digits}`;
}

function secidFor(symbol) {
  const normalized = normalizeAshareSymbol(symbol);
  if (!normalized) throw new Error("Invalid A-share symbol");
  const market = normalized.startsWith("sh") ? "1" : "0";
  return `${market}.${normalized.slice(2)}`;
}

function fields1() {
  return "f1,f2,f3,f4,f5,f6";
}

function fields2() {
  return "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61";
}

function parseKlineRow(row) {
  const parts = String(row).split(",");
  if (parts.length < 6) throw new Error(`Unexpected EastMoney kline row: ${row}`);
  const [time, open, close, high, low, volume, amount, amplitude, pctChg] = parts;
  return {
    time,
    ts_open: new Date(time.length <= 10 ? `${time}T00:00:00+08:00` : `${time.replace(" ", "T")}+08:00`).getTime(),
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(volume || 0),
    amount: Number(amount || 0),
    pct_chg: pctChg === undefined || pctChg === "" ? null : Number(pctChg)
  };
}

function isFiniteBar(bar) {
  return [bar.ts_open, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite);
}

export async function fetchEastMoneyKlines({
  symbol,
  timeframe = "1d",
  count = 160,
  adjust = "qfq"
}) {
  const period = PERIOD_BY_TIMEFRAME[timeframe];
  if (!period) {
    throw new Error(`Unsupported timeframe: ${timeframe}`);
  }
  const params = new URLSearchParams({
    secid: secidFor(symbol),
    klt: period,
    fqt: adjust === "hfq" ? "2" : adjust === "none" ? "0" : "1",
    end: "20500101",
    lmt: String(Math.max(1, Math.min(Number(count) || 160, 5000))),
    fields1: fields1(),
    fields2: fields2(),
    ut: UT
  });
  const payload = await fetchKlinePayload(params);
  const rows = payload?.data?.klines;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`EastMoney returned no kline rows for ${symbol} ${timeframe}`);
  }

  const asc = rows.map(parseKlineRow).filter(isFiniteBar);
  const newest = asc.reverse().map((bar, index) => ({
    seq: index + 1,
    ...bar,
    closed: index !== 0 ? true : !isLikelyFormingBar(bar, timeframe)
  }));
  return {
    source: "eastmoney",
    symbol: normalizeAshareSymbol(symbol),
    timeframe,
    bars: newest
  };
}

async function fetchKlinePayload(params) {
  let lastError = null;
  for (const host of KLINE_HOSTS) {
    const url = `${host}/api/qt/stock/kline/get?${params.toString()}`;
    try {
      const headers = { ...DEFAULT_HEADERS };
      if (host.includes("push2delay")) headers.host = "push2his.eastmoney.com";
      return await httpsGetJson(url, headers);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`EastMoney request failed: ${lastError?.message || lastError}`);
}

function httpsGetJson(url, headers) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers,
        family: 4,
        timeout: 12000
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
            reject(new Error(`HTTP ${response.statusCode}: ${body.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Invalid JSON from EastMoney: ${error.message}`));
          }
        });
      }
    );
    request.on("timeout", () => {
      request.destroy(new Error("EastMoney request timed out"));
    });
    request.on("error", reject);
  });
}

function isLikelyFormingBar(bar, timeframe) {
  const now = new Date();
  const cn = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const day = cn.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = cn.getHours() * 60 + cn.getMinutes();
  const inSession = (minutes >= 570 && minutes < 690) || (minutes >= 780 && minutes < 900);
  if (!inSession) return false;

  const open = new Date(bar.ts_open);
  const openCn = new Date(open.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  if (timeframe === "1d") {
    return openCn.toDateString() === cn.toDateString();
  }
  return true;
}
import https from "node:https";
