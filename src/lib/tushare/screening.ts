// 组合筛选生成器 — SSE 流式输出
// 从当前项目 tushare.ts tushareCombinedScreening 移植，扩展 25 个指标

import { tushareCall } from "./client";
import { calcMACD, calcKDJ, calcRSI, calcBOLL, calcWR, calcBIAS, calcCR, calcEMA } from "./indicators";
import {
  getStockNames,
  getDailyBars,
  getMonthlyBars,
  getWeeklyBars,
  getDividendsForCode,
  getMACDFactors,
  getCyqPerf,
  putDividend,
  putMACDFactor,
  putCyqPerf,
  getDailyBasic,
  getLatestFinance,
} from "../cache/memory-store";
import { bufferWrite, flushWrites } from "../cache/index";
import type {
  CombinedScreeningFilters,
  StockScreeningResult,
  SSEEvent,
} from "../types";

const SLEEP_MS = 80;
const FLUSH_EVERY = 100;
const PROGRESS_EVERY = 50;

// === 单指标 check 函数 ===

async function checkPrice(code: string, filter: { min: number; max: number }): Promise<number | null> {
  const bars = getDailyBars(code);
  if (!bars || bars.length === 0) {
    const rows = await tushareCall("daily", { ts_code: tsCode(code), start_date: "20260101", end_date: "20261231" }, "trade_date,close");
    if (rows.length === 0) return null;
    const close = Number(rows[0].close || 0);
    if (close <= 0) return null;
    return close >= filter.min && close <= filter.max ? close : null;
  }
  const close = bars[0].close;
  if (close >= filter.min && close <= filter.max) return close;
  return null;
}

async function checkChangeRate(code: string, filter: { min?: number; max?: number }): Promise<number | null> {
  const bars = getDailyBars(code);
  if (!bars || bars.length < 2) return null;
  const change = ((bars[0].close - bars[1].close) / bars[1].close) * 100;
  if (filter.min !== undefined && change < filter.min) return null;
  if (filter.max !== undefined && change > filter.max) return null;
  return change;
}

function checkTurnover(code: string, filter: { min?: number; max?: number }): number | null {
  const db = getDailyBasic(code);
  if (!db) return null;
  const r = db.turnover_rate;
  if (filter.min !== undefined && r < filter.min) return null;
  if (filter.max !== undefined && r > filter.max) return null;
  return r;
}

function checkVolumeRatio(code: string, filter: { min?: number; max?: number }): number | null {
  const db = getDailyBasic(code);
  if (!db) return null;
  const r = db.volume_ratio;
  if (filter.min !== undefined && r < filter.min) return null;
  if (filter.max !== undefined && r > filter.max) return null;
  return r;
}

function checkTotalMv(code: string, filter: { min?: number; max?: number }): number | null {
  const db = getDailyBasic(code);
  if (!db) return null;
  const r = db.total_mv;
  if (filter.min !== undefined && r < filter.min) return null;
  if (filter.max !== undefined && r > filter.max) return null;
  return r;
}

function checkCircMv(code: string, filter: { min?: number; max?: number }): number | null {
  const db = getDailyBasic(code);
  if (!db) return null;
  const r = db.circ_mv;
  if (filter.min !== undefined && r < filter.min) return null;
  if (filter.max !== undefined && r > filter.max) return null;
  return r;
}

function checkAmplitude(code: string, filter: { min?: number; max?: number }): number | null {
  const bars = getDailyBars(code);
  if (!bars || bars.length < 2) return null;
  const amp = ((bars[0].high - bars[0].low) / bars[1].close) * 100;
  if (filter.min !== undefined && amp < filter.min) return null;
  if (filter.max !== undefined && amp > filter.max) return null;
  return amp;
}

function checkPE(code: string, filter: { min?: number; max?: number }): number | null {
  const db = getDailyBasic(code);
  if (!db) return null;
  const r = db.pe_ttm || db.pe;
  if (r <= 0) return null;
  if (filter.min !== undefined && r < filter.min) return null;
  if (filter.max !== undefined && r > filter.max) return null;
  return r;
}

