// Tushare 批量拉取 — 按 trade_date 批量查询全市场数据
// 用于每日增量更新
import { tushareCall } from "./client";

// Tushare 日期格式: YYYYMMDD
async function getLatestTradeDate(): Promise<string> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0].replace(/-/g, "");

  // 获取最近 10 天的交易日历
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 10);
  const startStr = startDate.toISOString().split("T")[0].replace(/-/g, "");

  const rows = await tushareCall(
    "trade_cal",
    { exchange: "SSE", start_date: startStr, end_date: todayStr, is_open: "1" },
    "cal_date,is_open"
  );

  if (rows.length === 0) throw new Error("No recent trading days found");
  // 按日期降序取最新
  rows.sort((a, b) => String(b.cal_date).localeCompare(String(a.cal_date)));
  return String(rows[0].cal_date);
}

// ts_code → 纯数字 code
function stripTsCode(tsCode: string): string {
  return tsCode.replace(/\.(SH|SZ|BJ)$/, "");
}

interface DailyBarRaw {
  code: string;
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface DailyBasicRaw {
  code: string;
  trade_date: string;
  pe: number;
  pe_ttm: number;
  pb: number;
  total_mv: number;
  circ_mv: number;
  turnover_rate: number;
  volume_ratio: number;
}

// 按 trade_date 批量拉取日线数据
export async function fetchDailyBars(tradeDate: string): Promise<DailyBarRaw[]> {
  const rows = await tushareCall(
    "daily",
    { trade_date: tradeDate },
    "ts_code,trade_date,open,high,low,close"
  );
  return rows.map((r) => ({
    code: stripTsCode(String(r.ts_code || "")),
    trade_date: String(r.trade_date || tradeDate),
    open: Number(r.open || 0),
    high: Number(r.high || 0),
    low: Number(r.low || 0),
    close: Number(r.close || 0),
  }));
}

// 按 trade_date 批量拉取每日基本面
export async function fetchDailyBasic(tradeDate: string): Promise<DailyBasicRaw[]> {
  const rows = await tushareCall(
    "daily_basic",
    { trade_date: tradeDate },
    "ts_code,trade_date,pe,pe_ttm,pb,total_mv,circ_mv,turnover_rate,volume_ratio"
  );
  return rows.map((r) => ({
    code: stripTsCode(String(r.ts_code || "")),
    trade_date: String(r.trade_date || tradeDate),
    pe: Number(r.pe || 0),
    pe_ttm: Number(r.pe_ttm || 0),
    pb: Number(r.pb || 0),
    total_mv: Number(r.total_mv || 0),
    circ_mv: Number(r.circ_mv || 0),
    turnover_rate: Number(r.turnover_rate || 0),
    volume_ratio: Number(r.volume_ratio || 0),
  }));
}

export { getLatestTradeDate };
