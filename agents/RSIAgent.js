/**
 * RSIAgent.js — Relative Strength Index Signal Agent
 * 
 * Monitors RSI across multiple timeframes to detect oversold/overbought
 * conditions. Inspired by smarttrading.club's RSI Oversold/Overbought
 * daily and hourly alerts.
 * 
 * Signals: { action: 'buy'|'sell'|'hold', strength: 0-1, reason: string }
 */
const AgentBase = typeof require !== 'undefined' ? require('./core/AgentBase') : window.AgentBase;
const Indicators = typeof require !== 'undefined' ? require('./core/indicators') : window.Indicators;

class RSIAgent extends AgentBase {
    constructor(config = {}) {
          super({
                  name: 'RSIAgent',
                  ...config
          });
          this.period = config.period || 14;
          this.oversold = config.oversold || 30;
          this.overbought = config.overbought || 70;
          this.extremeOversold = config.extremeOversold || 20;
          this.extremeOverbought = config.extremeOverbought || 80;
    }

  compute(data) {
        const closes = (data.ohlcv_daily || []).map(c => c.close);
        const hourlyCloses = (data.ohlcv_hourly || []).map(c => c.close);

      if (closes.length < this.period + 1) {
              return { action: 'hold', strength: 0, reason: 'Insufficient data' };
      }

      // Daily RSI
      const dailyRSI = Indicators.rsi(closes, this.period);
        const currentRSI = Indicators.last(dailyRSI);

      // Hourly RSI for confirmation
      let hourlyRSIVal = null;
        if (hourlyCloses.length > this.period + 1) {
                const hRSI = Indicators.rsi(hourlyCloses, this.period);
                hourlyRSIVal = Indicators.last(hRSI);
        }

      // RSI slope — is momentum building or fading?
      const rsiSlope = dailyRSI.length >= 5 ? Indicators.slope(dailyRSI, 5) : 0;

      // Decision logic
      let action = 'hold';
        let strength = 0;
        let reason = '';

      if (currentRSI <= this.extremeOversold) {
              action = 'buy';
              strength = 0.9;
              reason = `Extreme oversold RSI(${currentRSI.toFixed(1)})`;
      } else if (currentRSI <= this.oversold) {
              action = 'buy';
              strength = 0.6;
              reason = `Oversold RSI(${currentRSI.toFixed(1)})`;
              // Boost if hourly confirms
          if (hourlyRSIVal && hourlyRSIVal < this.oversold) {
                    strength = 0.75;
                    reason += ' + hourly confirms';
          }
      } else if (currentRSI >= this.extremeOverbought) {
              action = 'sell';
              strength = 0.9;
              reason = `Extreme overbought RSI(${currentRSI.toFixed(1)})`;
      } else if (currentRSI >= this.overbought) {
              action = 'sell';
              strength = 0.6;
              reason = `Overbought RSI(${currentRSI.toFixed(1)})`;
              if (hourlyRSIVal && hourlyRSIVal > this.overbought) {
                        strength = 0.75;
                        reason += ' + hourly confirms';
              }
      } else {
              // Neutral zone — check for divergence signals
          if (rsiSlope > 0.05 && currentRSI < 50) {
                    action = 'buy';
                    strength = 0.3;
                    reason = `RSI rising from low (${currentRSI.toFixed(1)}, slope +${(rsiSlope * 100).toFixed(1)}%)`;
          } else if (rsiSlope < -0.05 && currentRSI > 50) {
                    action = 'sell';
                    strength = 0.3;
                    reason = `RSI falling from high (${currentRSI.toFixed(1)}, slope ${(rsiSlope * 100).toFixed(1)}%)`;
          } else {
                    reason = `RSI neutral (${currentRSI.toFixed(1)})`;
          }
      }

      return {
              action,
              strength,
              reason,
              metrics: {
                        dailyRSI: currentRSI,
                        hourlyRSI: hourlyRSIVal,
                        rsiSlope,
                        period: this.period
              }
      };
  }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RSIAgent;
}