function checkPB(code: string, filter: { min?: number; max?: number }): number | null {
  const db = getDailyBasic(code);
  if (!db) return null;
  const r = db.pb;
  if (r <= 0) return null;
  if (filter.min !== undefined && r < filter.min) return null;
  if (filter.max !== undefined && r > filter.max) return null;
  return r;
}

function checkROE(code: string, filter: { min?: number; max?: number }): number | null {
  const f = getLatestFinance(code);
  if (!f) return null;
  const r = f.roe;
  if (filter.min !== undefined && r < filter.min) return null;
  if (filter.max !== undefined && r > filter.max) return null;
  return r;
}

function checkEPS(code: string, filter: { min?: number; max?: number }): number | null {
  const f = getLatestFinance(code);
  if (!f) return null;
  const r = f.eps;
  if (filter.min !== undefined && r < filter.min) return null;
  if (filter.max !== undefined && r > filter.max) return null;
  return r;
}

function checkGrossMargin(code: string, filter: { min?: number; max?: number }): number | null {
  const f = getLatestFinance(code);
  if (!f) return null;
  const r = f.grossprofit_margin;
  if (filter.min !== undefined && r < filter.min) return null;
  if (filter.max !== undefined && r > filter.max) return null;
  return r;
}

function checkNetMargin(code: string, filter: { min?: number; max?: number }): number | null {
  const f = getLatestFinance(code);
  if (!f) return null;
  const r = f.netprofit_margin;
  if (filter.min !== undefined && r < filter.min) return null;
  if (filter.max !== undefined && r > filter.max) return null;
  return r;
}

function checkDebtRatio(code: string, filter: { min?: number; max?: number }): number | null {
  const f = getLatestFinance(code);
  if (!f) return null;
  const r = f.debt_to_assets;
  if (filter.min !== undefined && r < filter.min) return null;
  if (filter.max !== undefined && r > filter.max) return null;
  return r;
}

function checkRevenueGrowth(code: string, filter: { min?: number; max?: number }): number | null {
  const f = getLatestFinance(code);
  if (!f) return null;
  const r = f.revenue_growth;
  if (filter.min !== undefined && r < filter.min) return null;
  if (filter.max !== undefined && r > filter.max) return null;
  return r;
}

function checkProfitGrowth(code: string, filter: { min?: number; max?: number }): number | null {
  const f = getLatestFinance(code);
  if (!f) return null;
  const r = f.profit_growth;
  if (filter.min !== undefined && r < filter.min) return null;
  if (filter.max !== undefined && r > filter.max) return null;
  return r;
}

