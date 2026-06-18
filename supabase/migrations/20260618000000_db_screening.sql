-- 数据库层筛选函数：20 个指标 DB 层过滤，缩减候选集 80-95%
-- MACD/KDJ/RSI/BOLL/WR/BIAS 通过预计算缓存表实现 DB 筛选
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

  -- 最新日线（2条：今日 + 昨日，用于价格/涨跌幅/振幅/股息率）
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

  -- 分红（指定年份 + 最低每股分红）
  LEFT JOIN LATERAL (
    SELECT 1 AS has_dividend
    FROM dividend_cache
    WHERE code = sb.code
      AND end_date LIKE (filters->'dividend'->>'year')::text || '%'
      AND cash_div >= (filters->'dividend'->>'minCashDiv')::numeric
    LIMIT 1
  ) div ON true

  -- 最近一次分红（用于股息率）
  LEFT JOIN LATERAL (
    SELECT cash_div
    FROM dividend_cache
    WHERE code = sb.code
    ORDER BY end_date DESC
    LIMIT 1
  ) latest_div ON true

  -- 最新筹码分布（用于筹码集中度）
  LEFT JOIN LATERAL (
    SELECT ((cost_95pct - cost_5pct) / NULLIF((cost_95pct + cost_5pct) / 2, 0)) * 100 AS concentration
    FROM cyq_perf_cache
    WHERE code = sb.code
    ORDER BY trade_date DESC
    LIMIT 1
  ) chip ON true

  -- 最新 KDJ
  LEFT JOIN LATERAL (
    SELECT k, d, j FROM kdj_cache
    WHERE code = sb.code
    ORDER BY trade_date DESC
    LIMIT 1
  ) kdj ON true

  -- 前一日 KDJ（金叉判断用）
  LEFT JOIN LATERAL (
    SELECT k AS prev_k, d AS prev_d FROM kdj_cache
    WHERE code = sb.code
    ORDER BY trade_date DESC
    LIMIT 1 OFFSET 1
  ) kdj_prev ON true

  -- 最新 RSI
  LEFT JOIN LATERAL (
    SELECT rsi14 FROM rsi_cache
    WHERE code = sb.code
    ORDER BY trade_date DESC
    LIMIT 1
  ) rsi ON true

  -- 最新 BOLL
  LEFT JOIN LATERAL (
    SELECT upper, mid, lower FROM boll_cache
    WHERE code = sb.code
    ORDER BY trade_date DESC
    LIMIT 1
  ) boll ON true

  -- 最新 WR
  LEFT JOIN LATERAL (
    SELECT wr10 FROM wr_cache
    WHERE code = sb.code
    ORDER BY trade_date DESC
    LIMIT 1
  ) wr ON true

  -- 最新 BIAS
  LEFT JOIN LATERAL (
    SELECT bias6 FROM bias_cache
    WHERE code = sb.code
    ORDER BY trade_date DESC
    LIMIT 1
  ) bias ON true

  -- 最新 MACD
  LEFT JOIN LATERAL (
    SELECT macd FROM macd_factor_cache
    WHERE code = sb.code
    ORDER BY trade_date DESC
    LIMIT 1
  ) macd_cur ON true

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
    ))
    -- 分红（指定年份 + 最低每股现金分红）
    AND (filters->'dividend' IS NULL OR div.has_dividend IS NOT NULL)
    -- 股息率 = (最近一次现金分红 / 最新收盘价) * 100
    AND (filters->'dividendYield' IS NULL OR (
      latest_div.cash_div > 0 AND bars.close > 0
      AND ((filters->'dividendYield'->>'min')::numeric IS NULL
           OR (latest_div.cash_div / bars.close) * 100 >= (filters->'dividendYield'->>'min')::numeric)
      AND ((filters->'dividendYield'->>'max')::numeric IS NULL
           OR (latest_div.cash_div / bars.close) * 100 <= (filters->'dividendYield'->>'max')::numeric)
    ))
    -- 筹码集中度 = ((cost_95pct - cost_5pct) / avg_cost) * 100，≥ 阈值（保留筹码分散的股票）
    AND (filters->'chip' IS NULL OR (
      chip.concentration IS NOT NULL
      AND chip.concentration >= (filters->'chip'->>'thresholdPct')::numeric
    ))
    -- KDJ
    AND (filters->'kdj' IS NULL OR (
      CASE
        WHEN filters->'kdj'->>'method' = '超卖' THEN
          kdj.j IS NOT NULL
          AND ((filters->'kdj'->>'jMax')::numeric IS NULL OR kdj.j <= (filters->'kdj'->>'jMax')::numeric)
        WHEN filters->'kdj'->>'method' = '低位' THEN
          kdj.k IS NOT NULL AND kdj.d IS NOT NULL
          AND ((filters->'kdj'->>'kMax')::numeric IS NULL OR kdj.k <= (filters->'kdj'->>'kMax')::numeric)
          AND ((filters->'kdj'->>'dMax')::numeric IS NULL OR kdj.d <= (filters->'kdj'->>'dMax')::numeric)
        WHEN filters->'kdj'->>'method' = '金叉' THEN
          kdj_prev.prev_k IS NOT NULL AND kdj_prev.prev_d IS NOT NULL
          AND kdj.k IS NOT NULL AND kdj.d IS NOT NULL
          AND kdj_prev.prev_k < kdj_prev.prev_d AND kdj.k > kdj.d
        ELSE TRUE
      END
    ))
    -- RSI
    AND (filters->'rsi' IS NULL OR (
      rsi.rsi14 IS NOT NULL
      AND rsi.rsi14 <= (filters->'rsi'->>'max')::numeric
    ))
    -- BOLL
    AND (filters->'boll' IS NULL OR (
      CASE
        WHEN filters->'boll'->>'method' = '下轨附近' THEN
          boll.lower IS NOT NULL AND boll.lower > 0 AND bars.close IS NOT NULL
          AND ((bars.close - boll.lower) / boll.lower) * 100 <= 5
        WHEN filters->'boll'->>'method' = '突破中轨' THEN
          boll.mid IS NOT NULL AND bars.close IS NOT NULL AND bars.prev_close IS NOT NULL
          AND bars.prev_close < boll.mid AND bars.close > boll.mid
        ELSE TRUE
      END
    ))
    -- WR
    AND (filters->'wr' IS NULL OR (
      wr.wr10 IS NOT NULL
      AND ((filters->'wr'->>'min')::numeric IS NULL OR wr.wr10 >= (filters->'wr'->>'min')::numeric)
      AND ((filters->'wr'->>'max')::numeric IS NULL OR wr.wr10 <= (filters->'wr'->>'max')::numeric)
    ))
    -- BIAS
    AND (filters->'bias' IS NULL OR (
      bias.bias6 IS NOT NULL
      AND ((filters->'bias'->>'min')::numeric IS NULL OR bias.bias6 >= (filters->'bias'->>'min')::numeric)
      AND ((filters->'bias'->>'max')::numeric IS NULL OR bias.bias6 <= (filters->'bias'->>'max')::numeric)
    ))
    -- MACD（预过滤：确保数据存在，百分位计算仍由 JS 完成）
    AND (filters->'macd' IS NULL OR macd_cur.macd IS NOT NULL);
$$;
