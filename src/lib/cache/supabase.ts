// Supabase 持久化 — 线上环境使用
// 表结构与 SQLite 完全相同

import { createClient } from "@supabase/supabase-js";

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

interface LoadOptions {
  limit?: number;
  maxRows?: number;
  orderBy?: string;
  ascending?: boolean;
}

export async function loadAllFromSupabase(table: string, columns = "*", options?: LoadOptions) {
  const sb = getSupabase();
  const all: Record<string, unknown>[] = [];
  const PAGE = 1000;
  const maxPages = options?.limit ? Math.ceil(options.limit / PAGE) : 2000;

  for (let page = 0; page < maxPages; page++) {
    let query = sb.from(table).select(columns);
    if (options?.orderBy) {
      query = query.order(options.orderBy, { ascending: options.ascending ?? false });
    }
    query = query.range(page * PAGE, page * PAGE + PAGE - 1);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < PAGE) break;
  }
  return all;
}

// 按代码列表加载（用于候选股按需加载）
export async function loadForCodes(
  table: string,
  codes: string[],
  columns = "*",
  options?: LoadOptions
) {
  if (codes.length === 0) return [];
  const sb = getSupabase();
  const all: Record<string, unknown>[] = [];
  const CHUNK = 200; // IN 子句分批，避免 URL 过长
  const PAGE = 1000;

  for (let c = 0; c < codes.length; c += CHUNK) {
    const chunk = codes.slice(c, c + CHUNK);
    for (let page = 0; page < 500; page++) {
      let query = sb.from(table).select(columns).in("code", chunk);
      if (options?.orderBy) {
        query = query.order(options.orderBy, { ascending: options.ascending ?? false });
      }
      query = query.range(page * PAGE, page * PAGE + PAGE - 1);
      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...(data as unknown as Record<string, unknown>[]));
      if (options?.maxRows && all.length >= options.maxRows) break;
      if (data.length < PAGE) break;
    }
  }
  return all;
}

export async function upsertToSupabase(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const sb = getSupabase();
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await sb.from(table).upsert(batch as never);
    if (error) console.error(`Supabase upsert ${table} error:`, error);
  }
}
