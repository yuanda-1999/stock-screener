// Tushare 批量拉取 — 按 trade_date 批量查询全市场数据
// 用于每日增量更新
import { tushareCall } from "./client";
import { calcMACD } from "./indicators";
import type { CyqPerf, FinanceIndicator, MACDFactor, MonthlyBar, WeeklyBar } from "../types";

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
export function stripTsCode(tsCode: string): string {
  return tsCode.replace(/\.(SH|SZ|BJ)$/, "");
}

function tsCode(code: string): string {
  const suffix = code.startsWith("6") ? "SH"
    : code.startsWith("8") || code.startsWith("9") || code.startsWith("4") ? "BJ"
    : "SZ";
  return `${code}.${suffix}`;
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

export function mapWeeklyRows(rows: Record<string, unknown>[]): WeeklyBar[] {
  return rows.map((r) => ({
    code: stripTsCode(String(r.ts_code || "")),
    trade_date: String(r.trade_date || ""),
    high: Number(r.high || 0),
    low: Number(r.low || 0),
    close: Number(r.close || 0),
  }));
}

export function mapMonthlyRows(rows: Record<string, unknown>[]): MonthlyBar[] {
  return mapWeeklyRows(rows);
}

export function mapMacdRows(rows: Record<string, unknown>[]): MACDFactor[] {
  return rows.map((r) => ({
    code: stripTsCode(String(r.ts_code || r.code || "")),
    trade_date: String(r.trade_date || ""),
    macd: Number(r.macd || 0),
  }));
}

export function mapCyqPerfRows(rows: Record<string, unknown>[]): CyqPerf[] {
  return rows.map((r) => ({
    code: stripTsCode(String(r.ts_code || "")),
    trade_date: String(r.trade_date || ""),
    cost_5pct: Number(r.cost_5pct || 0),
    cost_95pct: Number(r.cost_95pct || 0),
  }));
}

export function mapFinanceRows(rows: Record<string, unknown>[]): FinanceIndicator[] {
  return rows.map((r) => ({
    code: stripTsCode(String(r.ts_code || "")),
    end_date: String(r.end_date || ""),
    roe: Number(r.roe || 0),
    eps: Number(r.eps || 0),
    bps: Number(r.bps || 0),
    grossprofit_margin: Number(r.grossprofit_margin || 0),
    netprofit_margin: Number(r.netprofit_margin || 0),
    debt_to_assets: Number(r.debt_to_assets || 0),
    revenue_growth: Number(r.revenue_growth ?? r.or_yoy ?? 0),
    profit_growth: Number(r.profit_growth ?? r.profit_dedt ?? 0),
  }));
}

export async function fetchWeeklyBars(tradeDate: string): Promise<WeeklyBar[]> {
  const rows = await tushareCall("weekly", { trade_date: tradeDate }, "ts_code,trade_date,high,low,close");
  return mapWeeklyRows(rows);
}

export async function fetchMonthlyBars(tradeDate: string): Promise<MonthlyBar[]> {
  const rows = await tushareCall("monthly", { trade_date: tradeDate }, "ts_code,trade_date,high,low,close");
  return mapMonthlyRows(rows);
}

export async function fetchMacdFactors(tradeDate: string): Promise<MACDFactor[]> {
  const rows = await tushareCall("stk_factor", { trade_date: tradeDate }, "ts_code,trade_date,macd");
  return mapMacdRows(rows);
}

export async function fetchCyqPerf(tradeDate: string): Promise<CyqPerf[]> {
  const rows = await tushareCall("cyq_perf", { trade_date: tradeDate }, "ts_code,trade_date,cost_5pct,cost_95pct");
  return mapCyqPerfRows(rows);
}

export async function fetchFinanceIndicators(period: string, codes: string[]): Promise<FinanceIndicator[]> {
  const all: FinanceIndicator[] = [];
  for (const code of codes) {
    const rows = await tushareCall(
      "fina_indicator",
      { ts_code: tsCode(code), end_date: period },
      "ts_code,end_date,roe,eps,bps,grossprofit_margin,netprofit_margin,debt_to_assets,or_yoy,profit_dedt"
    );
    const [latest] = mapFinanceRows(rows);
    if (latest) all.push(latest);
  }
  return all;
}

export function computeMacdFactorsFromWeeklyBars(rows: WeeklyBar[]): MACDFactor[] {
  const byCode = new Map<string, WeeklyBar[]>();
  for (const row of rows) {
    const items = byCode.get(row.code) || [];
    items.push(row);
    byCode.set(row.code, items);
  }

  const factors: MACDFactor[] = [];
  for (const [code, bars] of byCode) {
    bars.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    const { macd } = calcMACD(bars.map((b) => b.close));
    bars.forEach((bar, idx) => {
      factors.push({ code, trade_date: bar.trade_date, macd: +macd[idx].toFixed(6) });
    });
  }
  return factors;
}

export { getLatestTradeDate };
