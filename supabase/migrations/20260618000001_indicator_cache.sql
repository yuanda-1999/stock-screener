-- 技术指标缓存表 — 为完全 DB 层筛选做准备
-- 当前版本由 JS 层处理技术指标，这些表预留后续使用
-- 数据可通过 PostgreSQL 窗口函数或脚本批量计算填充

-- KDJ (N=9, M1=3, M2=3)
CREATE TABLE IF NOT EXISTS kdj_cache (
  code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  k REAL DEFAULT 0,
  d REAL DEFAULT 0,
  j REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (code, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_kdj_code_date ON kdj_cache(code, trade_date);

-- RSI (period=14)
CREATE TABLE IF NOT EXISTS rsi_cache (
  code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  rsi14 REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (code, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_rsi_code_date ON rsi_cache(code, trade_date);

-- BOLL (period=20, std=2)
CREATE TABLE IF NOT EXISTS boll_cache (
  code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  upper REAL DEFAULT 0,
  mid REAL DEFAULT 0,
  lower REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (code, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_boll_code_date ON boll_cache(code, trade_date);

-- WR 威廉指标 (period=10)
CREATE TABLE IF NOT EXISTS wr_cache (
  code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  wr10 REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (code, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_wr_code_date ON wr_cache(code, trade_date);

-- BIAS 乖离率 (period=6)
CREATE TABLE IF NOT EXISTS bias_cache (
  code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  bias6 REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (code, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_bias_code_date ON bias_cache(code, trade_date);

-- 批量计算并填充技术指标的函数（后续版本使用）
-- 当这些表有数据后，可修改 screen_stocks_basic 函数
-- 添加 JOIN 这些表的条件，实现全部筛选在 DB 层完成
