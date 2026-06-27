// 每日增量更新 — Vercel Cron 触发
// 从 Tushare 批量拉取最新交易日数据，写入 Supabase
// 鉴权: Authorization: Bearer <CRON_SECRET>
import { NextRequest, NextResponse } from "next/server";
import { runDailyRefresh } from "@/lib/tushare/refresh";

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

  const result = await runDailyRefresh();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
