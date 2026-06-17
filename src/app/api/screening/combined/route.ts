// SSE 组合筛选 API
import { NextRequest } from "next/server";
import { loadAllToMemory } from "@/lib/cache/index";
import { tushareCombinedScreening } from "@/lib/tushare/screening";
import type { CombinedScreeningFilters } from "@/lib/types";

let _loaded = false;

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
  if (params.get("enable_turnover") === "1") {
    filters.turnover = parseRange(params, "turnover_");
  }
  if (params.get("enable_volratio") === "1") {
    filters.volumeRatio = parseRange(params, "volratio_");
  }
  if (params.get("enable_totalmv") === "1") {
    filters.totalMv = parseRange(params, "totalmv_");
  }
  if (params.get("enable_circmv") === "1") {
    filters.circMv = parseRange(params, "circmv_");
  }
  if (params.get("enable_amplitude") === "1") {
    filters.amplitude = parseRange(params, "amplitude_");
  }

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
  if (params.get("enable_divyield") === "1") {
    filters.dividendYield = parseRange(params, "divyield_");
  }

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

  // 限定代码范围（在结果中筛选）
  const codesParam = params.get("codes");
  const limitCodes = codesParam ? codesParam.split(",") : undefined;

  // SSE 流 — 加载和筛选都在流内完成，前端能立即收到 loading 事件
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        if (!_loaded) {
          send({ type: "loading", message: "正在加载数据..." });
          await loadAllToMemory();
          _loaded = true;
        }
        for await (const event of tushareCombinedScreening(filters, limitCodes)) {
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
