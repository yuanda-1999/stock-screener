"use client";

import { useState, useRef, useCallback } from "react";
import type { CombinedScreeningFilters, StockScreeningResult } from "@/lib/types";

interface UseScreeningReturn {
  results: StockScreeningResult[];
  isScanning: boolean;
  progress: { done: number; total: number } | null;
  error: string | null;
  start: (filters: CombinedScreeningFilters, limitCodes?: string[]) => void;
  stop: () => void;
}

export function useScreening(): UseScreeningReturn {
  const [results, setResults] = useState<StockScreeningResult[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsScanning(false);
  }, []);

  const start = useCallback(
    (filters: CombinedScreeningFilters, limitCodes?: string[]) => {
      // 停止正在进行的扫描
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      setResults([]);
      setError(null);
      setProgress(null);
      setIsScanning(true);

      // 构建 URL 参数
      const params = new URLSearchParams();
      buildParams(params, filters);
      if (limitCodes?.length) {
        params.set("codes", limitCodes.join(","));
      }

      const url = `/api/screening/combined?${params.toString()}`;

      fetch(url, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const reader = response.body?.getReader();
          if (!reader) throw new Error("No body");

          const decoder = new TextDecoder();
          let buffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                try {
                  const event = JSON.parse(line.slice(6));
                  if (event.type === "result") {
                    setResults((prev) => [...prev, event.stock]);
                  } else if (event.type === "progress") {
                    setProgress({ done: event.done, total: event.total });
                  } else if (event.type === "done") {
                    setIsScanning(false);
                    return;
                  } else if (event.type === "error") {
                    setError(event.error);
                    setIsScanning(false);
                    return;
                  }
                } catch {
                  // 解析失败，跳过
                }
              }
            }
            // 流意外结束（未收到 done/error 事件）
            setError("连接意外中断，请重试");
          } finally {
            setIsScanning(false);
          }
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            setError(String(err));
          }
          setIsScanning(false);
        });
    },
    []
  );

  return { results, isScanning, progress, error, start, stop };
}

function buildParams(params: URLSearchParams, filters: CombinedScreeningFilters) {
  // 行情
  if (filters.price) { params.set("enable_price", "1"); params.set("price_min", String(filters.price.min)); params.set("price_max", String(filters.price.max)); }
  if (filters.changeRate) { params.set("enable_change", "1"); setMinMax(params, "change", filters.changeRate); }
  if (filters.turnover) { params.set("enable_turnover", "1"); setMinMax(params, "turnover", filters.turnover); }
  if (filters.volumeRatio) { params.set("enable_volratio", "1"); setMinMax(params, "volratio", filters.volumeRatio); }
  if (filters.totalMv) { params.set("enable_totalmv", "1"); setMinMax(params, "totalmv", filters.totalMv); }
  if (filters.circMv) { params.set("enable_circmv", "1"); setMinMax(params, "circmv", filters.circMv); }
  if (filters.amplitude) { params.set("enable_amplitude", "1"); setMinMax(params, "amplitude", filters.amplitude); }

  // 基本面
  if (filters.pe) { params.set("enable_pe", "1"); setMinMax(params, "pe", filters.pe); }
  if (filters.pb) { params.set("enable_pb", "1"); setMinMax(params, "pb", filters.pb); }
  if (filters.roe) { params.set("enable_roe", "1"); setMinMax(params, "roe", filters.roe); }
  if (filters.eps) { params.set("enable_eps", "1"); setMinMax(params, "eps", filters.eps); }
  if (filters.grossMargin) { params.set("enable_grossmargin", "1"); setMinMax(params, "grossmargin", filters.grossMargin); }
  if (filters.netMargin) { params.set("enable_netmargin", "1"); setMinMax(params, "netmargin", filters.netMargin); }
  if (filters.debtRatio) { params.set("enable_debtratio", "1"); setMinMax(params, "debtratio", filters.debtRatio); }
  if (filters.revenueGrowth) { params.set("enable_revgrowth", "1"); setMinMax(params, "revgrowth", filters.revenueGrowth); }
  if (filters.profitGrowth) { params.set("enable_profitgrowth", "1"); setMinMax(params, "profitgrowth", filters.profitGrowth); }

  // 技术
  if (filters.macd) { params.set("enable_macd", "1"); params.set("macd_years", String(filters.macd.years)); params.set("macd_threshold", String(filters.macd.thresholdPct)); }
  if (filters.kdj) { params.set("enable_kdj", "1"); params.set("kdj_method", filters.kdj.method); if (filters.kdj.kMax) params.set("kdj_kmax", String(filters.kdj.kMax)); if (filters.kdj.jMax) params.set("kdj_jmax", String(filters.kdj.jMax)); }
  if (filters.rsi) { params.set("enable_rsi", "1"); params.set("rsi_max", String(filters.rsi.max)); }
  if (filters.boll) { params.set("enable_boll", "1"); params.set("boll_method", filters.boll.method); }
  if (filters.wr) { params.set("enable_wr", "1"); setMinMax(params, "wr", filters.wr); }
  if (filters.bias) { params.set("enable_bias", "1"); setMinMax(params, "bias", filters.bias); }

  // 分红
  if (filters.dividend) { params.set("enable_dividend", "1"); params.set("cash_div_min", String(filters.dividend.minCashDiv)); params.set("year", filters.dividend.year); }
  if (filters.dividendYield) { params.set("enable_divyield", "1"); setMinMax(params, "divyield", filters.dividendYield); }

  // 筹码
  if (filters.chip) { params.set("enable_chip", "1"); params.set("chip_weeks", String(filters.chip.weeks)); params.set("chip_threshold", String(filters.chip.thresholdPct)); }

  // 涨幅预过滤
  if (filters.gainers) { params.set("enable_gainers", "1"); params.set("gain_threshold", String(filters.gainers.thresholdPct)); }
}

function setMinMax(params: URLSearchParams, prefix: string, filter: { min?: number; max?: number }) {
  if (filter.min !== undefined) params.set(`${prefix}_min`, String(filter.min));
  if (filter.max !== undefined) params.set(`${prefix}_max`, String(filter.max));
}
