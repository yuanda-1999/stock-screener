// 拉取 daily_basic 数据（PE/PB/换手率/量比/市值）
// 写入 SQLite daily_basic_cache 表
// 用法: bun run scripts/fetch-daily-basic.ts [--latest]

import { Database } from "bun:sqlite";
import * as path from "node:path";
import * as fs from "node:fs";

const DB_PATH = path.resolve(process.cwd(), "data", "tushare_cache.db");
const TOKEN = process.env.TUSHARE_TOKEN;
if (!TOKEN) { console.error("TUSHARE_TOKEN 未配置"); process.exit(1); }

const ENDPOINT = process.env.TUSHARE_API_URL || "https://api.tushare.pro";
const CONCURRENCY = 3;    // 并发数（安全边距，不触发 500/min 限制）
const REQ_DELAY = 500;    // 每请求延迟 ms (3 × 120/min = 360/min < 500/min)

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function tushareCall(api: string, params: Record<string, string>, fields: string): Promise<Record<string, unknown>[]> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(2000 * attempt + Math.random() * 3000);
    try {
      const resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_name: api, token: TOKEN, params, fields }),
        signal: AbortSignal.timeout(20_000),
      });
      if (resp.status === 429) { lastErr = new Error("429"); continue; }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as { code: number; msg: string; data?: { fields: string[]; items: unknown[][] } };
      if (json.code !== 0) throw new Error(json.msg || "API error");
      if (!json.data?.items?.length) return [];
      const { fields: fs, items } = json.data;
      return items.map((row) => {
        const obj: Record<string, unknown> = {};
        fs.forEach((f, i) => { obj[f] = (row as unknown[])[i]; });
        return obj;
      });
    } catch (e) {
      lastErr = e as Error;
      if ((e as Error).message?.includes("429")) continue;
      throw e;
    }
  }
  throw lastErr || new Error("retry exhausted");
}

function tsCode(code: string): string {
  const suffix = code.startsWith("6") ? "SH"
    : code.startsWith("8") || code.startsWith("9") || code.startsWith("4") ? "BJ"
    : "SZ";
  return `${code}.${suffix}`;
}

async function main() {
  const db = new Database(DB_PATH);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA busy_timeout = 5000");

  // 确保表存在
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_basic_cache (
      code TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      pe REAL DEFAULT 0,
      pe_ttm REAL DEFAULT 0,
      pb REAL DEFAULT 0,
      total_mv REAL DEFAULT 0,
      circ_mv REAL DEFAULT 0,
      turnover_rate REAL DEFAULT 0,
      volume_ratio REAL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (code, trade_date)
    );
  `);

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO daily_basic_cache
    (code, trade_date, pe, pe_ttm, pb, total_mv, circ_mv, turnover_rate, volume_ratio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 获取股票列表
  const stocks = db.query("SELECT code FROM stock_basic_cache").all() as { code: string }[];
  const codes = stocks.map((s) => s.code);
  console.log(`共 ${codes.length} 只股票`);

  const latestOnly = process.argv.includes("--latest");

  // 获取最新交易日期
  const latestDates = db.query(`
    SELECT code, MAX(trade_date) as last_date
    FROM daily_bar_cache GROUP BY code
  `).all() as { code: string; last_date: string }[];
  const dateMap = new Map(latestDates.map((d) => [d.code, d.last_date]));

  // 检查已拉取的数据
  const existing = new Set(
    (db.query("SELECT DISTINCT code FROM daily_basic_cache").all() as { code: string }[])
      .map((r) => r.code)
  );

  let remaining = codes.filter((c) => !existing.has(c));
  if (latestOnly) {
    remaining = codes; // 所有都更新最新一天
  }
  console.log(`需拉取: ${remaining.length} 只 (已有 ${existing.size} 只)`);

  let done = 0;
  let errors = 0;

  // 并发队列
  const queue = [...remaining];
  let rateLimitHits = 0;
  async function worker() {
    while (queue.length > 0) {
      const code = queue.shift()!;
      const ts = tsCode(code);
      const lastDate = dateMap.get(code) || "20250101";
      try {
        const rows = await tushareCall(
          "daily_basic",
          { ts_code: ts, trade_date: lastDate },
          "ts_code,trade_date,pe,pe_ttm,pb,total_mv,circ_mv,turnover_rate,volume_ratio"
        );
        if (rows.length > 0) {
          const r = rows[0];
          const insert = db.transaction(() => {
            insertStmt.run(
              code,
              String(r.trade_date || lastDate),
              Number(r.pe || 0),
              Number(r.pe_ttm || 0),
              Number(r.pb || 0),
              Number(r.total_mv || 0),
              Number(r.circ_mv || 0),
              Number(r.turnover_rate || 0),
              Number(r.volume_ratio || 0),
            );
          });
          insert();
        }
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("频率超限") || msg.includes("429")) {
          rateLimitHits++;
          queue.unshift(code);
          await sleep(5000 * rateLimitHits);
          rateLimitHits = Math.max(0, rateLimitHits - 1);
          continue;
        }
        if (msg.includes("Unable to connect") || msg.includes("fetch failed") || msg.includes("network")) {
          queue.unshift(code);
          await sleep(3000);
          continue;
        }
        errors++;
        if (errors <= 10) console.error(`  ${code} error:`, msg);
      }
      done++;
      if (done % 200 === 0) console.log(`  进度: ${done}/${remaining.length} (${errors} errors)`);
      await sleep(REQ_DELAY);
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  console.log(`\n完成: ${done} 只, 错误: ${errors}`);
  db.close();

  // 导出更新后的数据到 JSON
  console.log("导出 JSON...");
  await exportToJson();
}

async function exportToJson() {
  const db2 = new Database(DB_PATH, { readonly: true });
  const rows = db2.query("SELECT * FROM daily_basic_cache").all();
  const dir = path.resolve(process.cwd(), "data", "json");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "daily_basic_cache.json"), JSON.stringify(rows));
  console.log(`  导出 ${rows.length} 行到 daily_basic_cache.json`);
  db2.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
