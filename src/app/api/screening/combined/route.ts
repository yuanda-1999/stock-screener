// SSE 组合筛选 API
// 两层筛选：DB 过滤简单指标 → JS 检查技术指标
import { NextRequest } from "next/server";
import { loadAllToMemory, loadCandidatesToMemory, loadDividendsForCandidates } from "@/lib/cache/index";
import { tushareCombinedScreening } from "@/lib/tushare/screening";
import { screenStocksBasic, hasBasicFilters, onlyTechnicalFilters } from "@/lib/screening/db-filter";
import type { CombinedScreeningFilters } from "@/lib/types";

let _loadedDaily = false;
let _loadedMACD = false;
let _loadedCYQ = false;
let _loadedDividends = false;

function needsDailyBars(filters: CombinedScreeningFilters): boolean {
  return !!(filters.price || filters.changeRate || filters.amplitude ||
    filters.kdj || filters.rsi || filters.boll || filters.wr || filters.bias || filters.gainers);
}
function needsMACD(filters: CombinedScreeningFilters): boolean {
  return !!filters.macd;
}
function needsCYQ(filters: CombinedScreeningFilters): boolean {
  return !!filters.chip;
}
function needsDividends(filters: CombinedScreeningFilters): boolean {
  return !!(filters.dividend || filters.dividendYield);
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const params = url.searchParams;

  const filters: CombinedScreeningFilters = {};

  // === 行情指标 ===
  if (params.get("enable_price") === "1") {
    const min = parseFloat(params.get("price_min") || "0");
    const max = parseFloat(params.get("price_max") || "0");
    if (max > 0) filters.price = { min, max };
  }
  if (params.get("enable_change") === "1") {
    const min = parseFloat(params.get("change_min") || "0");
    const max = parseFloat(params.get("change_max") || "0");
    filters.changeRate = { min, max };
  }
  if (params.get("enable_turnover") === "1") filters.turnover = parseRange(params, "turnover_");
  if (params.get("enable_volratio") === "1") filters.volumeRatio = parseRange(params, "volratio_");
  if (params.get("enable_totalmv") === "1") filters.totalMv = parseRange(params, "totalmv_");
  if (params.get("enable_circmv") === "1") filters.circMv = parseRange(params, "circmv_");
  if (params.get("enable_amplitude") === "1") filters.amplitude = parseRange(params, "amplitude_");

  // === 基本面 ===
  if (params.get("enable_pe") === "1") filters.pe = parseRange(params, "pe_");
  if (params.get("enable_pb") === "1") filters.pb = parseRange(params, "pb_");
  if (params.get("enable_roe") === "1") filters.roe = parseRange(params, "roe_");
  if (params.get("enable_eps") === "1") filters.eps = parseRange(params, "eps_");
  if (params.get("enable_grossmargin") === "1") filters.grossMargin = parseRange(params, "grossmargin_");
  if (params.get("enable_netmargin") === "1") filters.netMargin = parseRange(params, "netmargin_");
  if (params.get("enable_debtratio") === "1") filters.debtRatio = parseRange(params, "debtratio_");
  if (params.get("enable_revgrowth") === "1") filters.revenueGrowth = parseRange(params, "revgrowth_");
  if (params.get("enable_profitgrowth") === "1") filters.profitGrowth = parseRange(params, "profitgrowth_");

  // === 技术指标 ===
  if (params.get("enable_macd") === "1") {
    filters.macd = {
      years: parseInt(params.get("macd_years") || "2"),
      thresholdPct: parseFloat(params.get("macd_threshold") || "20"),
    };
  }
  if (params.get("enable_kdj") === "1") {
    filters.kdj = {
      method: (params.get("kdj_method") || "超卖") as "超卖" | "金叉" | "低位",
      kMax: params.get("kdj_kmax") ? parseFloat(params.get("kdj_kmax")!) : undefined,
      dMax: params.get("kdj_dmax") ? parseFloat(params.get("kdj_dmax")!) : undefined,
      jMax: params.get("kdj_jmax") ? parseFloat(params.get("kdj_jmax")!) : undefined,
    };
  }
  if (params.get("enable_rsi") === "1") {
    filters.rsi = { max: parseFloat(params.get("rsi_max") || "30") };
  }
  if (params.get("enable_boll") === "1") {
    filters.boll = { method: (params.get("boll_method") || "下轨附近") as "下轨附近" | "突破中轨" | "缩口" };
  }
  if (params.get("enable_wr") === "1") filters.wr = parseRange(params, "wr_");
  if (params.get("enable_bias") === "1") filters.bias = parseRange(params, "bias_");

  // === 分红 ===
  if (params.get("enable_dividend") === "1") {
    filters.dividend = {
      minCashDiv: parseFloat(params.get("cash_div_min") || "0.3"),
      year: params.get("year") || "2025",
    };
  }
  if (params.get("enable_divyield") === "1") filters.dividendYield = parseRange(params, "divyield_");

  // === 筹码 ===
  if (params.get("enable_chip") === "1") {
    filters.chip = {
      weeks: parseInt(params.get("chip_weeks") || "30"),
      thresholdPct: parseFloat(params.get("chip_threshold") || "20"),
    };
  }

  // 涨幅预过滤
  if (params.get("enable_gainers") === "1") {
    filters.gainers = { thresholdPct: parseFloat(params.get("gain_threshold") || "5") };
  }

  // 限定代码范围
  const codesParam = params.get("codes");
  const limitCodes = codesParam ? codesParam.split(",") : undefined;

  // 按需加载判断
  const wantDaily = needsDailyBars(filters);
  const wantMACD = needsMACD(filters);
  const wantCYQ = needsCYQ(filters);
  const wantDividends = needsDividends(filters);

  // SSE 流
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        // 第一步：尝试 DB 层筛选
        let candidateCodes: string[] | undefined = limitCodes;
        let dbRows: import("@/lib/screening/db-filter").DBScreeningRow[] | undefined;
        const useDBScreening = !limitCodes && hasBasicFilters(filters);

        if (useDBScreening) {
          send({ type: "loading", message: "正在数据库筛选..." });
          try {
            const result = await screenStocksBasic(filters);
            candidateCodes = result.codes;
            dbRows = result.rows;
            send({ type: "loading", message: `数据库筛选完成: ${result.codes.length} 只候选股` });
          } catch (e) {
            const msg = (e as Error).message || String(e);
            console.error("[screening] DB screening failed, falling back to full scan:", msg);
            send({ type: "loading", message: `数据库筛选失败 (${msg.slice(0, 80)})，回退全量扫描...` });
            candidateCodes = undefined;
          }
        }

        // 第二步：加载数据到内存
        // 判断是否仍需加载 core 表（DB 筛选返回了结果 ≠ 可以不加载；仍需看 JS 是否需要这些值做展示）
        const needsDailyBasicForJS = !!(filters.pe || filters.pb || filters.turnover ||
          filters.volumeRatio || filters.totalMv || filters.circMv);
        const needsFinanceForJS = !!(filters.roe || filters.eps || filters.grossMargin ||
          filters.netMargin || filters.debtRatio || filters.revenueGrowth || filters.profitGrowth);
        const dbHandledCore = useDBScreening && dbRows && dbRows.length > 0;

        if (candidateCodes && candidateCodes.length > 0) {
          if (dbHandledCore) {
            // 始终加载股票名称（用于结果显示）
            const needStocks = !_loadedDividends; // 首次 DB 成功时加载
            if (needsDailyBasicForJS || needsFinanceForJS || needStocks) {
              await loadAllToMemory({
                needsBars: false, needsTechFactors: false,
                needsStocks: needStocks,
                needsDailyBasic: needsDailyBasicForJS,
                needsFinance: needsFinanceForJS,
                needsDividends: false,
              });
            }
            // 分红：按候选股代码加载，避免全量 94K 行加载
            if (wantDividends && !_loadedDividends) {
              send({ type: "loading", message: `正在加载 ${candidateCodes.length} 只候选股分红数据...` });
              await loadDividendsForCandidates(candidateCodes);
              _loadedDividends = true;
            }
          } else if (!_loadedDaily && !_loadedMACD && !_loadedCYQ && !_loadedDividends) {
            // DB 未运行/失败 → 全量加载核心表
            send({ type: "loading", message: "正在加载核心数据..." });
            await loadAllToMemory({
              needsBars: false,
              needsTechFactors: false,
              needsDividends: wantDividends && !_loadedDividends,
            });
            if (wantDividends) _loadedDividends = true;
          }

          // 候选股的 bar/技术因子按需加载
          const loadDaily = wantDaily && !_loadedDaily;
          const loadMACD = wantMACD && !_loadedMACD;
          const loadCYQ = wantCYQ && !_loadedCYQ;
          if (loadDaily || loadMACD || loadCYQ) {
            const parts: string[] = [];
            if (loadDaily) parts.push("日线");
            if (loadMACD) parts.push("MACD");
            if (loadCYQ) parts.push("筹码");
            // maxRows: 日线需要历史数据计算指标（~60条/股），MACD/筹码只需验证（~3条/股）
            const maxRows = loadDaily ? candidateCodes.length * 60 : candidateCodes.length * 3;
            send({ type: "loading", message: `正在加载 ${candidateCodes.length} 只候选股数据 (${parts.join("/")})...` });
            await loadCandidatesToMemory(candidateCodes, {
              needsDaily: loadDaily,
              needsMACD: loadMACD,
              needsCYQ: loadCYQ,
              maxRows,
            });
            if (loadDaily) _loadedDaily = true;
            if (loadMACD) _loadedMACD = true;
            if (loadCYQ) _loadedCYQ = true;
          }
        } else if (candidateCodes && candidateCodes.length === 0) {
          // DB 筛选无结果，直接返回
          send({ type: "progress", done: 0, total: 0 });
          send({ type: "done" });
          return;
        } else {
          // 回退：全量加载
          send({ type: "loading", message: "正在加载全量数据..." });
          await loadAllToMemory({
            needsBars: (wantDaily && !_loadedDaily) || (wantMACD && !_loadedMACD) || (wantCYQ && !_loadedCYQ),
            needsTechFactors: (wantMACD && !_loadedMACD) || (wantCYQ && !_loadedCYQ),
            needsDividends: wantDividends && !_loadedDividends,
            needsDailyBasic: !dbRows,
            needsFinance: !dbRows,
          });
          if (wantDaily) _loadedDaily = true;
          if (wantMACD) _loadedMACD = true;
          if (wantCYQ) _loadedCYQ = true;
          if (wantDividends) _loadedDividends = true;
        }

        // 第三步：JS 层筛选（全量或候选集）
        for await (const event of tushareCombinedScreening(filters, candidateCodes)) {
          send(event);
          if (event.type === "done") break;
        }
      } catch (e) {
        send({ type: "error", error: (e as Error).message || String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function parseRange(params: URLSearchParams, prefix: string): { min?: number; max?: number } {
  const min = params.get(`${prefix}min`);
  const max = params.get(`${prefix}max`);
  const result: { min?: number; max?: number } = {};
  if (min) result.min = parseFloat(min);
  if (max) result.max = parseFloat(max);
  return result;
}
