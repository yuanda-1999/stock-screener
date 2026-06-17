// 将 SQLite 数据导出为 JSON 文件，供 Next.js（Node.js）API 路由读取
// 使用 bun 运行：bun scripts/export-data.ts
// bun 内置 SQLite 支持，无需额外依赖

import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";

const DB_PATH = path.resolve(process.cwd(), "data", "tushare_cache.db");
const OUT_DIR = path.resolve(process.cwd(), "data", "json");

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

function exportTable(db: Database, table: string): number {
  const outPath = path.join(OUT_DIR, `${table}.json`);
  try {
    const rows = db.query(`SELECT * FROM ${table}`).all();
    fs.writeFileSync(outPath, JSON.stringify(rows));
    return rows.length;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("no such table")) {
      console.log(`  ${table}: SKIPPED (table does not exist)`);
      fs.writeFileSync(outPath, "[]");
      return 0;
    }
    throw e;
  }
}

function main() {
  console.log(`Opening: ${DB_PATH}`);
  if (!fs.existsSync(DB_PATH)) {
    console.error("Database not found!");
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let total = 0;
  for (const table of TABLES) {
    const count = exportTable(db, table);
    total += count;
    console.log(`  ${table}: ${count.toLocaleString()} rows`);
  }

  console.log(`\nDone: ${total.toLocaleString()} total rows exported to ${OUT_DIR}`);
  db.close();
}

main();