async function checkMACD(
  code: string,
  filter: { years: number; thresholdPct: number }
): Promise<{ macd: number; macdMin: number; macdMax: number; pct: number } | null> {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setFullYear(startDate.getFullYear() - filter.years);
  const startStr = startDate.toISOString().split("T")[0].replace(/-/g, "");

  let factors = getMACDFactors(code);
  if (!factors || factors.length === 0) {
    const rows = await tushareCall(
      "daily",
      { ts_code: tsCode(code), start_date: startStr, end_date: now.toISOString().split("T")[0].replace(/-/g, "") },
      "trade_date,close"
    );
    if (rows.length < 35) return null;
    const closes = rows
      .map((d) => ({ date: String(d.trade_date || ""), close: Number(d.close || 0) }))
      .filter((c) => c.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    const vals = closes.map((c) => c.close);
    const ema12 = calcEMA(vals, 12);
    const ema26 = calcEMA(vals, 26);
    const dif = ema12.map((v, i) => v - ema26[i]);
    const dea = calcEMA(dif, 9);
    const macdData = [];
    for (let i = 33; i < vals.length; i++) {
      macdData.push({ code, trade_date: closes[i].date, macd: 2 * (dif[i] - dea[i]) });
    }
    putMACDFactor(code, macdData);
    factors = macdData;
  }

  if (factors.length < 2) return null;
  factors.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const recent = factors.slice(-Math.min(factors.length, filter.years * 250));
  const curMACD = factors[factors.length - 1].macd;
  const macdMin = Math.min(...recent.map((f) => f.macd));
  const macdMax = Math.max(...recent.map((f) => f.macd));
  const range = macdMax - macdMin;
  if (range <= 0) return null;
  const pct = ((curMACD - macdMin) / range) * 100;
  if (pct > filter.thresholdPct) return null;
  return { macd: curMACD, macdMin, macdMax, pct };
}

function checkKDJ(
  code: string,
  filter: { kMax?: number; dMax?: number; jMax?: number; method: string }
): { k: number; d: number; j: number } | null {
  const bars = getDailyBars(code);
  if (!bars || bars.length < 30) return null;
  const sorted = [...bars].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const highs = sorted.map((b) => b.high);
  const lows = sorted.map((b) => b.low);
  const closes = sorted.map((b) => b.close);
  const { k, d, j } = calcKDJ(highs, lows, closes);
  const lastK = k[k.length - 1];
  const lastD = d[d.length - 1];
  const lastJ = j[j.length - 1];
  const prevK = k[k.length - 2];
  const prevD = d[d.length - 2];

  if (filter.method === "超卖") {
    if (filter.jMax !== undefined && lastJ > filter.jMax) return null;
  } else if (filter.method === "低位") {
    if (filter.kMax !== undefined && lastK > filter.kMax) return null;
    if (filter.dMax !== undefined && lastD > filter.dMax) return null;
  } else if (filter.method === "金叉") {
    if (!(prevK < prevD && lastK > lastD)) return null;
  }
  return { k: lastK, d: lastD, j: lastJ };
}

function checkRSI(code: string, filter: { max: number }): number | null {
  const bars = getDailyBars(code);
  if (!bars || bars.length < 20) return null;
  const sorted = [...bars].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const closes = sorted.map((b) => b.close);
  const rsi = calcRSI(closes, 14);
  const cur = rsi[rsi.length - 1];
  if (cur > filter.max) return null;
  return cur;
}

function checkBOLL(
  code: string,
  filter: { method: string }
): { upper: number; mid: number; lower: number } | null {
  const bars = getDailyBars(code);
  if (!bars || bars.length < 25) return null;
  const sorted = [...bars].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const closes = sorted.map((b) => b.close);
  const boll = calcBOLL(closes);
  const lastClose = closes[closes.length - 1];
  const upper = boll.upper[boll.upper.length - 1];
  const mid = boll.mid[boll.mid.length - 1];
  const lower = boll.lower[boll.lower.length - 1];

  if (filter.method === "下轨附近") {
    const dist = ((lastClose - lower) / lower) * 100;
    if (dist > 5) return null;
  } else if (filter.method === "突破中轨") {
    const prevClose = closes[closes.length - 2];
    if (!(prevClose < mid && lastClose > mid)) return null;
  } else if (filter.method === "缩口") {
    const prev = bars.length > 5 ? bars[bars.length - 6] : null;
    if (!prev) return null;
  }
  return { upper, mid, lower };
}

function checkWR(code: string, filter: { min?: number; max?: number }): number | null {
  const bars = getDailyBars(code);
  if (!bars || bars.length < 15) return null;
  const sorted = [...bars].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const highs = sorted.map((b) => b.high);
  const lows = sorted.map((b) => b.low);
  const closes = sorted.map((b) => b.close);
  const wr = calcWR(highs, lows, closes, 10);
  const cur = wr[wr.length - 1];
  if (filter.min !== undefined && cur < filter.min) return null;
  if (filter.max !== undefined && cur > filter.max) return null;
  return cur;
}

function checkBIAS(code: string, filter: { min?: number; max?: number }): number | null {
  const bars = getDailyBars(code);
  if (!bars || bars.length < 10) return null;
  const sorted = [...bars].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const closes = sorted.map((b) => b.close);
  const bias = calcBIAS(closes, 6);
  const cur = bias[bias.length - 1];
  if (filter.min !== undefined && cur < filter.min) return null;
  if (filter.max !== undefined && cur > filter.max) return null;
  return cur;
}

async function checkDividend(
  code: string,
  filter: { minCashDiv: number; year: string }
): Promise<{ cashDiv: number; stkDiv: number; annDate: string } | null> {
  let divs = getDividendsForCode(code);
  if (!divs) {
    const rows = await tushareCall(
      "dividend",
      { ts_code: tsCode(code) },
      "ts_code,end_date,cash_div,stk_div,ann_date"
    );
    for (const r of rows) {
      const ed = String(r.end_date || "");
      if (!ed) continue;
      putDividend(code, ed, {
        cash_div: Number(r.cash_div || 0),
        stk_div: Number(r.stk_div || 0),
        ann_date: String(r.ann_date || ""),
      });
    }
    divs = getDividendsForCode(code);
    if (!divs) return null;
  }
  for (const [endDate, data] of divs) {
    if (!endDate.startsWith(filter.year)) continue;
    if (data.cash_div < filter.minCashDiv) continue;
    return { cashDiv: data.cash_div, stkDiv: data.stk_div, annDate: data.ann_date };
  }
  return null;
}

function checkDividendYield(
  code: string,
  filter: { min?: number; max?: number }
): number | null {
  const divs = getDividendsForCode(code);
  if (!divs) return null;
  const bars = getDailyBars(code);
  if (!bars || bars.length === 0) return null;
  const price = bars[0].close;

  // 取最近一次分红
  let maxDate = "";
  let bestDiv = 0;
  for (const [date, data] of divs) {
    if (date > maxDate) {
      maxDate = date;
      bestDiv = data.cash_div;
    }
  }
  if (bestDiv <= 0) return null;
  const dpr = (bestDiv / price) * 100;
  if (filter.min !== undefined && dpr < filter.min) return null;
  if (filter.max !== undefined && dpr > filter.max) return null;
  return dpr;
}

async function checkChip(
  code: string,
  filter: { weeks: number; thresholdPct: number }
): Promise<number | null> {
  let cyqList = getCyqPerf(code);
  if (!cyqList || cyqList.length === 0) {
    const rows = await tushareCall("cyq_perf", { ts_code: tsCode(code) }, "trade_date,cost_5pct,cost_95pct");
    if (rows.length === 0) return null;
    const data = {
      code,
      trade_date: String(rows[0].trade_date || ""),
      cost_5pct: Number(rows[0].cost_5pct || 0),
      cost_95pct: Number(rows[0].cost_95pct || 0),
    };
    putCyqPerf(code, data);
    cyqList = [data];
  }

  const latest = cyqList[0];
  const avgCost = (latest.cost_95pct + latest.cost_5pct) / 2;
  if (avgCost <= 0) return null;
  const concentration = ((latest.cost_95pct - latest.cost_5pct) / avgCost) * 100;
  if (concentration > filter.thresholdPct) return null;
  return concentration;
}

async function checkKlineLow(
  code: string,
  filter: { years: number; thresholdPct: number }
): Promise<{ close: number; maxHigh: number; minLow: number; pct: number } | null> {
  const bars = getMonthlyBars(code);
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - filter.years);
  const cutoffStr = cutoff.toISOString().split("T")[0].replace(/-/g, "");

  if (!bars || bars.length === 0) {
    const rows = await tushareCall(
      "monthly",
      { ts_code: tsCode(code), start_date: cutoffStr, end_date: now.toISOString().split("T")[0].replace(/-/g, "") },
      "trade_date,high,low,close"
    );
    if (rows.length === 0) return null;
    const mBars = rows.map((r) => ({
      trade_date: String(r.trade_date || ""),
      high: Number(r.high || 0),
      low: Number(r.low || 0),
      close: Number(r.close || 0),
    }));
    const filtered = mBars.filter((b) => b.trade_date >= cutoffStr);
    if (filtered.length === 0) return null;
    const maxHigh = Math.max(...filtered.map((b) => b.high));
    const minLow = Math.min(...filtered.map((b) => b.low));
    const lastClose = filtered[filtered.length - 1].close;
    const range = maxHigh - minLow;
    if (range <= 0) return null;
    const pct = ((lastClose - minLow) / range) * 100;
    if (pct > filter.thresholdPct) return null;
    return { close: lastClose, maxHigh, minLow, pct };
  }

  const filtered = bars.filter((b) => b.trade_date >= cutoffStr);
  if (filtered.length === 0) return null;
  const maxHigh = Math.max(...filtered.map((b) => b.high));
  const minLow = Math.min(...filtered.map((b) => b.low));
  const sorted = filtered.sort((a, b) => b.trade_date.localeCompare(a.trade_date));
  const lastClose = sorted[0].close;
  const range = maxHigh - minLow;
  if (range <= 0) return null;
  const pct = ((lastClose - minLow) / range) * 100;
  if (pct > filter.thresholdPct) return null;
  return { close: lastClose, maxHigh, minLow, pct };
}

