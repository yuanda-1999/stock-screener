import { describe, expect, test } from "bun:test";
import { runDailyRefresh } from "./refresh";

describe("runDailyRefresh", () => {
  test("updates all daily refresh tables and recomputes indicators", async () => {
    const calls: string[] = [];

    const result = await runDailyRefresh({
      getLatestTradeDate: async () => "20260626",
      fetchDailyBars: async () => [{ code: "000001", trade_date: "20260626", open: 1, high: 2, low: 1, close: 2 }],
      fetchDailyBasic: async () => [{ code: "000001", trade_date: "20260626", pe: 1, pe_ttm: 1, pb: 1, total_mv: 1, circ_mv: 1, turnover_rate: 1, volume_ratio: 1 }],
      fetchWeeklyBars: async () => [{ code: "000001", trade_date: "20260626", high: 2, low: 1, close: 2 }],
      fetchMonthlyBars: async () => [{ code: "000001", trade_date: "20260630", high: 2, low: 1, close: 2 }],
      fetchMacdFactors: async () => [{ code: "000001", trade_date: "20260626", macd: 0.1 }],
      fetchCyqPerf: async () => [{ code: "000001", trade_date: "20260626", cost_5pct: 1, cost_95pct: 2 }],
      getStockCodes: async () => ["000001"],
      fetchFinanceIndicators: async () => [{ code: "000001", end_date: "20251231", roe: 1, eps: 1, bps: 1, grossprofit_margin: 1, netprofit_margin: 1, debt_to_assets: 1, revenue_growth: 1, profit_growth: 1 }],
      recomputeForDate: async (tradeDate) => {
        calls.push(`recompute:${tradeDate}`);
        return { kdj: 1, rsi: 1, boll: 1, wr: 1, bias: 1 };
      },
      upsertToSupabase: async (table, rows) => {
        calls.push(`${table}:${rows.length}`);
      },
    });

    expect(result.success).toBe(true);
    expect(result.tradeDate).toBe("20260626");
    expect(calls).toEqual([
      "daily_bar_cache:1",
      "daily_basic_cache:1",
      "weekly_bar_cache:1",
      "monthly_bar_cache:1",
      "macd_factor_cache:1",
      "cyq_perf_cache:1",
      "finance_cache:1",
      "recompute:20260626",
    ]);
  });

  test("reports failure when a required refresh step fails", async () => {
    const result = await runDailyRefresh({
      getLatestTradeDate: async () => "20260626",
      fetchDailyBars: async () => {
        throw new Error("Tushare daily failed");
      },
    });

    expect(result.success).toBe(false);
    expect(result.steps.some((step) => step.ok === false && step.name === "daily_bar_cache")).toBe(true);
  });
});
