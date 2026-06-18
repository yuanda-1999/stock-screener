// 调用 Supabase PostgreSQL 筛选函数，对简单指标做 DB 层过滤
import { createClient } from "@supabase/supabase-js";
import type { CombinedScreeningFilters } from "../types";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

export interface DBScreeningRow {
  code: string;
  name: string;
  close: number | null;
  change_pct: number | null;
  turnover: number | null;
  vol_ratio: number | null;
  total_mv: number | null;
  circ_mv: number | null;
  amplitude: number | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  eps: number | null;
  gross_margin: number | null;
  net_margin: number | null;
  debt_ratio: number | null;
  revenue_growth: number | null;
  profit_growth: number | null;
}

function filtersToJsonb(filters: CombinedScreeningFilters): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  if (filters.price) obj.price = filters.price;
  if (filters.changeRate) obj.changeRate = filters.changeRate;
  if (filters.turnover) obj.turnover = filters.turnover;
  if (filters.volumeRatio) obj.volumeRatio = filters.volumeRatio;
  if (filters.totalMv) obj.totalMv = filters.totalMv;
  if (filters.circMv) obj.circMv = filters.circMv;
  if (filters.amplitude) obj.amplitude = filters.amplitude;
  if (filters.pe) obj.pe = filters.pe;
  if (filters.pb) obj.pb = filters.pb;
  if (filters.roe) obj.roe = filters.roe;
  if (filters.eps) obj.eps = filters.eps;
  if (filters.grossMargin) obj.grossMargin = filters.grossMargin;
  if (filters.netMargin) obj.netMargin = filters.netMargin;
  if (filters.debtRatio) obj.debtRatio = filters.debtRatio;
  if (filters.revenueGrowth) obj.revenueGrowth = filters.revenueGrowth;
  if (filters.profitGrowth) obj.profitGrowth = filters.profitGrowth;
  if (filters.gainers) obj.gainers = filters.gainers;
  if (filters.dividend) obj.dividend = filters.dividend;
  if (filters.dividendYield) obj.dividendYield = filters.dividendYield;
  if (filters.chip) obj.chip = filters.chip;
  if (filters.macd) obj.macd = filters.macd;
  if (filters.kdj) obj.kdj = filters.kdj;
  if (filters.rsi) obj.rsi = filters.rsi;
  if (filters.boll) obj.boll = filters.boll;
  if (filters.wr) obj.wr = filters.wr;
  if (filters.bias) obj.bias = filters.bias;
  return obj;
}

// 判断是否有任何 DB 层能处理的筛选条件
export function hasBasicFilters(filters: CombinedScreeningFilters): boolean {
  return !!(filters.price || filters.changeRate || filters.turnover ||
    filters.volumeRatio || filters.totalMv || filters.circMv ||
    filters.amplitude || filters.pe || filters.pb || filters.roe ||
    filters.eps || filters.grossMargin || filters.netMargin ||
    filters.debtRatio || filters.revenueGrowth || filters.profitGrowth ||
    filters.gainers || filters.dividend || filters.dividendYield ||
    filters.chip || filters.macd || filters.kdj || filters.rsi ||
    filters.boll || filters.wr || filters.bias);
}

// 判断是否只有技术指标筛选（无法在 DB 层过滤）
export function onlyTechnicalFilters(filters: CombinedScreeningFilters): boolean {
  return !hasBasicFilters(filters) && !!(
    filters.macd || filters.kdj || filters.rsi || filters.boll ||
    filters.wr || filters.bias || filters.chip ||
    filters.dividend || filters.dividendYield
  );
}

export async function screenStocksBasic(
  filters: CombinedScreeningFilters
): Promise<{ codes: string[]; rows: DBScreeningRow[] }> {
  const sb = getSupabase();
  const jsonb = filtersToJsonb(filters);

  const { data, error } = await sb.rpc("screen_stocks_basic", { filters: jsonb });

  if (error) throw new Error(`DB screening failed: ${error.message}`);

  const rows = (data || []) as DBScreeningRow[];
  return { codes: rows.map((r) => r.code), rows };
}