async function checkCRLow(
  code: string,
  filter: { years: number; thresholdPct: number }
): Promise<{ cr: number; crMin: number; crMax: number; pct: number } | null> {
  const bars = getDailyBars(code);
  if (!bars || bars.length < 30) return null;
  const sorted = [...bars].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const highs = sorted.map((b) => b.high);
  const lows = sorted.map((b) => b.low);
  const closes = sorted.map((b) => b.close);
  const crVals = calcCR(highs, lows, closes);
  const cutoffIdx = Math.max(0, crVals.length - filter.years * 250);
  const recent = crVals.slice(cutoffIdx);
  const curCR = crVals[crVals.length - 1];
  const crMin = Math.min(...recent);
  const crMax = Math.max(...recent);
  const range = crMax - crMin;
  if (range <= 0) return null;
  const pct = ((curCR - crMin) / range) * 100;
  if (pct > filter.thresholdPct) return null;
  return { cr: curCR, crMin, crMax, pct };
}

// === 工具函数 ===

function tsCode(code: string): string {
  const suffix = code.startsWith("6")
    ? "SH"
    : code.startsWith("8") || code.startsWith("9") || code.startsWith("4")
      ? "BJ"
      : "SZ";
  return `${code}.${suffix}`;
}

// === 组合筛选生成器 ===

