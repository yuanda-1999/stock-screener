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

// === 按需加载 ===

export interface LoadOptions {
  needsBars?: boolean;       // 是否需要日线/周线/月线（技术指标用）
  needsTechFactors?: boolean; // 是否需要 MACD/CYQ（MACD/筹码用）
  needsDividends?: boolean;   // 是否需要分红数据
  needsDailyBasic?: boolean;  // 是否需要每日基本面（PE/PB/市值等，默认 true）
  needsFinance?: boolean;     // 是否需要财务指标（ROE/EPS等，默认 true）
  needsStocks?: boolean;      // 是否需要股票列表（默认 true）
}

export interface CandidateLoadOptions {
  needsDaily?: boolean;
  needsMonthly?: boolean;
  needsWeekly?: boolean;
  needsMACD?: boolean;
  needsCYQ?: boolean;
}

// 按候选股代码按需加载 bar 和技术因子数据（跳过核心表）
export async function loadCandidatesToMemory(codes: string[], options: CandidateLoadOptions = {}) {
  if (!USE_SUPABASE) return;
  const { loadForCodes } = await import("./supabase");

  const safe = async <T>(label: string, fn: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await fn();
    } catch (e) {
      console.error(`[cache] ${label} load failed:`, (e as Error).message);
      return [];
    }
  };

  const jobs: Promise<unknown[]>[] = [];
  const labels: string[] = [];

  const add = (label: string, cond: boolean | undefined, table: string) => {
    if (cond) {
      jobs.push(safe(label, () => loadForCodes(table, codes, "*", { orderBy: "trade_date" })));
      labels.push(label);
    }
  };

  add("daily_bar", options.needsDaily, "daily_bar_cache");
  add("monthly_bar", options.needsMonthly, "monthly_bar_cache");
  add("weekly_bar", options.needsWeekly, "weekly_bar_cache");
  add("macd_factor", options.needsMACD, "macd_factor_cache");
  add("cyq_perf", options.needsCYQ, "cyq_perf_cache");

  if (jobs.length === 0) return;

  const results = await Promise.all(jobs);
  const get = (label: string) => {
    const idx = labels.indexOf(label);
    return idx >= 0 ? results[idx] || [] : [];
  };

  const daily = get("daily_bar");
  const monthly = get("monthly_bar");
  const weekly = get("weekly_bar");
  const macd = get("macd_factor");
  const cyq = get("cyq_perf");

  if (daily.length) loadDailyBarsMem(daily as unknown as DailyBar[]);
  if (monthly.length) loadMonthlyBars(monthly as unknown as MonthlyBar[]);
  if (weekly.length) loadWeeklyBars(weekly as unknown as WeeklyBar[]);
  if (macd.length) loadMACDFactors(macd as unknown as MACDFactor[]);
  if (cyq.length) loadCyqPerf(cyq as unknown as CyqPerf[]);

  console.log(`[cache] Candidates: ${codes.length} codes → ${daily.length} daily, ${monthly.length} monthly, ${weekly.length} weekly, ${macd.length} macd, ${cyq.length} cyq`);
}

// 按候选股代码加载分红数据（避免全量 dividend_cache 加载）
export async function loadDividendsForCandidates(codes: string[]) {
  if (!USE_SUPABASE || codes.length === 0) return;
  const { getSupabase } = await import("./supabase");
  const sb = getSupabase();

  const all: Record<string, unknown>[] = [];
  const CHUNK = 50;
  for (let c = 0; c < codes.length; c += CHUNK) {
    const chunk = codes.slice(c, c + CHUNK);
    for (let page = 0; page < 500; page++) {
      const { data, error } = await sb.from("dividend_cache").select("*")
        .in("code", chunk)
        .range(page * 1000, page * 1000 + 999);
      if (error) {
        console.error("[cache] dividend_cache load error:", error.message);
        break;
      }
      if (!data || data.length === 0) break;
      all.push(...(data as unknown as Record<string, unknown>[]));
      if (data.length < 1000) break;
    }
  }
  if (all.length) loadDividends(all as unknown as DividendRecord[]);
  console.log(`[cache] Dividends for ${codes.length} codes: ${all.length} rows`);
}

