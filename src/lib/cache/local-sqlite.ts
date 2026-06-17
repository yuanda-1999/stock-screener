// 本地 JSON 文件持久化 — 从 SQLite 导出后，供 Node.js API 路由读取
// 使用前需要运行 `bun scripts/export-data.ts` 将 SQLite 导出为 JSON
// 纯 Node.js 读取，零依赖，无需原生模块

import fs from "node:fs";
import path from "node:path";

const JSON_DIR = path.resolve(process.cwd(), "data", "json");

function jsonPath(table: string): string {
  return path.join(JSON_DIR, `${table}.json`);
}

export async function getLocalDb(): Promise<boolean> {
  // 检查 JSON 数据目录是否存在
  return fs.existsSync(JSON_DIR);
}

export function loadAll<T>(table: string): T[] {
  try {
    const filePath = jsonPath(table);
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

export function insertMany(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  // 追加到 JSON 文件
  try {
    const existing = loadAll<Record<string, unknown>>(table);
    // 构建主键索引用于去重
    const pkCols = getPrimaryKeys(table);
    const seen = new Set(existing.map((r) => pkCols.map((c) => String(r[c])).join("|")));

    for (const row of rows) {
      const pk = pkCols.map((c) => String(row[c] ?? "")).join("|");
      if (!seen.has(pk)) {
        existing.push(row);
        seen.add(pk);
      }
    }

    const filePath = jsonPath(table);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(existing));
  } catch (e) {
    console.error(`[local-json] insertMany ${table} error:`, e);
  }
}

export function saveDbToDisk() {
  // JSON 写入已在 insertMany 中完成
}

function getPrimaryKeys(table: string): string[] {
  switch (table) {
    case "stock_basic_cache":
      return ["code"];
    case "dividend_cache":
      return ["code", "end_date"];
    case "daily_bar_cache":
    case "monthly_bar_cache":
    case "weekly_bar_cache":
    case "macd_factor_cache":
    case "cyq_perf_cache":
    case "daily_basic_cache":
      return ["code", "trade_date"];
    case "finance_cache":
      return ["code", "end_date"];
    default:
      return [];
  }
}
