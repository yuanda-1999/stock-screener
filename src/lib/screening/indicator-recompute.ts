// 技术指标预计算：从 daily_bar_cache 计算 KDJ/RSI/BOLL/WR/BIAS 并写入缓存表
import { createClient } from "@supabase/supabase-js";
import { calcKDJ, calcRSI, calcBOLL, calcWR, calcBIAS } from "../tushare/indicators";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

async function upsertBatch(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const sb = getSupabase();
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error } = await sb.from(table).upsert(batch as never);
      if (!error) {
        lastError = undefined;
        break;
      }
      lastError = error.message;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
    if (lastError) throw new Error(`${table} upsert error: ${lastError}`);
  }
}

interface Bar {
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

function dateWindowStart(tradeDate: string, days: number): string {
  const year = Number(tradeDate.slice(0, 4));
  const month = Number(tradeDate.slice(4, 6));
  const day = Number(tradeDate.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

// 为指定交易日期重新计算所有技术指标（增量更新用）
export async function recomputeForDate(tradeDate: string) {
  const sb = getSupabase();

  // 增量指标只需要近期滑动窗口，不需要全历史。
  const startDate = dateWindowStart(tradeDate, 60);
  const barRows: Record<string, unknown>[] = [];
  const PAGE = 1000;
  for (let p = 0; p < 2000; p++) {
    const { data, error } = await sb.from("daily_bar_cache")
      .select("code,trade_date,open,high,low,close")
      .gte("trade_date", startDate)
      .order("trade_date", { ascending: true })
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    barRows.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
  }

  // 按 code 分组
  const barsByCode = new Map<string, Bar[]>();
  for (const r of barRows) {
    const code = r.code as string;
    const arr = barsByCode.get(code) || [];
    arr.push({
      trade_date: String(r.trade_date || ""),
      open: Number(r.open || 0),
      high: Number(r.high || 0),
      low: Number(r.low || 0),
      close: Number(r.close || 0),
    });
    barsByCode.set(code, arr);
  }

  // 确定目标日期的索引（最后一天）
  const targetDate = tradeDate;

  const kdjRows: Record<string, unknown>[] = [];
  const rsiRows: Record<string, unknown>[] = [];
  const bollRows: Record<string, unknown>[] = [];
  const wrRows: Record<string, unknown>[] = [];
  const biasRows: Record<string, unknown>[] = [];

  for (const [code, bars] of barsByCode) {
    if (bars.length < 30) continue;

    const closes = bars.map((b) => b.close);
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);
    const dates = bars.map((b) => b.trade_date);

    // 只计算目标日期
    const idx = dates.indexOf(targetDate);
    if (idx < 0) continue;

    try {
      const { k, d, j } = calcKDJ(highs, lows, closes);
      const rsi = calcRSI(closes);
      const boll = calcBOLL(closes);
      const wr = calcWR(highs, lows, closes);
      const bias = calcBIAS(closes);

      kdjRows.push({ code, trade_date: targetDate, k: +k[idx].toFixed(4), d: +d[idx].toFixed(4), j: +j[idx].toFixed(4) });
      rsiRows.push({ code, trade_date: targetDate, rsi14: +rsi[idx].toFixed(4) });
      bollRows.push({ code, trade_date: targetDate, upper: +boll.upper[idx].toFixed(4), mid: +boll.mid[idx].toFixed(4), lower: +boll.lower[idx].toFixed(4) });
      wrRows.push({ code, trade_date: targetDate, wr10: +wr[idx].toFixed(4) });
      biasRows.push({ code, trade_date: targetDate, bias6: +bias[idx].toFixed(4) });
    } catch {
      // 跳过计算异常的股票
    }
  }

  // 写入 Supabase
  await upsertBatch("kdj_cache", kdjRows);
  await upsertBatch("rsi_cache", rsiRows);
  await upsertBatch("boll_cache", bollRows);
  await upsertBatch("wr_cache", wrRows);
  await upsertBatch("bias_cache", biasRows);

  return { kdj: kdjRows.length, rsi: rsiRows.length, boll: bollRows.length, wr: wrRows.length, bias: biasRows.length };
}
