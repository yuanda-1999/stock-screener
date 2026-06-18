// 通过 Supabase Management API 创建索引
import * as fs from "node:fs";
import * as path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const REF = "cmaakeewurufvziqwagb";

if (!TOKEN) {
  console.error("Missing SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_daily_bar_trade_date ON daily_bar_cache (trade_date)",
  "CREATE INDEX IF NOT EXISTS idx_monthly_bar_trade_date ON monthly_bar_cache (trade_date)",
  "CREATE INDEX IF NOT EXISTS idx_weekly_bar_trade_date ON weekly_bar_cache (trade_date)",
  "CREATE INDEX IF NOT EXISTS idx_macd_factor_trade_date ON macd_factor_cache (trade_date)",
  "CREATE INDEX IF NOT EXISTS idx_cyq_perf_trade_date ON cyq_perf_cache (trade_date)",
  "CREATE INDEX IF NOT EXISTS idx_daily_basic_trade_date ON daily_basic_cache (trade_date)",
  "CREATE INDEX IF NOT EXISTS idx_finance_end_date ON finance_cache (end_date)",
  "CREATE INDEX IF NOT EXISTS idx_dividend_end_date ON dividend_cache (end_date)",
];

async function main() {
  for (const sql of INDEXES) {
    const table = sql.match(/ON (\w+)/)?.[1] || "unknown";
    try {
      const resp = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        console.error(`  ✗ ${table}: ${resp.status} ${err}`);
      } else {
        console.log(`  ✓ ${table}`);
      }
    } catch (e: unknown) {
      console.error(`  ✗ ${table}: ${(e as Error).message}`);
    }
  }
  console.log("\nDone.");
}

main();
