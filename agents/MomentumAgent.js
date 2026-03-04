/**
 * MomentumAgent.js — MACD & Momentum Signal Agent
 * 
 * Uses MACD crossovers, histogram momentum, and rate-of-change to
 * detect momentum shifts. Maps to smarttrading.club's Momentum and
 * Parabolic Moves trading alerts.
 */
const AgentBase = typeof require !== 'undefined' ? require('./core/AgentBase') : window.AgentBase;
const Indicators = typeof require !== 'undefined' ? require('./core/indicators') : window.Indicators;

class MomentumAgent extends AgentBase {
    constructor(config = {}) {
          super({
                  name: 'MomentumAgent',
                  ...config
          });
          this.fastPeriod = config.fastPeriod || 12;
          this.slowPeriod = config.slowPeriod || 26;
          this.signalPeriod = config.signalPeriod || 9;
          this.rocPeriod = config.rocPeriod || 10;
    }

  compute(data) {
        const closes = (data.ohlcv_daily || []).map(c => c.close);
        const hourlyCloses = (data.ohlcv_hourly || []).map(c => c.close);

      if (closes.length < this.slowPeriod + this.signalPeriod) {
              return { action: 'hold', strength: 0, reason: 'Insufficient data for MACD' };
      }

      // Daily MACD
      const { macd: macdLine, signal: signalLine, histogram } =
              Indicators.macd(closes, this.fastPeriod, this.slowPeriod, this.signalPeriod);

      const currentMACD = Indicators.last(macdLine);
        const currentSignal = Indicators.last(signalLine);
        const currentHist = Indicators.last(histogram);
        const prevHist = histogram.length > 1 ? histogram[histogram.length - 2] : 0;

      // Rate of change (momentum)
      const roc = closes.length >= this.rocPeriod + 1
          ? (closes[closes.length - 1] - closes[closes.length - 1 - this.rocPeriod]) /
                closes[closes.length - 1 - this.rocPeriod]
              : 0;

      // MACD crossover detection
      const prevMACD = macdLine.length > 1 ? macdLine[macdLine.length - 2] : currentMACD;
        const prevSignal = signalLine.length > 1 ? signalLine[signalLine.length - 2] : currentSignal;
        let crossover = 'none';
        if (prevMACD <= prevSignal && currentMACD > currentSignal) crossover = 'bullish';
        if (prevMACD >= prevSignal && currentMACD < currentSignal) crossover = 'bearish';

      // Histogram momentum — acceleration
      const histAccel = currentHist - prevHist;

      // Hourly MACD for confirmation
      let hourlyCross = 'none';
        if (hourlyCloses.length >= this.slowPeriod + this.signalPeriod) {
                const hMACD = Indicators.macd(hourlyCloses, this.fastPeriod, this.slowPeriod, this.signalPeriod);
                const hCurr = Indicators.last(hMACD.macd);
                const hSig = Indicators.last(hMACD.signal);
                const hPrevM = hMACD.macd.length > 1 ? hMACD.macd[hMACD.macd.length - 2] : hCurr;
                const hPrevS = hMACD.signal.length > 1 ? hMACD.signal[hMACD.signal.length - 2] : hSig;
                if (hPrevM <= hPrevS && hCurr > hSig) hourlyCross = 'bullish';
                if (hPrevM >= hPrevS && hCurr < hSig) hourlyCross = 'bearish';
        }

      let action = 'hold';
        let strength = 0;
        let reason = '';

      // Crossover signals
      if (crossover === 'bullish') {
              action = 'buy';
              strength = 0.7;
              reason = 'MACD bullish crossover';
              if (hourlyCross === 'bullish') {
                        strength = 0.85;
                        reason += ' + hourly confirms';
              }
      } else if (crossover === 'bearish') {
              action = 'sell';
              strength = 0.7;
              reason = 'MACD bearish crossover';
              if (hourlyCross === 'bearish') {
                        strength = 0.85;
                        reason += ' + hourly confirms';
              }
      }
        // Histogram momentum without crossover
      else if (histAccel > 0 && currentHist > 0) {
              action = 'buy';
              strength = Math.min(0.5, Math.abs(histAccel) * 100);
              reason = `Bullish momentum accelerating (hist: ${currentHist.toFixed(3)})`;
      } else if (histAccel < 0 && currentHist < 0) {
              action = 'sell';
              strength = Math.min(0.5, Math.abs(histAccel) * 100);
              reason = `Bearish momentum accelerating (hist: ${currentHist.toFixed(3)})`;
      }

      // Parabolic move detection (extreme ROC)
      if (Math.abs(roc) > 0.1) {
              strength = Math.min(1, strength + 0.2);
              reason += ` | Parabolic move ROC=${(roc * 100).toFixed(1)}%`;
      }

      if (!reason) reason = 'No clear momentum signal';

      return {
              action,
              strength,
              reason,
              metrics: {
                        macd: currentMACD,
                        signal: currentSignal,
                        histogram: currentHist,
                        histAccel,
                        roc,
                        crossover,
                        hourlyCross
              }
      };
  }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MomentumAgent;
}