export async function loadAllToMemory(options: LoadOptions = {}) {
  if (USE_SUPABASE) {
    const { loadAllFromSupabase } = await import("./supabase");

    const safe = async <T>(table: string, fn: () => Promise<T[]>): Promise<T[]> => {
      try {
        return await fn();
      } catch (e) {
        console.error(`[cache] ${table} load failed:`, (e as Error).message);
        return [];
      }
    };

    // 核心表按需加载
    const coreJobs: Promise<unknown[]>[] = [];
    const jobLabels: string[] = [];

    const needsStocks = options.needsStocks !== false;
    const needsDailyBasic = options.needsDailyBasic !== false;
    const needsFinance = options.needsFinance !== false;

    if (needsStocks) {
      coreJobs.push(safe("stock_basic_cache", () => loadAllFromSupabase("stock_basic_cache")));
      jobLabels.push("stocks");
    }
    if (needsDailyBasic) {
      coreJobs.push(safe("daily_basic_cache", () => loadAllFromSupabase("daily_basic_cache", "*", { orderBy: "trade_date", limit: 20_000 })));
      jobLabels.push("dailyBasic");
    }
    if (needsFinance) {
      coreJobs.push(safe("finance_cache", () => loadAllFromSupabase("finance_cache", "*", { orderBy: "end_date", limit: 20_000 })));
      jobLabels.push("finance");
    }
    if (options.needsDividends) {
      coreJobs.push(safe("dividend_cache", () => loadAllFromSupabase("dividend_cache")));
      jobLabels.push("dividends");
    }

    const coreResults = await Promise.all(coreJobs);
    const getResult = (label: string) => {
      const idx = jobLabels.indexOf(label);
      return idx >= 0 ? coreResults[idx] || [] : [];
    };
    const stocks = getResult("stocks");
    const dailyBasic = getResult("dailyBasic");
    const finance = getResult("finance");
    const divid = getResult("dividends");

    if (needsStocks) {
      if (!stocks.length) throw new Error("stock_basic_cache is empty — check Supabase connection");
      loadStockNames(new Map((stocks as Record<string, unknown>[]).map((s) => [s.code as string, s.name as string])));
    } else {
      // 兜底：确保 loadStockNames 在内存中有数据（DB 筛选模式不需要重新加载）
    }
    if (needsDailyBasic && dailyBasic.length) loadDailyBasics(dailyBasic as unknown as DailyBasic[]);
    if (needsFinance && finance.length) loadFinances(finance as unknown as FinanceIndicator[]);
    if (options.needsDividends) loadDividends(divid as unknown as DividendRecord[]);

    let daily: unknown[] = [];
    let monthly: unknown[] = [];
    let weekly: unknown[] = [];
    let macd: unknown[] = [];
    let cyq: unknown[] = [];

    if (options.needsBars || options.needsTechFactors) {
      const barJobs: Promise<unknown[]>[] = [];
      if (options.needsBars) {
        barJobs.push(
          safe("daily_bar_cache", () => loadAllFromSupabase("daily_bar_cache", "*", { orderBy: "trade_date", limit: 80_000 })),
          safe("monthly_bar_cache", () => loadAllFromSupabase("monthly_bar_cache", "*", { orderBy: "trade_date", limit: 10_000 })),
          safe("weekly_bar_cache", () => loadAllFromSupabase("weekly_bar_cache", "*", { orderBy: "trade_date", limit: 20_000 })),
        );
      }
      if (options.needsTechFactors) {
        barJobs.push(
          safe("macd_factor_cache", () => loadAllFromSupabase("macd_factor_cache", "*", { orderBy: "trade_date", limit: 80_000 })),
          safe("cyq_perf_cache", () => loadAllFromSupabase("cyq_perf_cache", "*", { orderBy: "trade_date", limit: 10_000 })),
        );
      }
      const barResults = await Promise.all(barJobs);
      let idx = 0;
      if (options.needsBars) {
        daily = barResults[idx++] || [];
        monthly = barResults[idx++] || [];
        weekly = barResults[idx++] || [];
      }
      if (options.needsTechFactors) {
        macd = barResults[idx++] || [];
        cyq = barResults[idx++] || [];
      }
    }

    if (daily.length) loadDailyBarsMem(daily as unknown as DailyBar[]);
    if (monthly.length) loadMonthlyBars(monthly as unknown as MonthlyBar[]);
    if (weekly.length) loadWeeklyBars(weekly as unknown as WeeklyBar[]);
    if (macd.length) loadMACDFactors(macd as unknown as MACDFactor[]);
    if (cyq.length) loadCyqPerf(cyq as unknown as CyqPerf[]);

    console.log(`[cache] Supabase: ${stocks.length} stocks, ${daily.length} daily, ${dailyBasic.length} basic, ${finance.length} fin`);
  } else {
    // 本地 SQLite — 全量加载
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
