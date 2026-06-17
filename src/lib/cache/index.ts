// 统一缓存接口 — env 驱动二选一
// SUPABASE_URL 存在 → Supabase；否则 → 本地 SQLite

import { loadAll, insertMany, saveDbToDisk } from "./local-sqlite";
import {
  loadStockNames,
  loadDailyBars as loadDailyBarsMem,
  loadMonthlyBars,
  loadWeeklyBars,
  loadDividends,
  loadMACDFactors,
  loadCyqPerf,
  loadDailyBasics,
  loadFinances,
} from "./memory-store";
import type {
  StockBasic,
  DailyBar,
  MonthlyBar,
  WeeklyBar,
  DividendRecord,
  MACDFactor,
  CyqPerf,
  DailyBasic,
  FinanceIndicator,
} from "../types";

const USE_SUPABASE = !!process.env.SUPABASE_URL;

export function isSupabaseMode(): boolean {
  return USE_SUPABASE;
}

// === 写缓冲（批量刷新） ===
const writeBuffer: Map<string, Record<string, unknown>[]> = new Map();

export function bufferWrite(table: string, row: Record<string, unknown>) {
  const arr = writeBuffer.get(table) || [];
  arr.push(row);
  writeBuffer.set(table, arr);
}

export function bufferedCount(): number {
  let total = 0;
  for (const rows of writeBuffer.values()) total += rows.length;
  return total;
}

export async function flushWrites() {
  for (const [table, rows] of writeBuffer) {
    if (rows.length === 0) continue;
    if (USE_SUPABASE) {
      const { upsertToSupabase } = await import("./supabase");
      await upsertToSupabase(table, rows);
    } else {
      insertMany(table, rows);
      saveDbToDisk();
    }
  }
  writeBuffer.clear();
}

// === 启动时全量加载 ===

export async function loadAllToMemory() {
  if (USE_SUPABASE) {
    const { loadAllFromSupabase } = await import("./supabase");

    // 大表加 orderBy + limit 只加载近期数据，避免 Vercel 超时/OOM
    // 每表独立 catch，单表失败不影响其他表
    const DAYS_90 = 500_000;  // 5000只 × ~100 条/只，够所有技术指标用
    const safe = async <T>(table: string, fn: () => Promise<T[]>): Promise<T[]> => {
      try {
        return await fn();
      } catch (e) {
        console.error(`[cache] ${table} load failed:`, (e as Error).message);
        return [];
      }
    };
    // 大表加 orderBy + limit 只加载近期数据。依赖 Supabase 数据库索引（trade_date / end_date）。
    const DAYS_90 = 500_000;
    const [stocks, divid, monthly, weekly, daily, macd, cyq, dailyBasic, finance] = await Promise.all([
      safe("stock_basic_cache", () => loadAllFromSupabase("stock_basic_cache")),
      safe("dividend_cache", () => loadAllFromSupabase("dividend_cache")),
      safe("monthly_bar_cache", () => loadAllFromSupabase("monthly_bar_cache", "*", { orderBy: "trade_date", limit: 200_000 })),
      safe("weekly_bar_cache", () => loadAllFromSupabase("weekly_bar_cache", "*", { orderBy: "trade_date", limit: 300_000 })),
      safe("daily_bar_cache", () => loadAllFromSupabase("daily_bar_cache", "*", { orderBy: "trade_date", limit: DAYS_90 })),
      safe("macd_factor_cache", () => loadAllFromSupabase("macd_factor_cache", "*", { orderBy: "trade_date", limit: DAYS_90 })),
      safe("cyq_perf_cache", () => loadAllFromSupabase("cyq_perf_cache", "*", { orderBy: "trade_date", limit: 100_000 })),
      safe("daily_basic_cache", () => loadAllFromSupabase("daily_basic_cache", "*", { orderBy: "trade_date", limit: 100_000 })),
      safe("finance_cache", () => loadAllFromSupabase("finance_cache", "*", { orderBy: "end_date", limit: 100_000 })),
    ]);

    if (!stocks.length) throw new Error("stock_basic_cache is empty — check Supabase connection");
    loadStockNames(new Map(stocks.map((s: Record<string, unknown>) => [s.code as string, s.name as string])));
    loadDividends(divid as unknown as DividendRecord[]);
    loadMonthlyBars(monthly as unknown as MonthlyBar[]);
    loadWeeklyBars(weekly as unknown as WeeklyBar[]);
    loadDailyBarsMem(daily as unknown as DailyBar[]);
    loadMACDFactors(macd as unknown as MACDFactor[]);
    loadCyqPerf(cyq as unknown as CyqPerf[]);
    if (dailyBasic.length) loadDailyBasics(dailyBasic as unknown as DailyBasic[]);
    if (finance.length) loadFinances(finance as unknown as FinanceIndicator[]);
    console.log(`[cache] Supabase: ${stocks.length} stocks, ${daily.length} daily, ${dailyBasic.length} basic, ${finance.length} fin`);
  } else {
    // 本地 SQLite（异步加载）
    const [stocks, divid, monthly, weekly, daily, macd, cyq, dailyBasic, finance] = await Promise.all([
      loadAll<StockBasic>("stock_basic_cache"),
      loadAll<DividendRecord>("dividend_cache"),
      loadAll<MonthlyBar>("monthly_bar_cache"),
      loadAll<WeeklyBar>("weekly_bar_cache"),
      loadAll<DailyBar>("daily_bar_cache"),
      loadAll<MACDFactor>("macd_factor_cache"),
      loadAll<CyqPerf>("cyq_perf_cache"),
      loadAll<DailyBasic>("daily_basic_cache"),
      loadAll<FinanceIndicator>("finance_cache"),
    ]);

    loadStockNames(new Map(stocks.map((s) => [s.code, s.name])));
    loadDividends(divid);
    loadMonthlyBars(monthly);
    loadWeeklyBars(weekly);
    loadDailyBarsMem(daily);
    loadMACDFactors(macd);
    loadCyqPerf(cyq);
    if (dailyBasic.length) loadDailyBasics(dailyBasic);
    if (finance.length) loadFinances(finance);
    console.log(`[cache] SQLite: ${stocks.length} stocks, ${divid.length} dividends, ${daily.length} daily bars`);
  }
}
