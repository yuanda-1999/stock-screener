// === 缓存数据类型 ===

export interface StockBasic {
  code: string;
  name: string;
  industry?: string;
}

export interface DailyBar {
  code: string;
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MonthlyBar {
  code: string;
  trade_date: string;
  high: number;
  low: number;
  close: number;
}

export interface WeeklyBar extends MonthlyBar {}

export interface DividendRecord {
  code: string;
  end_date: string;
  cash_div: number;
  stk_div: number;
  ann_date: string;
}

export interface MACDFactor {
  code: string;
  trade_date: string;
  macd: number;
}

export interface CyqPerf {
  code: string;
  trade_date: string;
  cost_5pct: number;
  cost_95pct: number;
}

export interface DailyBasic {
  code: string;
  trade_date: string;
  pe: number;
  pe_ttm: number;
  pb: number;
  total_mv: number;
  circ_mv: number;
  turnover_rate: number;
  volume_ratio: number;
}

export interface FinanceIndicator {
  code: string;
  end_date: string;
  roe: number;
  eps: number;
  bps: number;
  grossprofit_margin: number;
  netprofit_margin: number;
  debt_to_assets: number;
  revenue_growth: number;
  profit_growth: number;
}

// === 筛选条件类型 ===

export interface PriceFilter {
  min: number;
  max: number;
}

export interface RangeFilter {
  min?: number;
  max?: number;
}

export interface KlineLowFilter {
  years: number;
  thresholdPct: number;
}

export interface MACDFilter {
  weeks: number;
  thresholdPct: number;
}

export interface CRFilter {
  years: number;
  thresholdPct: number;
}

export interface GainersFilter {
  thresholdPct: number;
}

export interface DividendFilter {
  minCashDiv: number;
  year: string;
}

export interface ChipFilter {
  weeks: number;
  thresholdPct: number;
}

export interface KDJFilter {
  kMax?: number;
  dMax?: number;
  jMax?: number;
  method: "超卖" | "金叉" | "低位";
}

export interface RSIFilter {
  max: number;
}

export interface BOLLFilter {
  method: "下轨附近" | "突破中轨" | "缩口";
}

export interface CombinedScreeningFilters {
  // 版块
  industries?: string[];
  // 行情
  price?: PriceFilter;
  changeRate?: RangeFilter;
  turnover?: RangeFilter;
  volumeRatio?: RangeFilter;
  totalMv?: RangeFilter;
  circMv?: RangeFilter;
  amplitude?: RangeFilter;
  // 基本面
  pe?: RangeFilter;
  pb?: RangeFilter;
  roe?: RangeFilter;
  eps?: RangeFilter;
  grossMargin?: RangeFilter;
  netMargin?: RangeFilter;
  debtRatio?: RangeFilter;
  revenueGrowth?: RangeFilter;
  profitGrowth?: RangeFilter;
  // 技术
  macd?: MACDFilter;
  kdj?: KDJFilter;
  rsi?: RSIFilter;
  boll?: BOLLFilter;
  wr?: RangeFilter;
  bias?: RangeFilter;
  // 分红
  dividend?: DividendFilter;
  dividendYield?: RangeFilter;
  // 筹码
  chip?: ChipFilter;
  // 预过滤
  gainers?: GainersFilter;
}

// === SSE 事件类型 ===

export interface SSEProgress {
  type: "progress";
  done: number;
  total: number;
}

export interface SSEResult {
  type: "result";
  stock: StockScreeningResult;
}

export interface SSEDone {
  type: "done";
}

export interface SSEError {
  type: "error";
  error: string;
}

export type SSEEvent = SSEProgress | SSEResult | SSEDone | SSEError;

// === 筛选结果 ===

export interface StockScreeningResult {
  代码: string;
  名称: string;
  最新价?: number;
  // 行情
  涨跌幅?: number;
  换手率?: number;
  量比?: number;
  总市值?: number;
  流通市值?: number;
  振幅?: number;
  // 基本面
  PE?: number;
  PB?: number;
  ROE?: number;
  EPS?: number;
  毛利率?: number;
  净利率?: number;
  资产负债率?: number;
  营收增长率?: number;
  净利润增长率?: number;
  // 技术
  MACD?: number;
  K?: number;
  D?: number;
  J?: number;
  RSI?: number;
  BOLL上轨?: number;
  BOLL中轨?: number;
  BOLL下轨?: number;
  WR?: number;
  BIAS6?: number;
  // 分红
  每股分红?: number;
  送股比例?: number;
  股息率?: number;
  公告日期?: string;
  // 筹码
  筹码集中度?: number;
  // K线低位
  K线最高价?: number;
  K线最低价?: number;
  K线位置百分比?: number;
  // MACD低位
  MACD最低?: number;
  MACD最高?: number;
  MACD百分位?: number;
  // CR
  CR值?: number;
  CR最低?: number;
  CR最高?: number;
  CR百分位?: number;
}
