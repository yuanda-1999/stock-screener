// Supabase 持久化 — 线上环境使用
// 表结构与 SQLite 完全相同

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

export async function loadAllFromSupabase(table: string, columns = "*") {
  const sb = getSupabase();
  const all: Record<string, unknown>[] = [];
  const PAGE = 1000;
  let from = 0;
  for (let i = 0; i < 2000; i++) {
    const { data, error } = await sb
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    from += PAGE;
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
