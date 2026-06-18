"use client";

import { useState, useMemo, useCallback } from "react";
import { useScreening } from "@/hooks/use-screening";
import type { CombinedScreeningFilters, StockScreeningResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  Play,
  Square,
  Zap,
  X,
  Filter,
} from "lucide-react";

// ==================== 指标定义 ====================

type IndicatorType =
  | "range"
  | "single"
  | "macd"
  | "kdj"
  | "boll"
  | "dividend"
  | "chip"
  | "gainers"
  | "industries";

interface IndicatorDef {
  id: string;
  category: string;
  label: string;
  keywords: string[];
  type: IndicatorType;
  unit?: string;
  step?: string;
  defaults: Record<string, unknown>;
}

const INDICATORS: IndicatorDef[] = [
  // 行业/版块
  { id: "industries", category: "板块", label: "行业板块", keywords: ["行业", "板块", "industry", "sector", "hy"], type: "industries", defaults: { industries: [] as string[] } },
  // 行情
  { id: "price", category: "行情", label: "最新价", keywords: ["价格", "price", "jg"], type: "range", unit: "元", step: "0.01", defaults: { min: undefined, max: undefined } },
  { id: "changeRate", category: "行情", label: "涨跌幅", keywords: ["涨幅", "change", "zdf"], type: "range", unit: "%", step: "0.1", defaults: { min: undefined, max: undefined } },
  { id: "turnover", category: "行情", label: "换手率", keywords: ["换手", "turnover", "hsl"], type: "range", unit: "%", step: "0.1", defaults: { min: undefined, max: undefined } },
  { id: "volumeRatio", category: "行情", label: "量比", keywords: ["volume", "lb", "vol"], type: "range", step: "0.1", defaults: { min: undefined, max: undefined } },
  { id: "totalMv", category: "行情", label: "总市值", keywords: ["市值", "marketcap", "zsz"], type: "range", unit: "亿", step: "1", defaults: { min: undefined, max: undefined } },
  { id: "circMv", category: "行情", label: "流通市值", keywords: ["流通", "circ", "ltsz"], type: "range", unit: "亿", step: "1", defaults: { min: undefined, max: undefined } },
  { id: "amplitude", category: "行情", label: "振幅", keywords: ["amplitude", "zf", "ap"], type: "range", unit: "%", step: "0.1", defaults: { min: undefined, max: undefined } },
  // 基本面
  { id: "pe", category: "基本面", label: "市盈率(PE)", keywords: ["市盈率", "pe", "syl"], type: "range", step: "0.1", defaults: { min: undefined, max: undefined } },
  { id: "pb", category: "基本面", label: "市净率(PB)", keywords: ["市净率", "pb", "sjl"], type: "range", step: "0.1", defaults: { min: undefined, max: undefined } },
  { id: "roe", category: "基本面", label: "ROE", keywords: ["净资产收益率", "roe", "jzcsyl"], type: "range", unit: "%", step: "0.1", defaults: { min: undefined, max: undefined } },
  { id: "eps", category: "基本面", label: "每股收益(EPS)", keywords: ["每股收益", "eps", "mgsy"], type: "range", step: "0.01", defaults: { min: undefined, max: undefined } },
  { id: "grossMargin", category: "基本面", label: "毛利率", keywords: ["毛利率", "gross", "mll"], type: "range", unit: "%", step: "0.1", defaults: { min: undefined, max: undefined } },
  { id: "netMargin", category: "基本面", label: "净利率", keywords: ["净利率", "net", "jll"], type: "range", unit: "%", step: "0.1", defaults: { min: undefined, max: undefined } },
  { id: "debtRatio", category: "基本面", label: "资产负债率", keywords: ["负债", "debt", "fzl"], type: "range", unit: "%", step: "0.1", defaults: { min: undefined, max: undefined } },
  { id: "revenueGrowth", category: "基本面", label: "营收增长率", keywords: ["营收", "revenue", "yszzl"], type: "range", unit: "%", step: "0.1", defaults: { min: undefined, max: undefined } },
  { id: "profitGrowth", category: "基本面", label: "净利润增长率", keywords: ["利润", "profit", "jlrzzl"], type: "range", unit: "%", step: "0.1", defaults: { min: undefined, max: undefined } },
  // 技术
  { id: "macd", category: "技术", label: "MACD低位", keywords: ["macd", "macd低位", "md"], type: "macd", unit: "%", step: "1", defaults: { weeks: 26, thresholdPct: 20 } },
  { id: "kdj", category: "技术", label: "KDJ", keywords: ["kdj", "kd"], type: "kdj", defaults: { method: "超卖", kMax: undefined, jMax: undefined } },
  { id: "rsi", category: "技术", label: "RSI", keywords: ["rsi", "rs"], type: "single", step: "1", defaults: { max: 30 } },
  { id: "boll", category: "技术", label: "BOLL布林", keywords: ["布林", "boll", "bl"], type: "boll", defaults: { method: "下轨附近" } },
  { id: "wr", category: "技术", label: "WR威廉", keywords: ["威廉", "wr", "wl"], type: "range", step: "0.1", defaults: { min: undefined, max: undefined } },
  { id: "bias", category: "技术", label: "BIAS乖离", keywords: ["乖离", "bias", "gl"], type: "range", unit: "%", step: "0.1", defaults: { min: undefined, max: undefined } },
  // 分红
  { id: "dividend", category: "分红", label: "每股分红", keywords: ["分红", "dividend", "fh"], type: "dividend", step: "0.01", defaults: { minCashDiv: 0.3, year: "2025" } },
  { id: "dividendYield", category: "分红", label: "股息率", keywords: ["股息", "yield", "gxl"], type: "range", unit: "%", step: "0.1", defaults: { min: undefined, max: undefined } },
  // 筹码
  { id: "chip", category: "筹码", label: "筹码集中度", keywords: ["筹码", "chip", "cm"], type: "chip", unit: "%", step: "0.1", defaults: { weeks: 30, thresholdPct: 20 } },
  // 预过滤
  { id: "gainers", category: "预过滤", label: "涨幅预过滤", keywords: ["预过滤", "gainer", "glv"], type: "gainers", unit: "%", step: "0.1", defaults: { thresholdPct: 5 } },
];

