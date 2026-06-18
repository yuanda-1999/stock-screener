-- 数据库层筛选函数：20 个指标 DB 层过滤，缩减候选集 80-95%
-- 使用动态 SQL：只 JOIN 激活的筛选条件所需的表，避免无用的 LATERAL JOIN 导致超时
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
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $$
DECLARE
  sql_query text;
  need_bars boolean;
  need_daily_basic boolean;
  need_finance boolean;
  need_dividend boolean;
  need_div_yield boolean;
  need_chip boolean;
  need_kdj boolean;
  need_kdj_prev boolean;
  need_rsi boolean;
  need_boll boolean;
  need_wr boolean;
  need_bias boolean;
  need_macd boolean;
  where_clauses text[];
BEGIN
  -- 判断哪些 JOIN 需要执行
  need_bars := filters->'price' IS NOT NULL OR filters->'changeRate' IS NOT NULL
            OR filters->'amplitude' IS NOT NULL OR filters->'gainers' IS NOT NULL
            OR filters->'boll' IS NOT NULL;
  need_daily_basic := filters->'turnover' IS NOT NULL OR filters->'volumeRatio' IS NOT NULL
                   OR filters->'totalMv' IS NOT NULL OR filters->'circMv' IS NOT NULL
                   OR filters->'pe' IS NOT NULL OR filters->'pb' IS NOT NULL;
  need_finance := filters->'roe' IS NOT NULL OR filters->'eps' IS NOT NULL
               OR filters->'grossMargin' IS NOT NULL OR filters->'netMargin' IS NOT NULL
               OR filters->'debtRatio' IS NOT NULL OR filters->'revenueGrowth' IS NOT NULL
               OR filters->'profitGrowth' IS NOT NULL;
  need_dividend := filters->'dividend' IS NOT NULL;
  need_div_yield := filters->'dividendYield' IS NOT NULL;
  need_chip := filters->'chip' IS NOT NULL;
  need_kdj_prev := filters->'kdj' IS NOT NULL AND filters->'kdj'->>'method' = '金叉';
  need_kdj := filters->'kdj' IS NOT NULL;
  need_rsi := filters->'rsi' IS NOT NULL;
  need_boll := filters->'boll' IS NOT NULL;
  need_wr := filters->'wr' IS NOT NULL;
  need_bias := filters->'bias' IS NOT NULL;
  need_macd := filters->'macd' IS NOT NULL;

  -- 基础 SELECT（始终需要 stock_basic_cache）
  sql_query := 'SELECT sb.code, sb.name, ';

  -- SELECT 列：根据需要的 JOIN 动态组装
  IF need_bars THEN
    sql_query := sql_query || 'bars.close::numeric, bars.change_pct::numeric, ';
  ELSE
    sql_query := sql_query || 'NULL::numeric AS close, NULL::numeric AS change_pct, ';
  END IF;

  IF need_daily_basic THEN
    sql_query := sql_query || 'db.turnover_rate::numeric AS turnover, db.volume_ratio::numeric AS vol_ratio, db.total_mv::numeric, db.circ_mv::numeric, ';
  ELSE
    sql_query := sql_query || 'NULL::numeric AS turnover, NULL::numeric AS vol_ratio, NULL::numeric AS total_mv, NULL::numeric AS circ_mv, ';
  END IF;

  IF need_bars THEN
    sql_query := sql_query || 'bars.amplitude::numeric, ';
  ELSE
    sql_query := sql_query || 'NULL::numeric AS amplitude, ';
  END IF;

  IF need_daily_basic THEN
    sql_query := sql_query || 'COALESCE(db.pe_ttm, db.pe)::numeric AS pe, db.pb::numeric, ';
  ELSE
    sql_query := sql_query || 'NULL::numeric AS pe, NULL::numeric AS pb, ';
  END IF;

  IF need_finance THEN
    sql_query := sql_query || 'fin.roe::numeric, fin.eps::numeric, fin.grossprofit_margin::numeric AS gross_margin, fin.netprofit_margin::numeric AS net_margin, fin.debt_to_assets::numeric AS debt_ratio, fin.revenue_growth::numeric, fin.profit_growth::numeric ';
  ELSE
    sql_query := sql_query || 'NULL::numeric AS roe, NULL::numeric AS eps, NULL::numeric AS gross_margin, NULL::numeric AS net_margin, NULL::numeric AS debt_ratio, NULL::numeric AS revenue_growth, NULL::numeric AS profit_growth ';
  END IF;

  -- FROM 子句
  sql_query := sql_query || 'FROM stock_basic_cache sb ';

  -- LATERAL JOIN：仅添加需要的
  IF need_bars THEN
    sql_query := sql_query || 'LEFT JOIN LATERAL ('
      || 'SELECT d0.close, d0.high, d0.low, d1.close AS prev_close, '
      || 'CASE WHEN d1.close > 0 THEN ((d0.close - d1.close) / d1.close) * 100 END AS change_pct, '
      || 'CASE WHEN d1.close > 0 THEN ((d0.high - d0.low) / d1.close) * 100 END AS amplitude '
      || 'FROM (SELECT close, high, low, trade_date FROM daily_bar_cache WHERE code = sb.code ORDER BY trade_date DESC LIMIT 1) d0 '
      || 'LEFT JOIN LATERAL (SELECT close FROM daily_bar_cache WHERE code = sb.code AND trade_date < d0.trade_date ORDER BY trade_date DESC LIMIT 1) d1 ON true'
      || ') bars ON true ';
  END IF;

  IF need_daily_basic THEN
    sql_query := sql_query || 'LEFT JOIN LATERAL ('
      || 'SELECT pe_ttm, pe, pb, turnover_rate, volume_ratio, total_mv, circ_mv '
      || 'FROM daily_basic_cache WHERE code = sb.code ORDER BY trade_date DESC LIMIT 1'
      || ') db ON true ';
  END IF;

  IF need_finance THEN
    sql_query := sql_query || 'LEFT JOIN LATERAL ('
      || 'SELECT roe, eps, grossprofit_margin, netprofit_margin, debt_to_assets, revenue_growth, profit_growth '
      || 'FROM finance_cache WHERE code = sb.code ORDER BY end_date DESC LIMIT 1'
      || ') fin ON true ';
  END IF;

  IF need_dividend THEN
    sql_query := sql_query || 'LEFT JOIN LATERAL ('
      || 'SELECT 1 AS has_dividend FROM dividend_cache '
      || 'WHERE code = sb.code '
      || 'AND end_date LIKE ' || quote_literal((filters->'dividend'->>'year') || '%')
      || ' AND cash_div >= ' || (filters->'dividend'->>'minCashDiv')::numeric::text
      || ' LIMIT 1'
      || ') div ON true ';
  END IF;

  IF need_div_yield OR need_dividend THEN
    sql_query := sql_query || 'LEFT JOIN LATERAL ('
      || 'SELECT cash_div FROM dividend_cache WHERE code = sb.code ORDER BY end_date DESC LIMIT 1'
      || ') latest_div ON true ';
  END IF;

  IF need_chip THEN
    sql_query := sql_query || 'LEFT JOIN LATERAL ('
      || 'SELECT ((cost_95pct - cost_5pct) / NULLIF(cost_95pct + cost_5pct, 0)) * 100 AS concentration '
      || 'FROM cyq_perf_cache WHERE code = sb.code ORDER BY trade_date DESC LIMIT 1'
      || ') chip ON true ';
  END IF;

  IF need_kdj OR need_kdj_prev THEN
    sql_query := sql_query || 'LEFT JOIN LATERAL ('
      || 'SELECT k, d, j FROM kdj_cache WHERE code = sb.code ORDER BY trade_date DESC LIMIT 1'
      || ') kdj ON true ';
  END IF;

  IF need_kdj_prev THEN
    sql_query := sql_query || 'LEFT JOIN LATERAL ('
      || 'SELECT k AS prev_k, d AS prev_d FROM kdj_cache WHERE code = sb.code ORDER BY trade_date DESC LIMIT 1 OFFSET 1'
      || ') kdj_prev ON true ';
  END IF;

  IF need_rsi THEN
    sql_query := sql_query || 'LEFT JOIN LATERAL ('
      || 'SELECT rsi14 FROM rsi_cache WHERE code = sb.code ORDER BY trade_date DESC LIMIT 1'
      || ') rsi ON true ';
  END IF;

  IF need_boll THEN
    sql_query := sql_query || 'LEFT JOIN LATERAL ('
      || 'SELECT upper, mid, lower FROM boll_cache WHERE code = sb.code ORDER BY trade_date DESC LIMIT 1'
      || ') boll ON true ';
  END IF;

  IF need_wr THEN
    sql_query := sql_query || 'LEFT JOIN LATERAL ('
      || 'SELECT wr10 FROM wr_cache WHERE code = sb.code ORDER BY trade_date DESC LIMIT 1'
      || ') wr ON true ';
  END IF;

  IF need_bias THEN
    sql_query := sql_query || 'LEFT JOIN LATERAL ('
      || 'SELECT bias6 FROM bias_cache WHERE code = sb.code ORDER BY trade_date DESC LIMIT 1'
      || ') bias ON true ';
  END IF;

  IF need_macd THEN
    sql_query := sql_query || 'LEFT JOIN LATERAL ('
      || 'SELECT macd FROM macd_factor_cache WHERE code = sb.code ORDER BY trade_date DESC LIMIT 1'
      || ') macd_cur ON true ';
  END IF;

  -- WHERE 子句
  where_clauses := ARRAY[]::text[];

  -- 价格
  IF filters->'price' IS NOT NULL THEN
    where_clauses := array_append(where_clauses, 'bars.close IS NOT NULL');
    IF filters->'price'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'bars.close >= ' || (filters->'price'->>'min')::numeric::text);
    END IF;
    IF filters->'price'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'bars.close <= ' || (filters->'price'->>'max')::numeric::text);
    END IF;
  END IF;

  -- 涨跌幅
  IF filters->'changeRate' IS NOT NULL THEN
    where_clauses := array_append(where_clauses, 'bars.change_pct IS NOT NULL');
    IF filters->'changeRate'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'bars.change_pct >= ' || (filters->'changeRate'->>'min')::numeric::text);
    END IF;
    IF filters->'changeRate'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'bars.change_pct <= ' || (filters->'changeRate'->>'max')::numeric::text);
    END IF;
  END IF;

  -- 换手率
  IF filters->'turnover' IS NOT NULL THEN
    IF filters->'turnover'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'db.turnover_rate >= ' || (filters->'turnover'->>'min')::numeric::text);
    END IF;
    IF filters->'turnover'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'db.turnover_rate <= ' || (filters->'turnover'->>'max')::numeric::text);
    END IF;
  END IF;

  -- 量比
  IF filters->'volumeRatio' IS NOT NULL THEN
    IF filters->'volumeRatio'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'db.volume_ratio >= ' || (filters->'volumeRatio'->>'min')::numeric::text);
    END IF;
    IF filters->'volumeRatio'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'db.volume_ratio <= ' || (filters->'volumeRatio'->>'max')::numeric::text);
    END IF;
  END IF;

  -- 总市值
  IF filters->'totalMv' IS NOT NULL THEN
    IF filters->'totalMv'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'db.total_mv >= ' || (filters->'totalMv'->>'min')::numeric::text);
    END IF;
    IF filters->'totalMv'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'db.total_mv <= ' || (filters->'totalMv'->>'max')::numeric::text);
    END IF;
  END IF;

  -- 流通市值
  IF filters->'circMv' IS NOT NULL THEN
    IF filters->'circMv'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'db.circ_mv >= ' || (filters->'circMv'->>'min')::numeric::text);
    END IF;
    IF filters->'circMv'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'db.circ_mv <= ' || (filters->'circMv'->>'max')::numeric::text);
    END IF;
  END IF;

  -- 振幅
  IF filters->'amplitude' IS NOT NULL THEN
    where_clauses := array_append(where_clauses, 'bars.amplitude IS NOT NULL');
    IF filters->'amplitude'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'bars.amplitude >= ' || (filters->'amplitude'->>'min')::numeric::text);
    END IF;
    IF filters->'amplitude'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'bars.amplitude <= ' || (filters->'amplitude'->>'max')::numeric::text);
    END IF;
  END IF;

  -- PE
  IF filters->'pe' IS NOT NULL THEN
    where_clauses := array_append(where_clauses, 'COALESCE(db.pe_ttm, db.pe) > 0');
    IF filters->'pe'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'COALESCE(db.pe_ttm, db.pe) >= ' || (filters->'pe'->>'min')::numeric::text);
    END IF;
    IF filters->'pe'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'COALESCE(db.pe_ttm, db.pe) <= ' || (filters->'pe'->>'max')::numeric::text);
    END IF;
  END IF;

  -- PB
  IF filters->'pb' IS NOT NULL THEN
    where_clauses := array_append(where_clauses, 'db.pb > 0');
    IF filters->'pb'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'db.pb >= ' || (filters->'pb'->>'min')::numeric::text);
    END IF;
    IF filters->'pb'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'db.pb <= ' || (filters->'pb'->>'max')::numeric::text);
    END IF;
  END IF;

  -- ROE
  IF filters->'roe' IS NOT NULL THEN
    IF filters->'roe'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'fin.roe >= ' || (filters->'roe'->>'min')::numeric::text);
    END IF;
    IF filters->'roe'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'fin.roe <= ' || (filters->'roe'->>'max')::numeric::text);
    END IF;
  END IF;

  -- EPS
  IF filters->'eps' IS NOT NULL THEN
    IF filters->'eps'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'fin.eps >= ' || (filters->'eps'->>'min')::numeric::text);
    END IF;
    IF filters->'eps'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'fin.eps <= ' || (filters->'eps'->>'max')::numeric::text);
    END IF;
  END IF;

  -- 毛利率
  IF filters->'grossMargin' IS NOT NULL THEN
    IF filters->'grossMargin'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'fin.grossprofit_margin >= ' || (filters->'grossMargin'->>'min')::numeric::text);
    END IF;
    IF filters->'grossMargin'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'fin.grossprofit_margin <= ' || (filters->'grossMargin'->>'max')::numeric::text);
    END IF;
  END IF;

  -- 净利率
  IF filters->'netMargin' IS NOT NULL THEN
    IF filters->'netMargin'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'fin.netprofit_margin >= ' || (filters->'netMargin'->>'min')::numeric::text);
    END IF;
    IF filters->'netMargin'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'fin.netprofit_margin <= ' || (filters->'netMargin'->>'max')::numeric::text);
    END IF;
  END IF;

  -- 资产负债率
  IF filters->'debtRatio' IS NOT NULL THEN
    IF filters->'debtRatio'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'fin.debt_to_assets >= ' || (filters->'debtRatio'->>'min')::numeric::text);
    END IF;
    IF filters->'debtRatio'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'fin.debt_to_assets <= ' || (filters->'debtRatio'->>'max')::numeric::text);
    END IF;
  END IF;

  -- 营收增长率
  IF filters->'revenueGrowth' IS NOT NULL THEN
    IF filters->'revenueGrowth'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'fin.revenue_growth >= ' || (filters->'revenueGrowth'->>'min')::numeric::text);
    END IF;
    IF filters->'revenueGrowth'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'fin.revenue_growth <= ' || (filters->'revenueGrowth'->>'max')::numeric::text);
    END IF;
  END IF;

  -- 净利润增长率
  IF filters->'profitGrowth' IS NOT NULL THEN
    IF filters->'profitGrowth'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'fin.profit_growth >= ' || (filters->'profitGrowth'->>'min')::numeric::text);
    END IF;
    IF filters->'profitGrowth'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'fin.profit_growth <= ' || (filters->'profitGrowth'->>'max')::numeric::text);
    END IF;
  END IF;

  -- 涨幅预过滤
  IF filters->'gainers' IS NOT NULL THEN
    where_clauses := array_append(where_clauses, 'bars.change_pct IS NOT NULL');
    where_clauses := array_append(where_clauses, 'bars.change_pct >= ' || (filters->'gainers'->>'thresholdPct')::numeric::text);
  END IF;

  -- 分红
  IF need_dividend THEN
    where_clauses := array_append(where_clauses, 'div.has_dividend IS NOT NULL');
  END IF;

  -- 股息率
  IF need_div_yield THEN
    where_clauses := array_append(where_clauses, 'latest_div.cash_div > 0 AND bars.close > 0');
    IF filters->'dividendYield'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, '(latest_div.cash_div / bars.close) * 100 >= ' || (filters->'dividendYield'->>'min')::numeric::text);
    END IF;
    IF filters->'dividendYield'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, '(latest_div.cash_div / bars.close) * 100 <= ' || (filters->'dividendYield'->>'max')::numeric::text);
    END IF;
  END IF;

  -- 筹码集中度
  IF need_chip THEN
    where_clauses := array_append(where_clauses, 'chip.concentration IS NOT NULL');
    where_clauses := array_append(where_clauses, 'chip.concentration >= ' || (filters->'chip'->>'thresholdPct')::numeric::text);
  END IF;

  -- KDJ
  IF need_kdj THEN
    IF filters->'kdj'->>'method' = '超卖' THEN
      where_clauses := array_append(where_clauses, 'kdj.j IS NOT NULL');
      IF filters->'kdj'->>'jMax' IS NOT NULL THEN
        where_clauses := array_append(where_clauses, 'kdj.j <= ' || (filters->'kdj'->>'jMax')::numeric::text);
      END IF;
    ELSIF filters->'kdj'->>'method' = '低位' THEN
      where_clauses := array_append(where_clauses, 'kdj.k IS NOT NULL AND kdj.d IS NOT NULL');
      IF filters->'kdj'->>'kMax' IS NOT NULL THEN
        where_clauses := array_append(where_clauses, 'kdj.k <= ' || (filters->'kdj'->>'kMax')::numeric::text);
      END IF;
      IF filters->'kdj'->>'dMax' IS NOT NULL THEN
        where_clauses := array_append(where_clauses, 'kdj.d <= ' || (filters->'kdj'->>'dMax')::numeric::text);
      END IF;
    ELSIF filters->'kdj'->>'method' = '金叉' THEN
      where_clauses := array_append(where_clauses, 'kdj_prev.prev_k IS NOT NULL AND kdj_prev.prev_d IS NOT NULL'
        || ' AND kdj.k IS NOT NULL AND kdj.d IS NOT NULL'
        || ' AND kdj_prev.prev_k < kdj_prev.prev_d AND kdj.k > kdj.d');
    END IF;
  END IF;

  -- RSI
  IF need_rsi THEN
    where_clauses := array_append(where_clauses, 'rsi.rsi14 IS NOT NULL');
    where_clauses := array_append(where_clauses, 'rsi.rsi14 <= ' || (filters->'rsi'->>'max')::numeric::text);
  END IF;

  -- BOLL
  IF need_boll THEN
    IF filters->'boll'->>'method' = '下轨附近' THEN
      where_clauses := array_append(where_clauses, 'boll.lower IS NOT NULL AND boll.lower > 0 AND bars.close IS NOT NULL'
        || ' AND ((bars.close - boll.lower) / boll.lower) * 100 <= 5');
    ELSIF filters->'boll'->>'method' = '突破中轨' THEN
      where_clauses := array_append(where_clauses, 'boll.mid IS NOT NULL AND bars.close IS NOT NULL AND bars.prev_close IS NOT NULL'
        || ' AND bars.prev_close < boll.mid AND bars.close > boll.mid');
    END IF;
  END IF;

  -- WR
  IF need_wr THEN
    where_clauses := array_append(where_clauses, 'wr.wr10 IS NOT NULL');
    IF filters->'wr'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'wr.wr10 >= ' || (filters->'wr'->>'min')::numeric::text);
    END IF;
    IF filters->'wr'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'wr.wr10 <= ' || (filters->'wr'->>'max')::numeric::text);
    END IF;
  END IF;

  -- BIAS
  IF need_bias THEN
    where_clauses := array_append(where_clauses, 'bias.bias6 IS NOT NULL');
    IF filters->'bias'->>'min' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'bias.bias6 >= ' || (filters->'bias'->>'min')::numeric::text);
    END IF;
    IF filters->'bias'->>'max' IS NOT NULL THEN
      where_clauses := array_append(where_clauses, 'bias.bias6 <= ' || (filters->'bias'->>'max')::numeric::text);
    END IF;
  END IF;

  -- MACD（预过滤）
  IF need_macd THEN
    where_clauses := array_append(where_clauses, 'macd_cur.macd IS NOT NULL');
  END IF;

  -- 组装 WHERE 子句
  IF array_length(where_clauses, 1) > 0 THEN
    sql_query := sql_query || ' WHERE ' || array_to_string(where_clauses, ' AND ');
  END IF;

  -- 限制结果数
  sql_query := sql_query || ' LIMIT 1000';

  -- 调试日志（可在 Supabase 日志中查看）
  -- RAISE NOTICE 'screen_stocks_basic SQL: %', sql_query;

  RETURN QUERY EXECUTE sql_query;
END;
$$;
