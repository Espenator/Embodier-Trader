/**
 * PatternAgent.js — Price Pattern Detection Agent
 * 
 * Detects intraday and daily price patterns: Dips, Pops, Corrections,
 * Rebounds, Breakouts, and Breakdowns. Directly maps to smarttrading.club's
 * Hourly Patterns (Uptrends, Downtrends, Dips, Pops, Corrections, Rebounds)
 * and Daily Dip/Pop/Breakout/Breakdown alerts.
 */
const AgentBase = typeof require !== 'undefined' ? require('./core/AgentBase') : window.AgentBase;
const Indicators = typeof require !== 'undefined' ? require('./core/indicators') : window.Indicators;

class PatternAgent extends AgentBase {
    constructor(config = {}) {
          super({
                  name: 'PatternAgent',
                  ...config
          });
          this.dipThreshold = config.dipThreshold || -0.02;    // -2% = dip
      this.popThreshold = config.popThreshold || 0.02;     // +2% = pop
      this.correctionPct = config.correctionPct || -0.05;  // -5% from high
      this.reboundPct = config.reboundPct || 0.03;         // +3% from low
    }

  _detectPattern(closes, highs, lows) {
        if (closes.length < 20) return { pattern: 'unknown', strength: 0 };

      const price = closes[closes.length - 1];
        const prevClose = closes[closes.length - 2];
        const dayReturn = (price - prevClose) / prevClose;

      // Recent high/low for correction/rebound
      const recentHigh = Math.max(...highs.slice(-20));
        const recentLow = Math.min(...lows.slice(-20));
        const fromHigh = (price - recentHigh) / recentHigh;
        const fromLow = (price - recentLow) / recentLow;

      // Short-term trend
      const sma5 = Indicators.sma(closes, 5);
        const sma20 = Indicators.sma(closes, 20);
        const shortTrend = Indicators.last(sma5) > Indicators.last(sma20) ? 'up' : 'down';

      // 3-day momentum
      const mom3 = closes.length >= 4
          ? (price - closes[closes.length - 4]) / closes[closes.length - 4]
              : 0;

      let pattern = 'neutral';
        let strength = 0;
        let detail = '';

      // Dip detection: pullback in uptrend
      if (dayReturn < this.dipThreshold && shortTrend === 'up') {
              pattern = 'dip';
              strength = Math.min(1, Math.abs(dayReturn) * 20);
              detail = `Dip in uptrend (${(dayReturn * 100).toFixed(1)}% today)`;
      }
        // Pop detection: spike in downtrend
      else if (dayReturn > this.popThreshold && shortTrend === 'down') {
              pattern = 'pop';
              strength = Math.min(1, dayReturn * 20);
              detail = `Pop in downtrend (${(dayReturn * 100).toFixed(1)}% today)`;
      }
        // Correction: significant drop from recent high
      else if (fromHigh < this.correctionPct) {
              pattern = 'correction';
              strength = Math.min(1, Math.abs(fromHigh) * 5);
              detail = `Correction ${(fromHigh * 100).toFixed(1)}% from 20-day high`;
      }
        // Rebound: bounce from recent low
      else if (fromLow > this.reboundPct && mom3 > 0) {
              pattern = 'rebound';
              strength = Math.min(1, fromLow * 10);
              detail = `Rebound +${(fromLow * 100).toFixed(1)}% from 20-day low`;
      }
        // Breakout: new high with momentum
      else if (price >= recentHigh && mom3 > 0.02) {
              pattern = 'breakout';
              strength = Math.min(1, mom3 * 15);
              detail = `Breakout to new 20-day high with momentum`;
      }
        // Breakdown: new low with momentum
      else if (price <= recentLow && mom3 < -0.02) {
              pattern = 'breakdown';
              strength = Math.min(1, Math.abs(mom3) * 15);
              detail = `Breakdown to new 20-day low`;
      }

      return { pattern, strength, detail, dayReturn, fromHigh, fromLow, shortTrend };
  }

  compute(data) {
        const daily = data.ohlcv_daily || [];
        const hourly = data.ohlcv_hourly || [];

      const dCloses = daily.map(c => c.close);
        const dHighs = daily.map(c => c.high);
        const dLows = daily.map(c => c.low);

      if (dCloses.length < 20) {
              return { action: 'hold', strength: 0, reason: 'Insufficient data for pattern detection' };
      }

      const dailyPattern = this._detectPattern(dCloses, dHighs, dLows);

      // Hourly pattern for confirmation
      let hourlyPattern = null;
        if (hourly.length >= 20) {
                hourlyPattern = this._detectPattern(
                          hourly.map(c => c.close),
                          hourly.map(c => c.high),
                          hourly.map(c => c.low)
                        );
        }

      let action = 'hold';
        let strength = 0;
        let reason = '';

      const buyPatterns = ['dip', 'rebound', 'breakout'];
        const sellPatterns = ['pop', 'correction', 'breakdown'];

      if (buyPatterns.includes(dailyPattern.pattern)) {
              action = 'buy';
              strength = dailyPattern.strength * 0.7;
              reason = dailyPattern.detail;
              if (hourlyPattern && buyPatterns.includes(hourlyPattern.pattern)) {
                        strength = Math.min(0.9, strength + 0.2);
                        reason += ` + Hourly ${hourlyPattern.pattern}`;
              }
      } else if (sellPatterns.includes(dailyPattern.pattern)) {
              action = 'sell';
              strength = dailyPattern.strength * 0.7;
              reason = dailyPattern.detail;
              if (hourlyPattern && sellPatterns.includes(hourlyPattern.pattern)) {
                        strength = Math.min(0.9, strength + 0.2);
                        reason += ` + Hourly ${hourlyPattern.pattern}`;
              }
      } else {
              reason = 'No actionable pattern detected';
              // Check if hourly has something
          if (hourlyPattern && hourlyPattern.pattern !== 'neutral') {
                    action = buyPatterns.includes(hourlyPattern.pattern) ? 'buy' : 'sell';
                    strength = hourlyPattern.strength * 0.4;
                    reason = `Hourly: ${hourlyPattern.detail}`;
          }
      }

      return {
              action,
              strength,
              reason,
              metrics: {
                        dailyPattern,
                        hourlyPattern
              }
      };
  }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PatternAgent;
}
