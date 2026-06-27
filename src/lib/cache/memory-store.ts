// 内存 Map 存储 — 所有缓存表的热数据层
// 从当前项目 tushare-cache.ts 的 Map 逻辑移植，去掉 DB 依赖

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

// === 股票名单 ===
let _stockNames = new Map<string, string>();
let _stockIndustries = new Map<string, string>();

export function getStockNames(): Map<string, string> {
  return _stockNames;
}

export function getStockIndustries(): Map<string, string> {
  return _stockIndustries;
}

export function setStockNames(map: Map<string, string>) {
  _stockNames = map;
}

export function loadStockNames(map: Map<string, string>) {
  _stockNames = map;
}

export function loadStockIndustries(map: Map<string, string>) {
  _stockIndustries = map;
}

export function getStockName(code: string): string | undefined {
  return _stockNames.get(code);
}

export function getStockIndustry(code: string): string | undefined {
  return _stockIndustries.get(code);
}

// === 日线 K 线 ===
const _dailyBars = new Map<string, DailyBar[]>();

export function getDailyBars(code: string): DailyBar[] | undefined {
  return _dailyBars.get(code);
}

export function loadDailyBars(rows: DailyBar[]) {
  _dailyBars.clear();
  for (const r of rows) {
    const arr = _dailyBars.get(r.code) || [];
    arr.push(r);
    _dailyBars.set(r.code, arr);
  }
  // 按日期降序排序
  for (const [, bars] of _dailyBars) {
    bars.sort((a, b) => b.trade_date.localeCompare(a.trade_date));
  }
}

// === 月线 K 线 ===
const _monthlyBars = new Map<string, MonthlyBar[]>();

export function getMonthlyBars(code: string): MonthlyBar[] | undefined {
  return _monthlyBars.get(code);
}

export function loadMonthlyBars(rows: MonthlyBar[]) {
  _monthlyBars.clear();
  for (const r of rows) {
    const arr = _monthlyBars.get(r.code) || [];
    arr.push(r);
    _monthlyBars.set(r.code, arr);
  }
  for (const [, bars] of _monthlyBars) {
    bars.sort((a, b) => b.trade_date.localeCompare(a.trade_date));
  }
}

// === 周线 K 线 ===
const _weeklyBars = new Map<string, WeeklyBar[]>();

export function getWeeklyBars(code: string): WeeklyBar[] | undefined {
  return _weeklyBars.get(code);
}

export function loadWeeklyBars(rows: WeeklyBar[]) {
  _weeklyBars.clear();
  for (const r of rows) {
    const arr = _weeklyBars.get(r.code) || [];
    arr.push(r);
    _weeklyBars.set(r.code, arr);
  }
  for (const [, bars] of _weeklyBars) {
    bars.sort((a, b) => b.trade_date.localeCompare(a.trade_date));
  }
}

// === 分红 ===
const _dividends = new Map<string, Map<string, DividendRecord>>();
let _dividendsLoaded = false;

export function hasDividendsLoaded(): boolean {
  return _dividendsLoaded;
}

export function loadDividends(rows: DividendRecord[]) {
  _dividends.clear();
  for (const r of rows) {
    let inner = _dividends.get(r.code);
    if (!inner) {
      inner = new Map();
      _dividends.set(r.code, inner);
    }
    inner.set(r.end_date, r);
  }
  _dividendsLoaded = true;
}

export function getDividendsForCode(code: string): Map<string, DividendRecord> | undefined {
  return _dividends.get(code);
}

export function putDividend(code: string, endDate: string, data: { cash_div: number; stk_div: number; ann_date: string }) {
  let inner = _dividends.get(code);
  if (!inner) {
    inner = new Map();
    _dividends.set(code, inner);
  }
  inner.set(endDate, { code, end_date: endDate, ...data });
}

// === MACD ===
const _macdFactors = new Map<string, MACDFactor[]>();

export function getMACDFactors(code: string): MACDFactor[] | undefined {
  return _macdFactors.get(code);
}

export function loadMACDFactors(rows: MACDFactor[]) {
  _macdFactors.clear();
  for (const r of rows) {
    const arr = _macdFactors.get(r.code) || [];
    arr.push(r);
    _macdFactors.set(r.code, arr);
  }
  for (const [, factors] of _macdFactors) {
    factors.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  }
}

export function putMACDFactor(code: string, factors: MACDFactor[]) {
  const existing = _macdFactors.get(code) || [];
  for (const f of factors) {
    const idx = existing.findIndex((e) => e.trade_date === f.trade_date);
    if (idx >= 0) existing[idx] = f;
    else existing.push(f);
  }
  _macdFactors.set(code, existing);
  existing.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
}

// === CYQ ===
const _cyqPerf = new Map<string, CyqPerf[]>();

export function getCyqPerf(code: string): CyqPerf[] | undefined {
  return _cyqPerf.get(code);
}

export function loadCyqPerf(rows: CyqPerf[]) {
  _cyqPerf.clear();
  for (const r of rows) {
    const arr = _cyqPerf.get(r.code) || [];
    arr.push(r);
    _cyqPerf.set(r.code, arr);
  }
  for (const [, items] of _cyqPerf) {
    items.sort((a, b) => b.trade_date.localeCompare(a.trade_date));
  }
}

export function putCyqPerf(code: string, data: CyqPerf) {
  const existing = _cyqPerf.get(code) || [];
  const idx = existing.findIndex((e) => e.trade_date === data.trade_date);
  if (idx >= 0) existing[idx] = data;
  else existing.push(data);
  _cyqPerf.set(code, existing);
  existing.sort((a, b) => b.trade_date.localeCompare(a.trade_date));
}

// === Daily Basic (PE/PB/换手/市值) ===
const _dailyBasics = new Map<string, DailyBasic[]>();

export function getDailyBasic(code: string): DailyBasic | undefined {
  const arr = _dailyBasics.get(code);
  if (!arr || arr.length === 0) return undefined;
  return arr[0]; // 最新一条
}

export function loadDailyBasics(rows: DailyBasic[]) {
  _dailyBasics.clear();
  for (const r of rows) {
    const arr = _dailyBasics.get(r.code) || [];
    arr.push(r);
    _dailyBasics.set(r.code, arr);
  }
  for (const [, items] of _dailyBasics) {
    items.sort((a, b) => b.trade_date.localeCompare(a.trade_date));
  }
}

// === Finance (财务指标) ===
const _finances = new Map<string, FinanceIndicator[]>();

export function getLatestFinance(code: string): FinanceIndicator | undefined {
  const arr = _finances.get(code);
  if (!arr || arr.length === 0) return undefined;
  return arr[0]; // 最新一条
}

export function loadFinances(rows: FinanceIndicator[]) {
  _finances.clear();
  for (const r of rows) {
    const arr = _finances.get(r.code) || [];
    arr.push(r);
    _finances.set(r.code, arr);
  }
  for (const [, items] of _finances) {
    items.sort((a, b) => b.end_date.localeCompare(a.end_date));
  }
}