export async function* tushareCombinedScreening(
  filters: CombinedScreeningFilters,
  limitCodes?: string[]
): AsyncGenerator<SSEEvent> {
  const names = getStockNames();
  let codes = [...names.keys()];
  if (limitCodes?.length) {
    codes = codes.filter((c) => limitCodes.includes(c));
  }
  if (!codes.length) {
    yield { type: "done" };
    return;
  }

  const total = codes.length;
  let done = 0;
  let flushed = 0;

  for (const code of codes) {
    const result: StockScreeningResult = { 代码: code, 名称: names.get(code) || "" };

    try {
      // === 行情指标 ===

      // 最新价
      const dailyBars = getDailyBars(code);
      if (dailyBars && dailyBars.length > 0) {
        result.最新价 = dailyBars[0].close;
      }

      // 涨幅预过滤（前置）
      if (filters.gainers) {
        const change = await checkChangeRate(code, { min: filters.gainers.thresholdPct });
        if (change === null) { done++; continue; }
        result.涨跌幅 = change;
      }

      // 价格
      if (filters.price) {
        const p = await checkPrice(code, filters.price);
        if (p === null) { done++; continue; }
        result.最新价 = p;
      }

      // 涨跌幅
      if (filters.changeRate) {
        const r = await checkChangeRate(code, filters.changeRate);
        if (r === null) { done++; continue; }
        result.涨跌幅 = r;
      }

      // 换手率
      if (filters.turnover) {
        const r = checkTurnover(code, filters.turnover);
        if (r === null) { done++; continue; }
        result.换手率 = r;
      }

      // 量比
      if (filters.volumeRatio) {
        const r = checkVolumeRatio(code, filters.volumeRatio);
        if (r === null) { done++; continue; }
        result.量比 = r;
      }

      // 总市值
      if (filters.totalMv) {
        const r = checkTotalMv(code, filters.totalMv);
        if (r === null) { done++; continue; }
        result.总市值 = r;
      }

      // 流通市值
      if (filters.circMv) {
        const r = checkCircMv(code, filters.circMv);
        if (r === null) { done++; continue; }
        result.流通市值 = r;
      }

      // 振幅
      if (filters.amplitude) {
        const r = checkAmplitude(code, filters.amplitude);
        if (r === null) { done++; continue; }
        result.振幅 = r;
      }

      // === 基本面指标 ===

      if (filters.pe) {
        const r = checkPE(code, filters.pe);
        if (r === null) { done++; continue; }
        result.PE = r;
      }

      if (filters.pb) {
        const r = checkPB(code, filters.pb);
        if (r === null) { done++; continue; }
        result.PB = r;
      }

      if (filters.roe) {
        const r = checkROE(code, filters.roe);
        if (r === null) { done++; continue; }
        result.ROE = r;
      }

      if (filters.eps) {
        const r = checkEPS(code, filters.eps);
        if (r === null) { done++; continue; }
        result.EPS = r;
      }

      if (filters.grossMargin) {
        const r = checkGrossMargin(code, filters.grossMargin);
        if (r === null) { done++; continue; }
        result.毛利率 = r;
      }

      if (filters.netMargin) {
        const r = checkNetMargin(code, filters.netMargin);
        if (r === null) { done++; continue; }
        result.净利率 = r;
      }

      if (filters.debtRatio) {
        const r = checkDebtRatio(code, filters.debtRatio);
        if (r === null) { done++; continue; }
        result.资产负债率 = r;
      }

      if (filters.revenueGrowth) {
        const r = checkRevenueGrowth(code, filters.revenueGrowth);
        if (r === null) { done++; continue; }
        result.营收增长率 = r;
      }

      if (filters.profitGrowth) {
        const r = checkProfitGrowth(code, filters.profitGrowth);
        if (r === null) { done++; continue; }
        result.净利润增长率 = r;
      }

      // === 技术指标 ===

      if (filters.macd) {
        const r = await checkMACD(code, filters.macd);
        if (r === null) { done++; continue; }
        result.MACD = r.macd;
        result.MACD最低 = r.macdMin;
        result.MACD最高 = r.macdMax;
        result.MACD百分位 = r.pct;
      }

      if (filters.kdj) {
        const r = checkKDJ(code, filters.kdj);
        if (r === null) { done++; continue; }
        result.K = r.k;
        result.D = r.d;
        result.J = r.j;
      }

      if (filters.rsi) {
        const r = checkRSI(code, filters.rsi);
        if (r === null) { done++; continue; }
        result.RSI = r;
      }

      if (filters.boll) {
        const r = checkBOLL(code, filters.boll);
        if (r === null) { done++; continue; }
        result.BOLL上轨 = r.upper;
        result.BOLL中轨 = r.mid;
        result.BOLL下轨 = r.lower;
      }

      if (filters.wr) {
        const r = checkWR(code, filters.wr);
        if (r === null) { done++; continue; }
        result.WR = r;
      }

      if (filters.bias) {
        const r = checkBIAS(code, filters.bias);
        if (r === null) { done++; continue; }
        result.BIAS6 = r;
      }

      // === 分红 ===

      if (filters.dividend) {
        const r = await checkDividend(code, filters.dividend);
        if (r === null) { done++; continue; }
        result.每股分红 = r.cashDiv;
        result.送股比例 = r.stkDiv;
        result.公告日期 = r.annDate;
      }

      if (filters.dividendYield) {
        const r = checkDividendYield(code, filters.dividendYield);
        if (r === null) { done++; continue; }
        result.股息率 = r;
      }

      // === 筹码 ===

      if (filters.chip) {
        const r = await checkChip(code, filters.chip);
        if (r === null) { done++; continue; }
        result.筹码集中度 = r;
      }

      // K线低位（保留旧算法作为特殊指标）
      if (filters.macd) {
        // klineLow 可以通过 MACD 筛选条件里的 year/threshold 间接使用
        // 保留给后续扩展
      }

      // 全部通过 → 加入结果
      yield { type: "result", stock: result };
    } catch {
      // 单只股票异常，跳过
    }

    done++;
    flushed++;

    if (done % PROGRESS_EVERY === 0) {
      yield { type: "progress", done, total };
    }

    if (flushed >= FLUSH_EVERY) {
      await flushWrites();
      flushed = 0;
    }

    // 限流
    if (done % 10 === 0) {
      await new Promise((r) => setTimeout(r, SLEEP_MS));
    }
  }

  await flushWrites();
  yield { type: "progress", done: total, total };
  yield { type: "done" };
}
