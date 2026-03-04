/**
 * indicators.js — Shared Technical Indicator Library
 * 
 * Pure-function indicator calculations used by all agents.
 * Every function takes arrays of numbers and returns arrays.
 * Inspired by smarttrading.club analysis patterns.
 */
const Indicators = {
    /**
         * Simple Moving Average
     */
    sma(data, period) {
          if (data.length < period) return [];
          const result = [];
          for (let i = period - 1; i < data.length; i++) {
                  let sum = 0;
                  for (let j = i - period + 1; j <= i; j++) sum += data[j];
                  result.push(sum / period);
          }
          return result;
    },

    /**
         * Exponential Moving Average
     */
    ema(data, period) {
          if (data.length < period) return [];
          const k = 2 / (period + 1);
          let emaVal = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
          const result = [emaVal];
          for (let i = period; i < data.length; i++) {
                  emaVal = data[i] * k + emaVal * (1 - k);
                  result.push(emaVal);
          }
          return result;
    },

    /**
         * Relative Strength Index
     */
    rsi(data, period = 14) {
          if (data.length < period + 1) return [];
          const changes = [];
          for (let i = 1; i < data.length; i++) changes.push(data[i] - data[i - 1]);
          let avgGain = 0, avgLoss = 0;
          for (let i = 0; i < period; i++) {
                  if (changes[i] > 0) avgGain += changes[i];
                  else avgLoss += Math.abs(changes[i]);
          }
          avgGain /= period;
          avgLoss /= period;
          const result = [100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss))];
          for (let i = period; i < changes.length; i++) {
                  const gain = changes[i] > 0 ? changes[i] : 0;
                  const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
                  avgGain = (avgGain * (period - 1) + gain) / period;
                  avgLoss = (avgLoss * (period - 1) + loss) / period;
                  result.push(100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss)));
          }
          return result;
    },

    /**
         * Standard Deviation (rolling)
     */
    stdDev(data, period) {
          if (data.length < period) return [];
          const result = [];
          for (let i = period - 1; i < data.length; i++) {
                  let sum = 0;
                  for (let j = i - period + 1; j <= i; j++) sum += data[j];
                  const mean = sum / period;
                  let v = 0;
                  for (let j = i - period + 1; j <= i; j++) v += (data[j] - mean) ** 2;
                  result.push(Math.sqrt(v / period));
          }
          return result;
    },

    /**
         * Bollinger Band Value (BBV): normalized position within bands
     * Returns -1 to +1 range (0 = at SMA, +1 = upper band, -1 = lower band)
     */
    bbv(data, period = 20) {
          if (data.length < period) return [];
          const s = Indicators.sma(data, period);
          const sd = Indicators.stdDev(data, period);
          const r = [];
          for (let i = 0; i < s.length; i++) {
                  const bw = sd[i] * 2;
                  r.push(bw === 0 ? 0 : (data[i + period - 1] - s[i]) / (bw / 2));
          }
          return r;
    },

    /**
         * MACD — Moving Average Convergence Divergence
     * Returns { macd: [], signal: [], histogram: [] }
     */
    macd(data, fast = 12, slow = 26, sig = 9) {
          const emaFast = Indicators.ema(data, fast);
          const emaSlow = Indicators.ema(data, slow);
          const offset = slow - fast;
          const macdLine = [];
          for (let i = 0; i < emaSlow.length; i++) {
                  macdLine.push(emaFast[i + offset] - emaSlow[i]);
          }
          const signalLine = Indicators.ema(macdLine, sig);
          const sigOffset = sig - 1;
          const histogram = [];
          for (let i = 0; i < signalLine.length; i++) {
                  histogram.push(macdLine[i + sigOffset] - signalLine[i]);
          }
          return { macd: macdLine, signal: signalLine, histogram };
    },

    /**
         * Average True Range
     */
    atr(highs, lows, closes, period = 14) {
          if (highs.length < period + 1) return [];
          const tr = [];
          for (let i = 1; i < highs.length; i++) {
                  tr.push(Math.max(
                            highs[i] - lows[i],
                            Math.abs(highs[i] - closes[i - 1]),
                            Math.abs(lows[i] - closes[i - 1])
                          ));
          }
          let atrVal = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
          const result = [atrVal];
          for (let i = period; i < tr.length; i++) {
                  atrVal = (atrVal * (period - 1) + tr[i]) / period;
                  result.push(atrVal);
          }
          return result;
    },

    /**
         * Volume Weighted Average Price (approx from OHLCV)
     */
    vwap(highs, lows, closes, volumes) {
          const result = [];
          let cumVol = 0, cumTP = 0;
          for (let i = 0; i < closes.length; i++) {
                  const tp = (highs[i] + lows[i] + closes[i]) / 3;
                  cumTP += tp * volumes[i];
                  cumVol += volumes[i];
                  result.push(cumVol === 0 ? 0 : cumTP / cumVol);
          }
          return result;
    },

    /**
         * Slope of recent n values (percentage change from start to end)
     */
    slope(arr, n = 5) {
          if (arr.length < n) return 0;
          const r = arr.slice(-n);
          return r[0] === 0 ? 0 : (r[r.length - 1] - r[0]) / Math.abs(r[0]);
    },

    /**
         * Period-over-period returns
     */
    returns(data) {
          const r = [];
          for (let i = 1; i < data.length; i++) {
                  r.push((data[i] - data[i - 1]) / data[i - 1]);
          }
          return r;
    },

    /**
         * Average absolute swing over a period
     */
    avgSwing(data, period = 63) {
          const r = Indicators.returns(data);
          return r.length < period ? null : r.slice(-period).reduce((a, b) => a + Math.abs(b), 0) / period;
    },

    /**
         * Detect trend direction: 'up', 'down', or 'flat'
     */
    trendDirection(data, shortP = 10, longP = 50) {
          const shortMA = Indicators.sma(data, shortP);
          const longMA = Indicators.sma(data, longP);
          if (shortMA.length === 0 || longMA.length === 0) return 'flat';
          const s = shortMA[shortMA.length - 1];
          const l = longMA[longMA.length - 1];
          const diff = (s - l) / l;
          if (diff > 0.005) return 'up';
          if (diff < -0.005) return 'down';
          return 'flat';
    },

    /**
         * Last element helper
     */
    last(arr) {
          return arr.length > 0 ? arr[arr.length - 1] : null;
    }
};

// Export for both browser and Node
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Indicators;
}
