import {
  fetchCyqPerf,
  fetchDailyBars,
  fetchDailyBasic,
  fetchFinanceIndicators,
  fetchMacdFactors,
  fetchMonthlyBars,
  fetchWeeklyBars,
  getLatestTradeDate,
} from "./bulk-fetch";
import { upsertToSupabase, getSupabase } from "../cache/supabase";
import { recomputeForDate } from "../screening/indicator-recompute";
import type { CyqPerf, DailyBar, DailyBasic, FinanceIndicator, MACDFactor, MonthlyBar, WeeklyBar } from "../types";

interface IndicatorCounts {
  kdj: number;
  rsi: number;
  boll: number;
  wr: number;
  bias: number;
}

export interface RefreshStep {
  name: string;
  ok: boolean;
  rows?: number;
  message?: string;
}

export interface RefreshResult {
  success: boolean;
  tradeDate: string;
  steps: RefreshStep[];
}

export interface RefreshDeps {
  getLatestTradeDate?: () => Promise<string>;
  fetchDailyBars?: (tradeDate: string) => Promise<DailyBar[]>;
  fetchDailyBasic?: (tradeDate: string) => Promise<DailyBasic[]>;
  fetchWeeklyBars?: (tradeDate: string) => Promise<WeeklyBar[]>;
  fetchMonthlyBars?: (tradeDate: string) => Promise<MonthlyBar[]>;
  fetchMacdFactors?: (tradeDate: string) => Promise<MACDFactor[]>;
  fetchCyqPerf?: (tradeDate: string) => Promise<CyqPerf[]>;
  fetchFinanceIndicators?: (period: string, codes: string[]) => Promise<FinanceIndicator[]>;
  recomputeForDate?: (tradeDate: string) => Promise<IndicatorCounts>;
  upsertToSupabase?: (table: string, rows: Record<string, unknown>[]) => Promise<void>;
  getStockCodes?: () => Promise<string[]>;
}

export interface RefreshOptions {
  financeLimit?: number;
  includeFinance?: boolean;
}

const DEFAULT_FINANCE_LIMIT = 25;

function currentAnnualPeriod(now = new Date()): string {
  return `${now.getUTCFullYear() - 1}1231`;
}

function rotatingSlice<T>(items: T[], limit: number, now = new Date()): T[] {
  if (limit <= 0 || items.length === 0) return [];
  const day = Math.floor(now.getTime() / 86_400_000);
  const start = (day * limit) % items.length;
  const doubled = items.concat(items);
  return doubled.slice(start, start + Math.min(limit, items.length));
}

async function defaultGetStockCodes(): Promise<string[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from("stock_basic_cache").select("code").order("code");
  if (error) throw error;
  return (data || []).map((row) => String(row.code));
}

export async function runDailyRefresh(deps: RefreshDeps = {}, options: RefreshOptions = {}): Promise<RefreshResult> {
  const getDate = deps.getLatestTradeDate || getLatestTradeDate;
  const upsert = deps.upsertToSupabase || upsertToSupabase;
  const steps: RefreshStep[] = [];
  let tradeDate = "";

  const runStep = async <T extends object>(
    name: string,
    table: string | null,
    load: () => Promise<T[]>
  ): Promise<T[]> => {
    try {
      const rows = await load();
      if (table && rows.length > 0) await upsert(table, rows as unknown as Record<string, unknown>[]);
      steps.push({ name, ok: true, rows: rows.length });
      return rows;
    } catch (error) {
      steps.push({ name, ok: false, message: (error as Error).message || String(error) });
      throw error;
    }
  };

  try {
    tradeDate = await getDate();

    await runStep("daily_bar_cache", "daily_bar_cache", () => (deps.fetchDailyBars || fetchDailyBars)(tradeDate));
    await runStep("daily_basic_cache", "daily_basic_cache", () => (deps.fetchDailyBasic || fetchDailyBasic)(tradeDate));
    await runStep("weekly_bar_cache", "weekly_bar_cache", () => (deps.fetchWeeklyBars || fetchWeeklyBars)(tradeDate));
    await runStep("monthly_bar_cache", "monthly_bar_cache", () => (deps.fetchMonthlyBars || fetchMonthlyBars)(tradeDate));
    await runStep("macd_factor_cache", "macd_factor_cache", () => (deps.fetchMacdFactors || fetchMacdFactors)(tradeDate));
    await runStep("cyq_perf_cache", "cyq_perf_cache", () => (deps.fetchCyqPerf || fetchCyqPerf)(tradeDate));

    if (options.includeFinance ?? true) {
      const codes = rotatingSlice(
        await (deps.getStockCodes || defaultGetStockCodes)(),
        options.financeLimit ?? DEFAULT_FINANCE_LIMIT
      );
      await runStep("finance_cache", "finance_cache", () =>
        (deps.fetchFinanceIndicators || fetchFinanceIndicators)(currentAnnualPeriod(), codes)
      );
    }

    try {
      const counts = await (deps.recomputeForDate || recomputeForDate)(tradeDate);
      steps.push({
        name: "technical_indicator_cache",
        ok: true,
        rows: counts.kdj + counts.rsi + counts.boll + counts.wr + counts.bias,
        message: `KDJ=${counts.kdj}, RSI=${counts.rsi}, BOLL=${counts.boll}, WR=${counts.wr}, BIAS=${counts.bias}`,
      });
    } catch (error) {
      steps.push({ name: "technical_indicator_cache", ok: false, message: (error as Error).message || String(error) });
      throw error;
    }

    return { success: true, tradeDate, steps };
  } catch {
    return { success: false, tradeDate, steps };
  }
}
