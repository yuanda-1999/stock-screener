-- 数据库层筛选函数：对简单指标做 SQL 过滤，缩减候选集
-- 技术指标（MACD/KDJ/RSI/BOLL/WR/BIAS/筹码/分红）仍由 JS 层处理
-- 用法: SELECT * FROM screen_stocks_basic('{"pe":{"min":10,"max":30}}'::jsonb);

CREATE OR REPLACE FUNCTION screen_stocks_basic(filters jsonb)
RETURNS TABLE(
  code text,
  name text,
  close numeric,
  change_pct numeric,
  turnover numeric,
  vol_ratio numeric,
  total_mv numeric,
  circ_mv numeric,
  amplitude numeric,
  pe numeric,
  pb numeric,
  roe numeric,
  eps numeric,
  gross_margin numeric,
  net_margin numeric,
  debt_ratio numeric,
  revenue_growth numeric,
  profit_growth numeric
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT sb.code, sb.name,
    bars.close, bars.change_pct,
    db.turnover_rate, db.volume_ratio, db.total_mv, db.circ_mv, bars.amplitude,
    COALESCE(db.pe_ttm, db.pe) AS pe, db.pb,
    fin.roe, fin.eps,
    fin.grossprofit_margin, fin.netprofit_margin,
    fin.debt_to_assets, fin.revenue_growth, fin.profit_growth
  FROM stock_basic_cache sb

  -- 最新日线（2条：今日 + 昨日，用于价格/涨跌幅/振幅）
  LEFT JOIN LATERAL (
    SELECT d0.close, d0.high, d0.low, d1.close AS prev_close,
      CASE WHEN d1.close > 0 THEN ((d0.close - d1.close) / d1.close) * 100 END AS change_pct,
      CASE WHEN d1.close > 0 THEN ((d0.high - d0.low) / d1.close) * 100 END AS amplitude
    FROM (
      SELECT close, high, low, trade_date
      FROM daily_bar_cache
      WHERE code = sb.code
      ORDER BY trade_date DESC
      LIMIT 1
    ) d0
    LEFT JOIN LATERAL (
      SELECT close FROM daily_bar_cache
      WHERE code = sb.code AND trade_date < d0.trade_date
      ORDER BY trade_date DESC
      LIMIT 1
    ) d1 ON true
  ) bars ON true

  -- 最新每日基本面
  LEFT JOIN LATERAL (
    SELECT pe_ttm, pe, pb, turnover_rate, volume_ratio, total_mv, circ_mv
    FROM daily_basic_cache
    WHERE code = sb.code
    ORDER BY trade_date DESC
    LIMIT 1
  ) db ON true

  -- 最新财务指标
  LEFT JOIN LATERAL (
    SELECT roe, eps, grossprofit_margin, netprofit_margin,
           debt_to_assets, revenue_growth, profit_growth
    FROM finance_cache
    WHERE code = sb.code
    ORDER BY end_date DESC
    LIMIT 1
  ) fin ON true

  WHERE
    -- 价格
    (filters->'price' IS NULL OR (
      ((filters->'price'->>'min')::numeric IS NULL OR bars.close >= (filters->'price'->>'min')::numeric)
      AND ((filters->'price'->>'max')::numeric IS NULL OR bars.close <= (filters->'price'->>'max')::numeric)
      AND bars.close IS NOT NULL
    ))
    -- 涨跌幅
    AND (filters->'changeRate' IS NULL OR (
      ((filters->'changeRate'->>'min')::numeric IS NULL OR bars.change_pct >= (filters->'changeRate'->>'min')::numeric)
      AND ((filters->'changeRate'->>'max')::numeric IS NULL OR bars.change_pct <= (filters->'changeRate'->>'max')::numeric)
      AND bars.change_pct IS NOT NULL
    ))
    -- 换手率
    AND (filters->'turnover' IS NULL OR (
      ((filters->'turnover'->>'min')::numeric IS NULL OR db.turnover_rate >= (filters->'turnover'->>'min')::numeric)
      AND ((filters->'turnover'->>'max')::numeric IS NULL OR db.turnover_rate <= (filters->'turnover'->>'max')::numeric)
    ))
    -- 量比
    AND (filters->'volumeRatio' IS NULL OR (
      ((filters->'volumeRatio'->>'min')::numeric IS NULL OR db.volume_ratio >= (filters->'volumeRatio'->>'min')::numeric)
      AND ((filters->'volumeRatio'->>'max')::numeric IS NULL OR db.volume_ratio <= (filters->'volumeRatio'->>'max')::numeric)
    ))
    -- 总市值（万元）
    AND (filters->'totalMv' IS NULL OR (
      ((filters->'totalMv'->>'min')::numeric IS NULL OR db.total_mv >= (filters->'totalMv'->>'min')::numeric)
      AND ((filters->'totalMv'->>'max')::numeric IS NULL OR db.total_mv <= (filters->'totalMv'->>'max')::numeric)
    ))
    -- 流通市值（万元）
    AND (filters->'circMv' IS NULL OR (
      ((filters->'circMv'->>'min')::numeric IS NULL OR db.circ_mv >= (filters->'circMv'->>'min')::numeric)
      AND ((filters->'circMv'->>'max')::numeric IS NULL OR db.circ_mv <= (filters->'circMv'->>'max')::numeric)
    ))
    -- 振幅
    AND (filters->'amplitude' IS NULL OR (
      ((filters->'amplitude'->>'min')::numeric IS NULL OR bars.amplitude >= (filters->'amplitude'->>'min')::numeric)
      AND ((filters->'amplitude'->>'max')::numeric IS NULL OR bars.amplitude <= (filters->'amplitude'->>'max')::numeric)
      AND bars.amplitude IS NOT NULL
    ))
    -- PE（pe_ttm 优先，必须 > 0）
    AND (filters->'pe' IS NULL OR (
      ((filters->'pe'->>'min')::numeric IS NULL OR COALESCE(db.pe_ttm, db.pe) >= (filters->'pe'->>'min')::numeric)
      AND ((filters->'pe'->>'max')::numeric IS NULL OR COALESCE(db.pe_ttm, db.pe) <= (filters->'pe'->>'max')::numeric)
      AND COALESCE(db.pe_ttm, db.pe) > 0
    ))
    -- PB（必须 > 0）
    AND (filters->'pb' IS NULL OR (
      ((filters->'pb'->>'min')::numeric IS NULL OR db.pb >= (filters->'pb'->>'min')::numeric)
      AND ((filters->'pb'->>'max')::numeric IS NULL OR db.pb <= (filters->'pb'->>'max')::numeric)
      AND db.pb > 0
    ))
    -- ROE
    AND (filters->'roe' IS NULL OR (
      ((filters->'roe'->>'min')::numeric IS NULL OR fin.roe >= (filters->'roe'->>'min')::numeric)
      AND ((filters->'roe'->>'max')::numeric IS NULL OR fin.roe <= (filters->'roe'->>'max')::numeric)
    ))
    -- EPS
    AND (filters->'eps' IS NULL OR (
      ((filters->'eps'->>'min')::numeric IS NULL OR fin.eps >= (filters->'eps'->>'min')::numeric)
      AND ((filters->'eps'->>'max')::numeric IS NULL OR fin.eps <= (filters->'eps'->>'max')::numeric)
    ))
    -- 毛利率
    AND (filters->'grossMargin' IS NULL OR (
      ((filters->'grossMargin'->>'min')::numeric IS NULL OR fin.grossprofit_margin >= (filters->'grossMargin'->>'min')::numeric)
      AND ((filters->'grossMargin'->>'max')::numeric IS NULL OR fin.grossprofit_margin <= (filters->'grossMargin'->>'max')::numeric)
    ))
    -- 净利率
    AND (filters->'netMargin' IS NULL OR (
      ((filters->'netMargin'->>'min')::numeric IS NULL OR fin.netprofit_margin >= (filters->'netMargin'->>'min')::numeric)
      AND ((filters->'netMargin'->>'max')::numeric IS NULL OR fin.netprofit_margin <= (filters->'netMargin'->>'max')::numeric)
    ))
    -- 资产负债率
    AND (filters->'debtRatio' IS NULL OR (
      ((filters->'debtRatio'->>'min')::numeric IS NULL OR fin.debt_to_assets >= (filters->'debtRatio'->>'min')::numeric)
      AND ((filters->'debtRatio'->>'max')::numeric IS NULL OR fin.debt_to_assets <= (filters->'debtRatio'->>'max')::numeric)
    ))
    -- 营收增长率
    AND (filters->'revenueGrowth' IS NULL OR (
      ((filters->'revenueGrowth'->>'min')::numeric IS NULL OR fin.revenue_growth >= (filters->'revenueGrowth'->>'min')::numeric)
      AND ((filters->'revenueGrowth'->>'max')::numeric IS NULL OR fin.revenue_growth <= (filters->'revenueGrowth'->>'max')::numeric)
    ))
    -- 净利润增长率
    AND (filters->'profitGrowth' IS NULL OR (
      ((filters->'profitGrowth'->>'min')::numeric IS NULL OR fin.profit_growth >= (filters->'profitGrowth'->>'min')::numeric)
      AND ((filters->'profitGrowth'->>'max')::numeric IS NULL OR fin.profit_growth <= (filters->'profitGrowth'->>'max')::numeric)
    ))
    -- 涨幅预过滤（gainers）
    AND (filters->'gainers' IS NULL OR (
      bars.change_pct IS NOT NULL
      AND bars.change_pct >= (filters->'gainers'->>'thresholdPct')::numeric
    ));
$$;
