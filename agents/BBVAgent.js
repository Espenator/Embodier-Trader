/**
 * BBVAgent.js — Bollinger Band Value Mean-Reversion Agent
 * 
 * Uses Bollinger Band position (BBV) to detect mean-reversion opportunities.
 * Inspired by smarttrading.club's Daily BBV Oversold/Overbought alerts.
 * 
 * BBV ranges from -1 (lower band) through 0 (SMA) to +1 (upper band).
 * Values beyond +/-1 indicate price outside the bands.
 */
const AgentBase = typeof require !== 'undefined' ? require('./core/AgentBase') : window.AgentBase;
const Indicators = typeof require !== 'undefined' ? require('./core/indicators') : window.Indicators;

class BBVAgent extends AgentBase {
    constructor(config = {}) {
          super({
                  name: 'BBVAgent',
                  ...config
          });
          this.period = config.period || 20;
          this.oversoldThreshold = config.oversoldThreshold || -0.8;
          this.overboughtThreshold = config.overboughtThreshold || 0.8;
          this.extremeThreshold = config.extremeThreshold || 1.2;
    }

  compute(data) {
        const closes = (data.ohlcv_daily || []).map(c => c.close);
        const hourlyCloses = (data.ohlcv_hourly || []).map(c => c.close);

      if (closes.length < this.period) {
              return { action: 'hold', strength: 0, reason: 'Insufficient data for BBV' };
      }

      // Daily BBV
      const dailyBBV = Indicators.bbv(closes, this.period);
        const currentBBV = Indicators.last(dailyBBV);

      // Hourly BBV for intraday confirmation
      let hourlyBBVVal = null;
        if (hourlyCloses.length >= this.period) {
                const hBBV = Indicators.bbv(hourlyCloses, this.period);
                hourlyBBVVal = Indicators.last(hBBV);
        }

      // BBV trend (is it reverting toward mean?)
      const bbvSlope = dailyBBV.length >= 3 ? Indicators.slope(dailyBBV, 3) : 0;

      // Daily trend context
      const trend = Indicators.trendDirection(closes, 10, 50);

      let action = 'hold';
        let strength = 0;
        let reason = '';

      if (currentBBV <= -this.extremeThreshold) {
              // Extreme oversold — strong mean reversion buy
          action = 'buy';
              strength = 0.85;
              reason = `Extreme BBV oversold (${currentBBV.toFixed(2)}) — outside lower band`;
              if (bbvSlope > 0) {
                        strength = 0.95;
                        reason += ', reverting up';
              }
      } else if (currentBBV <= this.oversoldThreshold) {
              action = 'buy';
              strength = 0.55;
              reason = `BBV oversold (${currentBBV.toFixed(2)})`;
              if (hourlyBBVVal !== null && hourlyBBVVal < this.oversoldThreshold) {
                        strength = 0.7;
                        reason += ' + hourly confirms';
              }
              // Weaken signal if trend is strongly down
          if (trend === 'down') {
                    strength *= 0.7;
                    reason += ' (caution: downtrend)';
          }
      } else if (currentBBV >= this.extremeThreshold) {
              action = 'sell';
              strength = 0.85;
              reason = `Extreme BBV overbought (${currentBBV.toFixed(2)}) — outside upper band`;
              if (bbvSlope < 0) {
                        strength = 0.95;
                        reason += ', reverting down';
              }
      } else if (currentBBV >= this.overboughtThreshold) {
              action = 'sell';
              strength = 0.55;
              reason = `BBV overbought (${currentBBV.toFixed(2)})`;
              if (hourlyBBVVal !== null && hourlyBBVVal > this.overboughtThreshold) {
                        strength = 0.7;
                        reason += ' + hourly confirms';
              }
              if (trend === 'up') {
                        strength *= 0.7;
                        reason += ' (caution: uptrend)';
              }
      } else {
              reason = `BBV neutral (${currentBBV.toFixed(2)})`;
      }

      return {
              action,
              strength,
              reason,
              metrics: {
                        dailyBBV: currentBBV,
                        hourlyBBV: hourlyBBVVal,
                        bbvSlope,
                        trend,
                        period: this.period
              }
      };
  }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BBVAgent;
}
