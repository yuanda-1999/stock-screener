// 将本地 SQLite 数据上传到 Supabase（并发优化版）
// 用法: bun run scripts/upload-to-supabase.ts
// 环境变量: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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

const BATCH = 2000;
const MAX_CONCURRENT = 4;

async function uploadTable(table: string) {
  const start = Date.now();
  const rows = db.query(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
  if (rows.length === 0) { console.log(`  ${table}: 0 rows, skip`); return; }

  const clean = rows.map(({ updated_at, ...rest }) => rest);

  // 构建批次
  const batches: Record<string, unknown>[][] = [];
  for (let i = 0; i < clean.length; i += BATCH) {
    batches.push(clean.slice(i, i + BATCH));
  }

  let done = 0;

  async function processBatch(batch: Record<string, unknown>[]) {
    for (let retry = 0; retry < 3; retry++) {
      const { error } = await sb.from(table).upsert(batch as never);
      if (!error) break;
      if (retry < 2) {
        console.warn(`  ${table}: retry ${retry + 1}, ${error.message}`);
        await new Promise(r => setTimeout(r, 2000 * (retry + 1)));
        continue;
      }
      throw new Error(`${table}: ${error.message}`);
    }
    done += batch.length;
    if (done % 100000 === 0 || done === clean.length) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      console.log(`  ${table}: ${done}/${clean.length} (${elapsed}s)`);
    }
  }

  // 并发池
  const pool: Promise<void>[] = [];
  for (const batch of batches) {
    if (pool.length >= MAX_CONCURRENT) await Promise.race(pool);
    const p = processBatch(batch).finally(() => {
      pool.splice(pool.indexOf(p), 1);
    });
    pool.push(p);
  }
  await Promise.all(pool);
  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`  ${table}: ${clean.length} rows ✓ (${elapsed}s)`);
}

async function main() {
  console.log("上传数据到 Supabase...\n");
  for (const table of TABLES) {
    await uploadTable(table);
  }
  console.log("\n完成！");
}

main().catch((e) => { console.error(e); process.exit(1); });
