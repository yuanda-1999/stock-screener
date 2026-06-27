import { describe, expect, test } from "bun:test";
import {
  mapCyqPerfRows,
  mapFinanceRows,
  mapMacdRows,
  mapMonthlyRows,
  mapWeeklyRows,
} from "./bulk-fetch";

describe("bulk fetch row mappers", () => {
  test("maps weekly and monthly Tushare rows to local bar rows", () => {
    const rows = [{ ts_code: "000001.SZ", trade_date: "20260626", high: "12.3", low: "10.1", close: "11.2" }];

    expect(mapWeeklyRows(rows)).toEqual([{ code: "000001", trade_date: "20260626", high: 12.3, low: 10.1, close: 11.2 }]);
    expect(mapMonthlyRows(rows)).toEqual([{ code: "000001", trade_date: "20260626", high: 12.3, low: 10.1, close: 11.2 }]);
  });

  test("maps MACD, CYQ, and finance rows to local cache rows", () => {
    expect(mapMacdRows([{ ts_code: "600000.SH", trade_date: "20260626", macd: "0.1234" }])).toEqual([
      { code: "600000", trade_date: "20260626", macd: 0.1234 },
    ]);
    expect(mapCyqPerfRows([{ ts_code: "920001.BJ", trade_date: "20260626", cost_5pct: "1.1", cost_95pct: "2.2" }])).toEqual([
      { code: "920001", trade_date: "20260626", cost_5pct: 1.1, cost_95pct: 2.2 },
    ]);
    expect(mapFinanceRows([{
      ts_code: "300001.SZ",
      end_date: "20251231",
      roe: "1",
      eps: "2",
      bps: "3",
      grossprofit_margin: "4",
      netprofit_margin: "5",
      debt_to_assets: "6",
      revenue_growth: "7",
      profit_growth: "8",
    }])).toEqual([{
      code: "300001",
      end_date: "20251231",
      roe: 1,
      eps: 2,
      bps: 3,
      grossprofit_margin: 4,
      netprofit_margin: 5,
      debt_to_assets: 6,
      revenue_growth: 7,
      profit_growth: 8,
    }]);
  });
});
