// Tushare HTTP 客户端 — 从当前项目 tushare.ts 移植

const TOKEN = process.env.TUSHARE_TOKEN || "";
const ENDPOINT = process.env.TUSHARE_API_URL || "https://api.tushare.pro";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function tushareCall(
  apiName: string,
  params: Record<string, string>,
  fields: string
): Promise<Record<string, unknown>[]> {
  if (!TOKEN) throw new Error("TUSHARE_TOKEN not configured");

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(2000 * attempt + Math.random() * 3000);
    try {
      const resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_name: apiName, token: TOKEN, params, fields }),
        signal: AbortSignal.timeout(20_000),
      });
      if (resp.status === 429) { lastErr = new Error("429"); continue; }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as {
        code: number;
        msg: string;
        data?: { fields: string[]; items: unknown[][] };
      };
      if (json.code !== 0) throw new Error(json.msg || "API error");
      if (!json.data?.items?.length) return [];
      const { fields: fs, items } = json.data;
      return items.map((row) => {
        const obj: Record<string, unknown> = {};
        fs.forEach((f, i) => {
          obj[f] = (row as unknown[])[i];
        });
        return obj;
      });
    } catch (e) {
      lastErr = e as Error;
      const message = (e as Error).message || "";
      if (
        message.includes("429") ||
        message.includes("fetch failed") ||
        message.includes("socket") ||
        message.includes("timeout") ||
        message.includes("network")
      ) continue;
      throw e;
    }
  }
  throw lastErr || new Error("retry exhausted");
}
