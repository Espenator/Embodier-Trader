/**
 * VolatilityAgent.js — Volatility & Risk Assessment Agent
 * 
 * Monitors ATR, standard deviation, and average swing to assess
 * current volatility regime. Maps to smarttrading.club's Daily StdDev,
 * 10Minutes StdDev, High Volatility Stocks/ETFs, and VIX
 * Convergence/Divergence metrics.
 * 
 * Signals volatility expansion/contraction and risk-adjusted position sizing.
 */
const AgentBase = typeof require !== 'undefined' ? require('./core/AgentBase') : window.AgentBase;
const Indicators = typeof require !== 'undefined' ? require('./core/indicators') : window.Indicators;

class VolatilityAgent extends AgentBase {
    constructor(config = {}) {
          super({
                  name: 'VolatilityAgent',
                  ...config
          });
          this.atrPeriod = config.atrPeriod || 14;
          this.sdPeriod = config.sdPeriod || 20;
          this.lookback = config.lookback || 63; // ~3 months for avg swing
    }

  compute(data) {
        const daily = data.ohlcv_daily || [];
        const closes = daily.map(c => c.close);
        const highs = daily.map(c => c.high);
        const lows = daily.map(c => c.low);

      if (closes.length < this.lookback) {
              return { action: 'hold', strength: 0, reason: 'Insufficient data for volatility' };
      }

      // ATR
      const atrValues = Indicators.atr(highs, lows, closes, this.atrPeriod);
        const currentATR = Indicators.last(atrValues);
        const atrPct = currentATR / closes[closes.length - 1];

      // Rolling standard deviation of returns
      const returns = Indicators.returns(closes);
        const sdValues = Indicators.stdDev(returns, this.sdPeriod);
        const currentSD = Indicators.last(sdValues);

      // Average swing (historical baseline)
      const avgSwing = Indicators.avgSwing(closes, this.lookback);

      // Volatility regime
      let regime = 'normal';
        let volRatio = 1;
        if (avgSwing && currentSD) {
                volRatio = currentSD / avgSwing;
                if (volRatio > 1.5) regime = 'high';
                else if (volRatio > 1.2) regime = 'elevated';
                else if (volRatio < 0.6) regime = 'compressed';
                else if (volRatio < 0.8) regime = 'low';
        }

      // Volatility trend (expanding or contracting?)
      const sdSlope = sdValues.length >= 5 ? Indicators.slope(sdValues, 5) : 0;
        const volTrend = sdSlope > 0.1 ? 'expanding' : sdSlope < -0.1 ? 'contracting' : 'stable';

      // 10-min volatility for intraday context
      const intraCloses = (data.ohlcv_10min || []).map(c => c.close);
        let intraSD = null;
        if (intraCloses.length >= this.sdPeriod) {
                const intraReturns = Indicators.returns(intraCloses);
                const intraSDs = Indicators.stdDev(intraReturns, Math.min(this.sdPeriod, intraReturns.length));
                intraSD = Indicators.last(intraSDs);
        }

      // Signal: high volatility = caution, compressed = breakout potential
      let action = 'hold';
        let strength = 0;
        let reason = '';

      if (regime === 'high' && volTrend === 'expanding') {
              action = 'sell';
              strength = 0.6;
              reason = `High volatility expanding (${(volRatio).toFixed(2)}x normal) — reduce exposure`;
      } else if (regime === 'high') {
              action = 'hold';
              strength = 0.4;
              reason = `High volatility regime (${(volRatio).toFixed(2)}x) — caution`;
      } else if (regime === 'compressed') {
              action = 'hold';
              strength = 0.5;
              reason = `Compressed volatility (${(volRatio).toFixed(2)}x) — breakout imminent`;
      } else if (regime === 'low' && volTrend === 'contracting') {
              action = 'buy';
              strength = 0.3;
              reason = `Low volatility contracting — quiet before breakout`;
      } else {
              reason = `Normal volatility (${regime}, ${volTrend})`;
      }

      return {
              action,
              strength,
              reason,
              metrics: {
                        atr: currentATR,
                        atrPct: (atrPct * 100).toFixed(2) + '%',
                        dailySD: currentSD,
                        avgSwing,
                        volRatio,
                        regime,
                        volTrend,
                        intraSD
              }
      };
  }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = VolatilityAgent;
}
