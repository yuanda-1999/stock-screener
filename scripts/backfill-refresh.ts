// 手动补齐线上增量表：复用 cron 刷新服务
// 用法:
//   bun run scripts/backfill-refresh.ts
//   bun run scripts/backfill-refresh.ts --finance-limit 1000
//   bun run scripts/backfill-refresh.ts --no-finance
import * as fs from "node:fs";
import * as path from "node:path";
import { runDailyRefresh } from "../src/lib/tushare/refresh";

function loadEnv(file: string) {
  const fullPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(fullPath)) return;
  for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key]) continue;
    process.env[key] = raw.trim().replace(/^['"]|['"]$/g, "");
  }
}

function readNumberFlag(name: string): number | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0 || !process.argv[idx + 1]) return undefined;
  const value = Number(process.argv[idx + 1]);
  return Number.isFinite(value) ? value : undefined;
}

loadEnv(".env.local");

const result = await runDailyRefresh({}, {
  includeFinance: !process.argv.includes("--no-finance"),
  financeLimit: readNumberFlag("--finance-limit"),
});

console.log(JSON.stringify(result, null, 2));
if (!result.success) process.exit(1);
