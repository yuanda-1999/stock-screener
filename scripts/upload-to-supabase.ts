// 将本地 SQLite 数据上传到 Supabase
// 用法:
//   先配置 .env.local 中的 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY
//   再运行: bun run scripts/upload-to-supabase.ts

import { Database } from "bun:sqlite";
import { createClient } from "@supabase/supabase-js";
import * as path from "node:path";

const DB_PATH = path.resolve(process.cwd(), "data", "tushare_cache.db");
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error("请先配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(URL, KEY);
const db = new Database(DB_PATH, { readonly: true });

const TABLES = [
  "stock_basic_cache",
  "dividend_cache",
  "monthly_bar_cache",
  "weekly_bar_cache",
  "daily_bar_cache",
  "macd_factor_cache",
  "cyq_perf_cache",
  "daily_basic_cache",
  "finance_cache",
];

async function uploadTable(table: string) {
  const rows = db.query(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
  if (rows.length === 0) { console.log(`  ${table}: 0 rows, skip`); return; }

  // 去 updated_at 字段（Supabase 自动管理）
  const clean = rows.map(({ updated_at, ...rest }) => rest);

  const BATCH = 500;
  for (let i = 0; i < clean.length; i += BATCH) {
    const batch = clean.slice(i, i + BATCH);
    const { error } = await sb.from(table).upsert(batch as never);
    if (error) { console.error(`  ${table} error:`, error); return; }
    if (i % 5000 === 0) console.log(`  ${table}: ${Math.min(i + BATCH, clean.length)}/${clean.length}`);
  }
  console.log(`  ${table}: ${clean.length} rows ✓`);
}

async function main() {
  console.log("上传数据到 Supabase...\n");
  for (const table of TABLES) {
    await uploadTable(table);
  }
  console.log("\n完成！");
}

main().catch((e) => { console.error(e); process.exit(1); });
