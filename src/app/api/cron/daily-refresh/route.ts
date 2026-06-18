// 每日增量更新 — Vercel Cron 触发
// 从 Tushare 批量拉取最新交易日数据，写入 Supabase
// 鉴权: Authorization: Bearer <CRON_SECRET>
import { NextRequest, NextResponse } from "next/server";
import { getLatestTradeDate, fetchDailyBars, fetchDailyBasic } from "@/lib/tushare/bulk-fetch";
import { upsertToSupabase } from "@/lib/cache/supabase";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // 鉴权
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: string[] = [];
  let tradeDate = "";

  try {
    // 1. 获取最新交易日
    tradeDate = await getLatestTradeDate();
    results.push(`最新交易日: ${tradeDate}`);

    // 2. 拉取日线数据
    const bars = await fetchDailyBars(tradeDate);
    results.push(`日线数据: ${bars.length} 条`);

    // 3. 拉取每日基本面
    const basics = await fetchDailyBasic(tradeDate);
    results.push(`基本面数据: ${basics.length} 条`);

    // 4. 写入 Supabase
    if (bars.length > 0) {
      await upsertToSupabase("daily_bar_cache", bars as unknown as Record<string, unknown>[]);
      results.push("日线数据已写入 Supabase");
    }
    if (basics.length > 0) {
      await upsertToSupabase("daily_basic_cache", basics as unknown as Record<string, unknown>[]);
      results.push("基本面数据已写入 Supabase");
    }

    if (bars.length === 0 && basics.length === 0) {
      results.push("无新数据（可能为非交易日或 Tushare 数据延迟）");
    }

    return NextResponse.json({ success: true, tradeDate, results });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    results.push(`错误: ${msg}`);
    return NextResponse.json({ success: false, tradeDate, error: msg, results }, { status: 500 });
  }
}