const CATEGORIES = ["行情", "基本面", "技术", "分红", "筹码", "预过滤"];

// ==================== 工具函数 ====================

function buildFilters(state: Record<string, unknown>): CombinedScreeningFilters {
  const filters: CombinedScreeningFilters = {};
  for (const [key, value] of Object.entries(state)) {
    if (key === "industries") {
      // filterState.industries = { industries: [...] } → extract array
      const inner = (value as Record<string, unknown>).industries;
      if (Array.isArray(inner) && inner.length > 0) {
        filters.industries = inner as string[];
      }
    } else {
      (filters as Record<string, unknown>)[key] = value;
    }
  }
  return filters;
}

// ==================== 主页面 ====================

export default function Home() {
  const { results, isScanning, progress, loadingMessage, error, start, stop } = useScreening();

  // 筛选条件状态：{ [indicatorId]: { ...values } }，key 存在 = 已启用
  const [filterState, setFilterState] = useState<Record<string, Record<string, unknown>>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCats, setExpandedCats] = useState<string[]>([]);

  // 搜索过滤指标
  const filteredIndicators = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return INDICATORS;
    return INDICATORS.filter((ind) =>
      ind.keywords.some((kw) => kw.toLowerCase().includes(q)) ||
      ind.label.toLowerCase().includes(q) ||
      ind.id.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // 按分类分组
  const groupedIndicators = useMemo(() => {
    const map = new Map<string, IndicatorDef[]>();
    for (const cat of CATEGORIES) map.set(cat, []);
    for (const ind of filteredIndicators) {
      map.get(ind.category)?.push(ind);
    }
    return map;
  }, [filteredIndicators]);

  // 已启用数量
  const enabledCount = Object.keys(filterState).length;
  const matchedCount = filteredIndicators.length;

  // 切换启用/禁用
  const toggleFilter = useCallback((id: string, defaults: Record<string, unknown>) => {
    setFilterState((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = { ...defaults };
      }
      return next;
    });
  }, []);

  // 更新筛选值
  const updateFilterValue = useCallback(
    (id: string, key: string, value: unknown) => {
      setFilterState((prev) => {
        if (!prev[id]) return prev;
        return { ...prev, [id]: { ...prev[id], [key]: value } };
      });
    },
    []
  );

  // 开始筛选
  const handleStart = useCallback(() => {
    const filters = buildFilters(filterState);
    start(filters);
  }, [filterState, start]);

  // 预热缓存
  const handlePrewarm = useCallback(() => {
    const evtSource = new EventSource("/api/screening/prewarm");
    evtSource.onmessage = () => {};
    evtSource.onerror = () => evtSource.close();
    setTimeout(() => evtSource.close(), 5000);
  }, []);

  // 结果表格列
  const resultColumns = useMemo(() => {
    if (results.length === 0) return [];
    const first = results[0];
    const cols: { key: string; label: string; fixed?: boolean }[] = [
      { key: "代码", label: "代码", fixed: true },
      { key: "名称", label: "名称", fixed: true },
    ];
    const rest: string[] = [];
    for (const key of Object.keys(first)) {
      if (key !== "代码" && key !== "名称") rest.push(key);
    }
    const priority = [
      "最新价", "涨跌幅", "PE", "PB", "ROE", "EPS",
      "MACD", "K", "D", "J", "RSI", "WR", "BIAS6",
      "每股分红", "股息率", "筹码集中度",
    ];
    rest.sort((a, b) => {
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    for (const key of rest) cols.push({ key, label: key });
    return cols;
  }, [results]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* 顶部标题栏 */}
      <header className="shrink-0 border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Filter className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold font-heading text-foreground tracking-tight">
            A 股指标筛选平台
          </h1>
          {enabledCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {enabledCount} 个条件 · AND 逻辑
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {isScanning && (loadingMessage || progress) && (
            <div className="flex items-center gap-2">
              {loadingMessage ? (
                <span className="text-xs text-muted-foreground whitespace-nowrap">{loadingMessage}</span>
              ) : progress ? (
                <>
                  <span className="text-xs font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                    {progress.done}/{progress.total}
                  </span>
                  <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{
                        width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </>
              ) : null}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrewarm}
            className="h-8 text-xs gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" />
            预热缓存
          </Button>
          <Button
            variant={isScanning ? "destructive" : "default"}
            size="sm"
            onClick={isScanning ? stop : handleStart}
            disabled={!isScanning && enabledCount === 0}
            className="h-8 text-xs gap-1.5"
          >
            {isScanning ? (
              <>
                <Square className="w-3.5 h-3.5" />
                停止
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                开始筛选
              </>
            )}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* 左侧筛选面板 */}
        <aside className="w-[360px] shrink-0 border-r border-border bg-card flex flex-col">
          {/* 搜索栏 */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索指标（中/英/拼音）"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              匹配 {matchedCount}/{INDICATORS.length}
            </p>
          </div>

          {/* 指标列表 */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <Accordion
              multiple
              value={expandedCats}
              onValueChange={setExpandedCats}
              className="space-y-1"
            >
              {CATEGORIES.map((cat) => {
                const indicators = groupedIndicators.get(cat) || [];
                if (indicators.length === 0) return null;
                const catEnabledCount = indicators.filter(
                  (ind) => filterState[ind.id]
                ).length;
                return (
                  <AccordionItem
                    key={cat}
                    value={cat}
                    className="border rounded-lg px-3"
                  >
                    <AccordionTrigger className="py-2.5 text-sm font-medium hover:no-underline">
                      <span className="flex items-center gap-2">
                        {cat}
                        {catEnabledCount > 0 && (
                          <Badge variant="default" className="text-[10px] h-4 px-1.5 leading-none">
                            {catEnabledCount}
                          </Badge>
                        )}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 pb-2">
                        {indicators.map((ind) => (
                          <FilterCard
                            key={ind.id}
                            indicator={ind}
                            enabled={!!filterState[ind.id]}
                            values={filterState[ind.id] || {}}
                            onToggle={() => toggleFilter(ind.id, ind.defaults)}
                            onChange={(key, val) => updateFilterValue(ind.id, key, val)}
                          />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            {filteredIndicators.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                无匹配指标
              </p>
            )}
          </div>
        </aside>

        {/* 右侧结果区域 */}
        <main className="flex-1 flex flex-col min-w-0 bg-background">
          {/* 状态栏 */}
          <div className="shrink-0 px-6 py-2 border-b border-border flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              {isScanning && loadingMessage ? (
                <span className="text-muted-foreground">{loadingMessage}</span>
              ) : isScanning && progress ? (
                <span className="text-muted-foreground">
                  扫描中 {progress.done}/{progress.total}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {results.length > 0
                    ? `结果: ${results.length} 只`
                    : error
                      ? `错误: ${error}`
                      : "就绪"}
                </span>
              )}
              {isScanning && progress && progress.total > 1 && (
                <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{
                      width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 结果表格 */}
          <div className="flex-1 overflow-auto">
            <ResultsTable results={results} columns={resultColumns} />
          </div>
        </main>
      </div>
    </div>
  );
}

// ==================== 筛选卡片 ====================

function FilterCard({
  indicator,
  enabled,
  values,
  onToggle,
  onChange,
}: {
  indicator: IndicatorDef;
  enabled: boolean;
  values: Record<string, unknown>;
  onToggle: () => void;
  onChange: (key: string, value: unknown) => void;
}) {
  const id = indicator.id;

  return (
    <Card className={`p-2.5 border transition-colors ${enabled ? "border-primary/30 bg-primary/5" : "bg-transparent"}`}>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`chk-${id}`}
          checked={enabled}
          onCheckedChange={onToggle}
          className="h-4 w-4"
        />
        <Label htmlFor={`chk-${id}`} className="text-sm font-medium cursor-pointer flex-1">
          {indicator.label}
          {indicator.unit && (
            <span className="text-xs text-muted-foreground ml-1">({indicator.unit})</span>
          )}
        </Label>
      </div>

      {enabled && (
        <div className="mt-2 pl-6 space-y-1.5">
          {indicator.type === "range" && (
            <RangeInputs id={id} values={values} step={indicator.step} onChange={onChange} />
          )}
          {indicator.type === "single" && (
            <SingleInput id={id} values={values} step={indicator.step} onChange={onChange} />
          )}
          {indicator.type === "macd" && (
            <MacdInputs id={id} values={values} unit={indicator.unit} onChange={onChange} />
          )}
          {indicator.type === "kdj" && (
            <KdjInputs id={id} values={values} onChange={onChange} />
          )}
          {indicator.type === "boll" && (
            <BollInputs id={id} values={values} onChange={onChange} />
          )}
          {indicator.type === "dividend" && (
            <DividendInputs id={id} values={values} onChange={onChange} />
          )}
          {indicator.type === "chip" && (
            <ChipInputs id={id} values={values} unit={indicator.unit} onChange={onChange} />
          )}
          {indicator.type === "gainers" && (
            <GainersInputs id={id} values={values} unit={indicator.unit} onChange={onChange} />
          )}
          {indicator.type === "industries" && (
            <IndustriesInput id={id} values={values} onChange={onChange} />
          )}
        </div>
      )}
    </Card>
  );
}

function RangeInputs({
  id,
  values,
  step,
  onChange,
}: {
  id: string;
  values: Record<string, unknown>;
  step?: string;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        placeholder="最小值"
        step={step || "0.1"}
        value={values.min !== undefined ? String(values.min) : ""}
        onChange={(e) => onChange("min", e.target.value ? parseFloat(e.target.value) : undefined)}
        className="h-7 text-xs w-24"
      />
      <span className="text-xs text-muted-foreground">—</span>
      <Input
        type="number"
        placeholder="最大值"
        step={step || "0.1"}
        value={values.max !== undefined ? String(values.max) : ""}
        onChange={(e) => onChange("max", e.target.value ? parseFloat(e.target.value) : undefined)}
        className="h-7 text-xs w-24"
      />
    </div>
  );
}

function SingleInput({
  id,
  values,
  step,
  onChange,
}: {
  id: string;
  values: Record<string, unknown>;
  step?: string;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">≤</span>
      <Input
        type="number"
        placeholder="最大值"
        step={step || "1"}
        value={values.max !== undefined ? String(values.max) : ""}
        onChange={(e) => onChange("max", e.target.value ? parseFloat(e.target.value) : undefined)}
        className="h-7 text-xs w-24"
      />
    </div>
  );
}

function MacdInputs({
  id,
  values,
  unit,
  onChange,
}: {
  id: string;
  values: Record<string, unknown>;
  unit?: string;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">周数</span>
      <Input
        type="number"
        step="1"
        min="1"
        max="104"
        value={values.weeks !== undefined ? String(values.weeks) : "26"}
        onChange={(e) => onChange("weeks", parseInt(e.target.value) || 26)}
        className="h-7 text-xs w-16"
      />
      <span className="text-xs text-muted-foreground">分位≤{unit || "%"}</span>
      <Input
        type="number"
        step="1"
        min="1"
        max="100"
        value={values.thresholdPct !== undefined ? String(values.thresholdPct) : "20"}
        onChange={(e) => onChange("thresholdPct", parseFloat(e.target.value) || 20)}
        className="h-7 text-xs w-20"
      />
    </div>
  );
}

function KdjInputs({
  id,
  values,
  onChange,
}: {
  id: string;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const methods = ["超卖", "金叉", "低位"];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        {methods.map((m) => (
          <Button
            key={m}
            variant={values.method === m ? "default" : "outline"}
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => onChange("method", m)}
          >
            {m}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>K≤</span>
        <Input
          type="number"
          placeholder="不限"
          step="1"
          value={values.kMax !== undefined ? String(values.kMax) : ""}
          onChange={(e) => onChange("kMax", e.target.value ? parseFloat(e.target.value) : undefined)}
          className="h-7 text-xs w-16"
        />
        <span>J≤</span>
        <Input
          type="number"
          placeholder="不限"
          step="1"
          value={values.jMax !== undefined ? String(values.jMax) : ""}
          onChange={(e) => onChange("jMax", e.target.value ? parseFloat(e.target.value) : undefined)}
          className="h-7 text-xs w-16"
        />
      </div>
    </div>
  );
}

function BollInputs({
  id,
  values,
  onChange,
}: {
  id: string;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const methods = ["下轨附近", "突破中轨", "缩口"];
  return (
    <div className="flex items-center gap-1">
      {methods.map((m) => (
        <Button
          key={m}
          variant={values.method === m ? "default" : "outline"}
          size="sm"
          className="h-6 text-xs px-2"
          onClick={() => onChange("method", m)}
        >
          {m}
        </Button>
      ))}
    </div>
  );
}

function DividendInputs({
  id,
  values,
  onChange,
}: {
  id: string;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">每股≥</span>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={values.minCashDiv !== undefined ? String(values.minCashDiv) : "0.3"}
        onChange={(e) => onChange("minCashDiv", parseFloat(e.target.value) || 0)}
        className="h-7 text-xs w-20"
      />
      <span className="text-xs text-muted-foreground">年份</span>
      <Input
        type="text"
        value={values.year !== undefined ? String(values.year) : "2025"}
        onChange={(e) => onChange("year", e.target.value)}
        className="h-7 text-xs w-20"
      />
    </div>
  );
}

function ChipInputs({
  id,
  values,
  unit,
  onChange,
}: {
  id: string;
  values: Record<string, unknown>;
  unit?: string;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">周数</span>
      <Input
        type="number"
        step="1"
        min="1"
        value={values.weeks !== undefined ? String(values.weeks) : "30"}
        onChange={(e) => onChange("weeks", parseInt(e.target.value) || 30)}
        className="h-7 text-xs w-16"
      />
      <span className="text-xs text-muted-foreground">{unit || "%"}≥</span>
      <Input
        type="number"
        step="0.1"
        min="0"
        max="100"
        value={values.thresholdPct !== undefined ? String(values.thresholdPct) : "20"}
        onChange={(e) => onChange("thresholdPct", parseFloat(e.target.value) || 20)}
        className="h-7 text-xs w-20"
      />
    </div>
  );
}

function GainersInputs({
  id,
  values,
  unit,
  onChange,
}: {
  id: string;
  values: Record<string, unknown>;
  unit?: string;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">涨幅≥{unit || "%"}</span>
      <Input
        type="number"
        step="0.1"
        min="0"
        value={values.thresholdPct !== undefined ? String(values.thresholdPct) : "5"}
        onChange={(e) => onChange("thresholdPct", parseFloat(e.target.value) || 5)}
        className="h-7 text-xs w-20"
      />
    </div>
  );
}

const INDUSTRY_LIST = [
  "IT设备", "专用机械", "中成药", "乳制品", "互联网", "仓储物流", "供气供热", "保险",
  "元器件", "全国地产", "公共交通", "公路", "其他商业", "其他建材", "农业综合", "农用机械",
  "农药化肥", "出版业", "化学制药", "化工原料", "化工机械", "化纤", "区域地产", "医疗保健",
  "医药商业", "半导体", "商品城", "商贸代理", "啤酒", "园区开发", "塑料", "多元金融",
  "家居用品", "家用电器", "小金属", "工程机械", "广告包装", "建筑工程", "影视音像", "房产服务",
  "批发业", "摩托车", "文教休闲", "新型电力", "旅游景点", "旅游服务", "日用化工", "普钢",
  "服饰", "机场", "机床制造", "机械基件", "林业", "染料涂料", "橡胶", "水力发电",
  "水务", "水泥", "水运", "汽车整车", "汽车服务", "汽车配件", "渔业", "港口",
  "火力发电", "焦炭加工", "煤炭开采", "特种钢", "环境保护", "玻璃", "生物制药", "电信运营",
  "电器仪表", "电器连锁", "电气设备", "白酒", "百货", "石油加工", "石油开采", "石油贸易",
  "矿物制品", "种植业", "空运", "红黄酒", "纺织", "纺织机械", "综合类", "航空",
  "船舶", "装修装饰", "证券", "超市连锁", "路桥", "软件服务", "软饮料", "轻工机械",
  "运输设备", "通信设备", "造纸", "酒店餐饮", "钢加工", "铁路", "铅锌", "铜",
  "铝", "银行", "陶瓷", "食品", "饲料", "黄金"
];

function IndustriesInput({
  id,
  values,
  onChange,
}: {
  id: string;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const selected: string[] = (values.industries as string[]) || [];
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return INDUSTRY_LIST;
    const q = search.toLowerCase();
    return INDUSTRY_LIST.filter((ind) => ind.toLowerCase().includes(q));
  }, [search]);

  const toggle = useCallback(
    (industry: string) => {
      const next = selected.includes(industry)
        ? selected.filter((s) => s !== industry)
        : [...selected, industry];
      onChange("industries", next);
    },
    [selected, onChange]
  );

  return (
    <div className="space-y-1.5">
      <Input
        placeholder="搜索行业..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-7 text-xs"
      />
      <div className="max-h-40 overflow-y-auto border rounded p-1.5 grid grid-cols-3 gap-0.5">
        {filtered.map((ind) => (
          <label
            key={ind}
            className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-accent cursor-pointer text-xs"
          >
            <Checkbox
              id={`${id}-${ind}`}
              checked={selected.includes(ind)}
              onCheckedChange={() => toggle(ind)}
              className="h-3.5 w-3.5"
            />
            <span className="truncate">{ind}</span>
          </label>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-3 text-xs text-muted-foreground py-2 text-center">无匹配行业</div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-muted-foreground">已选 {selected.length}:</span>
          {selected.map((ind) => (
            <Badge key={ind} variant="secondary" className="text-xs py-0 px-1.5 gap-0.5">
              {ind}
              <X className="h-3 w-3 cursor-pointer" onClick={() => toggle(ind)} />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== 结果表格 ====================

function ResultsTable({
  results,
  columns,
}: {
  results: StockScreeningResult[];
  columns: { key: string; label: string; fixed?: boolean }[];
}) {
  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Filter className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            选择筛选条件后点击「开始筛选」
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            所有条件为 AND 逻辑，股票需同时满足
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-full">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-muted">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap border-b border-border ${
                  col.fixed ? "sticky left-0 bg-muted z-20" : ""
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((row, i) => (
            <tr
              key={`${row.代码}-${i}`}
              className="border-b border-border hover:bg-muted/50 transition-colors"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-1.5 whitespace-nowrap ${
                    col.fixed ? "sticky left-0 bg-card z-10 font-mono text-xs" : ""
                  }`}
                >
                  <CellValue value={(row as unknown as Record<string, unknown>)[col.key]} col={col.key} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CellValue({ value, col }: { value: unknown; col: string }) {
  if (value === undefined || value === null) return <span className="text-muted-foreground/50">-</span>;

  if (typeof value === "number") {
    if (col === "代码") return <span className="font-mono text-xs">{value}</span>;
    // 百分比值
    if (
      [
        "涨跌幅", "换手率", "振幅", "毛利率", "净利率",
        "资产负债率", "营收增长率", "净利润增长率", "ROE",
        "股息率", "WR", "BIAS6", "筹码集中度",
        "K线位置百分比", "MACD百分位", "CR百分位",
      ].includes(col)
    ) {
      const v = value;
      const color = v > 0 ? "text-emerald-600" : v < 0 ? "text-red-600" : "";
      return <span className={`font-mono text-xs ${color}`}>{v.toFixed(2)}%</span>;
    }
    // 市值类
    if (["总市值", "流通市值"].includes(col)) {
      const v = value as number;
      if (v >= 10000) return <span className="font-mono text-xs">{(v / 10000).toFixed(2)}万亿</span>;
      return <span className="font-mono text-xs">{v.toFixed(0)}亿</span>;
    }
    // 价格类
    if (col === "最新价" || col === "每股分红" || col === "EPS") {
      return <span className="font-mono text-xs">{value.toFixed(2)}</span>;
    }
    // 默认数字
    return <span className="font-mono text-xs">{typeof value === "number" ? value.toFixed(2) : String(value)}</span>;
  }

  return <span className="text-xs">{String(value)}</span>;
}
