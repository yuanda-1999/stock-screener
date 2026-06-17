-- Tushare 缓存表 — Supabase PostgreSQL 建表语句
-- 与本地 SQLite 结构完全一致，兼容现有数据

-- 股票名单
CREATE TABLE IF NOT EXISTS stock_basic_cache (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 分红
CREATE TABLE IF NOT EXISTS dividend_cache (
  code TEXT NOT NULL,
  end_date TEXT NOT NULL,
  cash_div REAL DEFAULT 0,
  stk_div REAL DEFAULT 0,
  ann_date TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (code, end_date)
);

-- 月线
CREATE TABLE IF NOT EXISTS monthly_bar_cache (
  code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  high REAL DEFAULT 0,
  low REAL DEFAULT 0,
  close REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (code, trade_date)
);

-- 周线
CREATE TABLE IF NOT EXISTS weekly_bar_cache (
  code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  high REAL DEFAULT 0,
  low REAL DEFAULT 0,
  close REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (code, trade_date)
);

-- 日线
CREATE TABLE IF NOT EXISTS daily_bar_cache (
  code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  open REAL DEFAULT 0,
  high REAL DEFAULT 0,
  low REAL DEFAULT 0,
  close REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (code, trade_date)
);

-- MACD 预计算
CREATE TABLE IF NOT EXISTS macd_factor_cache (
  code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  macd REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (code, trade_date)
);

-- 筹码分布
CREATE TABLE IF NOT EXISTS cyq_perf_cache (
  code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  cost_5pct REAL DEFAULT 0,
  cost_95pct REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (code, trade_date)
);

-- 每日基本面（PE/PB/换手/市值）
CREATE TABLE IF NOT EXISTS daily_basic_cache (
  code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  pe REAL DEFAULT 0,
  pe_ttm REAL DEFAULT 0,
  pb REAL DEFAULT 0,
  total_mv REAL DEFAULT 0,
  circ_mv REAL DEFAULT 0,
  turnover_rate REAL DEFAULT 0,
  volume_ratio REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (code, trade_date)
);

-- 财务指标（ROE/EPS/毛利率等）
CREATE TABLE IF NOT EXISTS finance_cache (
  code TEXT NOT NULL,
  end_date TEXT NOT NULL,
  roe REAL DEFAULT 0,
  eps REAL DEFAULT 0,
  bps REAL DEFAULT 0,
  grossprofit_margin REAL DEFAULT 0,
  netprofit_margin REAL DEFAULT 0,
  debt_to_assets REAL DEFAULT 0,
  revenue_growth REAL DEFAULT 0,
  profit_growth REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (code, end_date)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_daily_bar_code_date ON daily_bar_cache(code, trade_date);
CREATE INDEX IF NOT EXISTS idx_weekly_bar_code_date ON weekly_bar_cache(code, trade_date);
CREATE INDEX IF NOT EXISTS idx_monthly_bar_code_date ON monthly_bar_cache(code, trade_date);
CREATE INDEX IF NOT EXISTS idx_dividend_code ON dividend_cache(code);
CREATE INDEX IF NOT EXISTS idx_macd_code_date ON macd_factor_cache(code, trade_date);
CREATE INDEX IF NOT EXISTS idx_cyq_code_date ON cyq_perf_cache(code, trade_date);
