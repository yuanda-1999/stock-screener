// 预计算技术指标脚本：从 daily_bar_cache 计算 KDJ/RSI/BOLL/WR/BIAS
// 写入 Supabase 缓存表，使所有技术指标可 DB 层筛选
// 用法: bun run scripts/recompute-indicators.ts
//        bun run scripts/recompute-indicators.ts --latest (仅计算最新交易日)
import { createClient } from "@supabase/supabase-js";
import { calcKDJ, calcRSI, calcBOLL, calcWR, calcBIAS } from "../src/lib/tushare/indicators";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未配置"); process.exit(1); }

const sb = createClient(URL, KEY);

async function upsertBatch(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const BATCH = 4000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await sb.from(table).upsert(batch as never);
    if (error) console.error(`  ${table} upsert error:`, error.message);
  }
}

async function main() {
  const latestOnly = process.argv.includes("--latest");
  console.log(latestOnly ? "仅计算最新交易日" : "计算全部历史数据");
  console.log("");

  // 获取所有股票代码
  const { data: stocks } = await sb.from("stock_basic_cache").select("code");
  if (!stocks) { console.error("无法获取股票列表"); return; }
  const codes = (stocks as { code: string }[]).map((s) => s.code);
  console.log(`共 ${codes.length} 只股票`);

  // 分页加载 daily_bar_cache
  console.log("加载日线数据...");
  const barRows: Record<string, unknown>[] = [];
  const PAGE = 5000;
  for (let p = 0; p < 500; p++) {
    const { data, error } = await sb.from("daily_bar_cache")
      .select("code,trade_date,open,high,low,close")
      .order("trade_date", { ascending: true })
      .range(p * PAGE, p * PAGE + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    barRows.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    if (p % 50 === 0) console.log(`  已加载 ${barRows.length} 行...`);
  }
  console.log(`日线数据: ${barRows.length} 行`);

  // 按 code 分组
  const barsByCode = new Map<string, { trade_date: string; open: number; high: number; low: number; close: number }[]>();
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
  for (const [, bars] of barsByCode) {
    bars.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  }
  console.log(`分组: ${barsByCode.size} 只股票\n`);

  // 批量计算
  const kdjRows: Record<string, unknown>[] = [];
  const rsiRows: Record<string, unknown>[] = [];
  const bollRows: Record<string, unknown>[] = [];
  const wrRows: Record<string, unknown>[] = [];
  const biasRows: Record<string, unknown>[] = [];

  let done = 0;
  for (const code of codes) {
    const bars = barsByCode.get(code);
    if (!bars || bars.length < 30) { done++; continue; }

    const closes = bars.map((b) => b.close);
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);
    const dates = bars.map((b) => b.trade_date);

    const idxRange = latestOnly
      ? { start: dates.length - 1, end: dates.length }
      : { start: 0, end: dates.length };

    try {
      const { k, d, j } = calcKDJ(highs, lows, closes);
      const rsi = calcRSI(closes);
      const boll = calcBOLL(closes);
      const wr = calcWR(highs, lows, closes);
      const bias = calcBIAS(closes);

      for (let i = idxRange.start; i < idxRange.end; i++) {
        const td = dates[i];
        kdjRows.push({ code, trade_date: td, k: +k[i].toFixed(4), d: +d[i].toFixed(4), j: +j[i].toFixed(4) });
        rsiRows.push({ code, trade_date: td, rsi14: +rsi[i].toFixed(4) });
        bollRows.push({ code, trade_date: td, upper: +boll.upper[i].toFixed(4), mid: +boll.mid[i].toFixed(4), lower: +boll.lower[i].toFixed(4) });
        wrRows.push({ code, trade_date: td, wr10: +wr[i].toFixed(4) });
        biasRows.push({ code, trade_date: td, bias6: +bias[i].toFixed(4) });
      }
    } catch {
      // 跳过计算异常的股票
    }

    done++;
    if (done % 500 === 0) {
      console.log(`  计算: ${done}/${codes.length} (KDJ ${kdjRows.length}, RSI ${rsiRows.length}...)`);
    }
  }

  console.log(`\n计算完成，开始写入 Supabase...`);
  console.log("  KDJ..."); await upsertBatch("kdj_cache", kdjRows);
  console.log("  RSI..."); await upsertBatch("rsi_cache", rsiRows);
  console.log("  BOLL..."); await upsertBatch("boll_cache", bollRows);
  console.log("  WR..."); await upsertBatch("wr_cache", wrRows);
  console.log("  BIAS..."); await upsertBatch("bias_cache", biasRows);

  console.log(`\n完成！写入行数: KDJ=${kdjRows.length}, RSI=${rsiRows.length}, BOLL=${bollRows.length}, WR=${wrRows.length}, BIAS=${biasRows.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
