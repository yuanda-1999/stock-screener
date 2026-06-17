// 拉取财务指标数据（ROE/EPS/毛利率/净利率/负债率/增长率）
// 写入 SQLite finance_cache 表
// 用法: bun run scripts/fetch-finance.ts [--year 2025]

import { Database } from "bun:sqlite";
import * as path from "node:path";
import * as fs from "node:fs";

const DB_PATH = path.resolve(process.cwd(), "data", "tushare_cache.db");
const TOKEN = process.env.TUSHARE_TOKEN;
if (!TOKEN) { console.error("TUSHARE_TOKEN 未配置"); process.exit(1); }

const ENDPOINT = process.env.TUSHARE_API_URL || "https://api.tushare.pro";
const CONCURRENCY = 3;
const REQ_DELAY = 500;

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

function parseYearArg(): string[] {
  const years: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === "--year" && process.argv[i + 1]) {
      years.push(process.argv[i + 1]);
    }
  }
  if (years.length === 0) {
    // 默认拉取最近 3 年
    const now = new Date().getFullYear();
    for (let y = now - 1; y >= now - 3; y--) years.push(String(y));
  }
  return years;
}

async function main() {
  const db = new Database(DB_PATH);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA busy_timeout = 5000");

  db.run(`
    CREATE TABLE IF NOT EXISTS finance_cache (
      code TEXT NOT NULL,
      end_date TEXT NOT NULL,
      roe REAL DEFAULT 0,
      eps REAL DEFAULT 0,
      bps REAL DEFAULT 0,
      grossprofit_margin REAL DEFAULT 0,
      netprofit_margin REAL DEFAULT 0,
      debt_to_assets REAL DEFAULT 0,
      revenue_growth REAL DEFAULT 0,
      profit_growth REAL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (code, end_date)
    );
  `);

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO finance_cache
    (code, end_date, roe, eps, bps, grossprofit_margin, netprofit_margin,
     debt_to_assets, revenue_growth, profit_growth)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const years = parseYearArg();
  console.log(`目标年份: ${years.join(", ")}`);

  const stocks = db.query("SELECT code FROM stock_basic_cache").all() as { code: string }[];
  console.log(`共 ${stocks.length} 只股票`);

  let done = 0;
  let errors = 0;
  let totalRows = 0;

  for (const year of years) {
    // 检查该年已拉取的数量
    const existing = new Set(
      (db.query(`SELECT DISTINCT code FROM finance_cache WHERE end_date LIKE ?`).all(year + "%") as { code: string }[])
        .map((r) => r.code)
    );
    const remaining = stocks.filter((s) => !existing.has(s.code));
    console.log(`\n${year}: 需拉取 ${remaining.length} 只 (已有 ${existing.size} 只)`);

    const queue = [...remaining];
    let rateLimitHits = 0;
    async function worker() {
      while (queue.length > 0) {
        const stock = queue.shift()!;
        const ts = tsCode(stock.code);
        try {
          const rows = await tushareCall(
            "fina_indicator",
            { ts_code: ts, end_date: year + "1231" },
            "ts_code,end_date,roe,eps,bps,grossprofit_margin,netprofit_margin,debt_to_assets,or_yoy,profit_dedt"
          );
          if (rows.length > 0) {
            const r = rows[0];
            const insert = db.transaction(() => {
              insertStmt.run(
                stock.code,
                String(r.end_date || year + "1231"),
                Number(r.roe || 0),
                Number(r.eps || 0),
                Number(r.bps || 0),
                Number(r.grossprofit_margin || 0),
                Number(r.netprofit_margin || 0),
                Number(r.debt_to_assets || 0),
                Number(r.or_yoy || 0),
                Number(r.profit_dedt || 0),
              );
            });
            insert();
            totalRows++;
          }
        } catch (e) {
          const msg = (e as Error).message;
          if (msg.includes("频率超限") || msg.includes("429")) {
            rateLimitHits++;
            queue.unshift(stock);
            await sleep(5000 * rateLimitHits);
            rateLimitHits = Math.max(0, rateLimitHits - 1);
            continue;
          }
          if (msg.includes("Unable to connect") || msg.includes("fetch failed") || msg.includes("network")) {
            queue.unshift(stock);
            await sleep(3000);
            continue;
          }
          errors++;
          if (errors <= 10) console.error(`  ${stock.code} error:`, msg);
        }
        done++;
        if (done % 100 === 0) console.log(`  进度: ${done} (${errors} errors, ${totalRows} rows)`);
        await sleep(REQ_DELAY);
      }
    }

    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);
  }

  console.log(`\n完成: ${done} 只, ${totalRows} 行, 错误: ${errors}`);
  db.close();

  // 导出 JSON
  console.log("导出 JSON...");
  await exportToJson();
}

async function exportToJson() {
  const db2 = new Database(DB_PATH, { readonly: true });
  const rows = db2.query("SELECT * FROM finance_cache").all();
  const dir = path.resolve(process.cwd(), "data", "json");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "finance_cache.json"), JSON.stringify(rows));
  console.log(`  导出 ${rows.length} 行到 finance_cache.json`);
  db2.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
