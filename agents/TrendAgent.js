/**
 * TrendAgent.js — Multi-Timeframe Trend Detection Agent
 * 
 * Detects trend direction across 10min, hourly, and daily timeframes.
 * Maps to smarttrading.club's Uptrend/Downtrend/Reversal/Breakout/
 * Breakdown daily and hourly trend alerts.
 * 
 * Uses SMA crossovers + slope analysis + price vs moving average.
 */
const AgentBase = typeof require !== 'undefined' ? require('./core/AgentBase') : window.AgentBase;
const Indicators = typeof require !== 'undefined' ? require('./core/indicators') : window.Indicators;

class TrendAgent extends AgentBase {
    constructor(config = {}) {
          super({
                  name: 'TrendAgent',
                  ...config
          });
          this.shortPeriod = config.shortPeriod || 10;
          this.longPeriod = config.longPeriod || 50;
          this.trendPeriod = config.trendPeriod || 200;
    }

  _analyzeTrend(closes) {
        if (closes.length < this.trendPeriod) {
                return { direction: 'unknown', strength: 0, crossover: 'none' };
        }

      const shortMA = Indicators.sma(closes, this.shortPeriod);
        const longMA = Indicators.sma(closes, this.longPeriod);
        const trendMA = Indicators.sma(closes, this.trendPeriod);

      const s = Indicators.last(shortMA);
        const l = Indicators.last(longMA);
        const t = Indicators.last(trendMA);
        const price = closes[closes.length - 1];

      // Short/Long crossover
      const prevShort = shortMA.length > 1 ? shortMA[shortMA.length - 2] : s;
        const prevLong = longMA.length > 1 ? longMA[longMA.length - 2] : l;
        let crossover = 'none';
        if (prevShort <= prevLong && s > l) crossover = 'golden';
        if (prevShort >= prevLong && s < l) crossover = 'death';

      // Trend strength from MA alignment
      const aboveTrend = price > t;
        const shortAboveLong = s > l;
        const shortSlope = Indicators.slope(shortMA, 5);
        const longSlope = Indicators.slope(longMA, 5);

      let direction = 'flat';
        let strength = 0;

      if (shortAboveLong && aboveTrend) {
              direction = 'up';
              strength = Math.min(1, Math.abs(shortSlope) * 10 + 0.3);
      } else if (!shortAboveLong && !aboveTrend) {
              direction = 'down';
              strength = Math.min(1, Math.abs(shortSlope) * 10 + 0.3);
      } else {
              direction = 'transitioning';
              strength = 0.2;
      }

      return {
              direction,
              strength,
              crossover,
              priceVsTrend: ((price - t) / t * 100).toFixed(2) + '%',
              shortSlope,
              longSlope
      };
  }

  compute(data) {
        const dailyCloses = (data.ohlcv_daily || []).map(c => c.close);
        const hourlyCloses = (data.ohlcv_hourly || []).map(c => c.close);
        const intraCloses = (data.ohlcv_10min || []).map(c => c.close);

      if (dailyCloses.length < this.longPeriod) {
              return { action: 'hold', strength: 0, reason: 'Insufficient data for trend' };
      }

      const daily = this._analyzeTrend(dailyCloses);
        const hourly = hourlyCloses.length >= this.longPeriod ? this._analyzeTrend(hourlyCloses) : null;
        const intraday = intraCloses.length >= this.longPeriod ? this._analyzeTrend(intraCloses) : null;

      let action = 'hold';
        let strength = 0;
        let reason = '';

      // Crossover events are highest priority
      if (daily.crossover === 'golden') {
              action = 'buy';
              strength = 0.8;
              reason = 'Daily golden cross (short MA crossed above long MA)';
      } else if (daily.crossover === 'death') {
              action = 'sell';
              strength = 0.8;
              reason = 'Daily death cross (short MA crossed below long MA)';
      } else if (daily.direction === 'up') {
              action = 'buy';
              strength = daily.strength * 0.6;
              reason = `Daily uptrend (${daily.priceVsTrend} above trend MA)`;
              // Strengthen if hourly confirms
          if (hourly && hourly.direction === 'up') {
                    strength = Math.min(0.85, strength + 0.2);
                    reason += ' + hourly uptrend';
          }
      } else if (daily.direction === 'down') {
              action = 'sell';
              strength = daily.strength * 0.6;
              reason = `Daily downtrend (${daily.priceVsTrend} vs trend MA)`;
              if (hourly && hourly.direction === 'down') {
                        strength = Math.min(0.85, strength + 0.2);
                        reason += ' + hourly downtrend';
              }
      } else {
              reason = 'Trend transitioning — no clear direction';
              if (hourly && hourly.crossover !== 'none') {
                        action = hourly.crossover === 'golden' ? 'buy' : 'sell';
                        strength = 0.4;
                        reason = `Hourly ${hourly.crossover} cross while daily transitions`;
              }
      }

      return {
              action,
              strength,
              reason,
              metrics: {
                        daily,
                        hourly,
                        intraday
              }
      };
  }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TrendAgent;
}
