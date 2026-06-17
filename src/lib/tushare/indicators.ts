// 技术指标计算 — MACD/KDJ/RSI/BOLL/WR/BIAS
// 从当前项目 tushare.ts 移植 + 扩展

// === EMA ===
export function calcEMA(values: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  if (values.length < period) return new Array(values.length).fill(values[0] || 0);
  let ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = 0; i < period; i++) result.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * k + ema;
    result.push(ema);
  }
  return result;
}

// === SMA (用于 KDJ) ===
export function calcSMA(values: number[], n: number, m: number): number[] {
  const result: number[] = [];
  let prev = values.slice(0, n).reduce((s, v) => s + v, 0) / n;
  result.push(prev);
  for (let i = n; i < values.length; i++) {
    prev = (values[i] * m + prev * (n - m)) / n;
    result.push(prev);
  }
  // 补齐前面的
  while (result.length < values.length) result.unshift(result[0]);
  return result;
}

// === MA ===
export function calcMA(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      let sum = 0;
      for (let j = 0; j <= i; j++) sum += values[j];
      result.push(sum / (i + 1));
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += values[j];
      result.push(sum / period);
    }
  }
  return result;
}

// === STD ===
export function calcSTD(values: number[], period: number, ma?: number[]): number[] {
  const maVals = ma || calcMA(values, period);
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(0);
    } else {
      let sumSq = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sumSq += (values[j] - maVals[i]) ** 2;
      }
      result.push(Math.sqrt(sumSq / period));
    }
  }
  return result;
}

// === MACD ===
// 返回: DIF, DEA, MACD柱
export function calcMACD(
  closes: number[]
): { dif: number[]; dea: number[]; macd: number[] } {
  if (closes.length < 35) {
    const z = new Array(closes.length).fill(0);
    return { dif: z, dea: z, macd: z };
  }
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const dif = ema12.map((v, i) => v - ema26[i]);
  const dea = calcEMA(dif, 9);
  const macd = dif.map((v, i) => 2 * (v - dea[i]));
  return { dif, dea, macd };
}

// === KDJ (9,3,3) ===
export function calcKDJ(
  highs: number[],
  lows: number[],
  closes: number[],
  n = 9,
  m1 = 3,
  m2 = 3
): { k: number[]; d: number[]; j: number[] } {
  const len = closes.length;
  const rsv: number[] = new Array(len).fill(0);
  const k: number[] = new Array(len).fill(50);
  const d: number[] = new Array(len).fill(50);
  const j: number[] = new Array(len).fill(50);

  for (let i = n - 1; i < len; i++) {
    let hh = highs[i];
    let ll = lows[i];
    for (let t = i - n + 1; t <= i; t++) {
      if (highs[t] > hh) hh = highs[t];
      if (lows[t] < ll) ll = lows[t];
    }
    rsv[i] = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;

    if (i === n - 1) {
      k[i] = d[i] = 50; // 初始值
    }
    if (i >= n) {
      k[i] = (rsv[i] + k[i - 1] * (m1 - 1)) / m1;
      d[i] = (k[i] + d[i - 1] * (m2 - 1)) / m2;
    }
    j[i] = 3 * k[i] - 2 * d[i];
  }

  // 补齐前半段
  for (let i = 0; i < n - 1; i++) {
    rsv[i] = rsv[n - 1] || 50;
    k[i] = k[n - 1] || 50;
    d[i] = d[n - 1] || 50;
    j[i] = j[n - 1] || 50;
  }

  return { k, d, j };
}

// === RSI (14) ===
export function calcRSI(closes: number[], period = 14): number[] {
  const result: number[] = new Array(closes.length).fill(50);
  if (closes.length < period + 1) return result;

  const changes = closes.slice(1).map((c, i) => c - closes[i]);

  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    if (avgLoss === 0) result[i + 1] = 100;
    else {
      const rs = avgGain / avgLoss;
      result[i + 1] = 100 - 100 / (1 + rs);
    }
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  // 补齐前半段
  for (let i = 0; i < period; i++) result[i] = result[period + 1];
  return result;
}

// === BOLL (20, 2) ===
export function calcBOLL(
  closes: number[],
  period = 20,
  multiplier = 2
): { upper: number[]; mid: number[]; lower: number[] } {
  const mid = calcMA(closes, period);
  const std = calcSTD(closes, period, mid);
  const upper = mid.map((m, i) => m + multiplier * std[i]);
  const lower = mid.map((m, i) => m - multiplier * std[i]);
  return { upper, mid, lower };
}

// === WR 威廉指标 (10) ===
export function calcWR(highs: number[], lows: number[], closes: number[], period = 10): number[] {
  const result: number[] = new Array(closes.length).fill(50);
  for (let i = period - 1; i < closes.length; i++) {
    let hh = highs[i], ll = lows[i];
    for (let t = i - period + 1; t <= i; t++) {
      if (highs[t] > hh) hh = highs[t];
      if (lows[t] < ll) ll = lows[t];
    }
    result[i] = hh === ll ? 0 : ((hh - closes[i]) / (hh - ll)) * 100;
  }
  for (let i = 0; i < period - 1; i++) result[i] = result[period - 1];
  return result;
}

// === BIAS 乖离率 (6) ===
export function calcBIAS(closes: number[], period = 6): number[] {
  const ma = calcMA(closes, period);
  return closes.map((c, i) => ((c - ma[i]) / ma[i]) * 100);
}

// === CR 能量指标 (26) ===
export function calcCR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 26
): number[] {
  const result: number[] = new Array(closes.length).fill(0);
  if (closes.length < period + 1) return result;

  const midPrices = highs.map((h, i) => (h + lows[i] + closes[i]) / 3);

  for (let i = period; i < closes.length; i++) {
    let buy = 0, sell = 0;
    for (let j = i - period + 1; j <= i; j++) {
      buy += Math.max(0, highs[j] - midPrices[j - 1] || 0);
      sell += Math.max(0, (midPrices[j - 1] || 0) - lows[j]);
    }
    result[i] = sell === 0 ? 100 : (buy / sell) * 100;
  }

  // 补齐前半段
  for (let i = 0; i < period; i++) result[i] = result[period] || 100;
  return result;
}
