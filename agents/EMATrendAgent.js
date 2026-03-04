/**
 * EMATrendAgent.js — EMA Cascade & Intraday Pattern Classifier
 * 
 * Implements the EMA5/EMA10/EMA20 cascade analysis seen on 
 * smarttrading.club's Trading Opportunities page. Classifies intraday
 * patterns using the same codes:
 *   UT = Uptrend, SU = Strong Uptrend, GU = Gap Up
 *   DT = Downtrend, SD = Strong Downtrend, GD = Gap Down
 *   CR = Correction, RB = Rebound, N/A = No clear pattern
 * 
 * Also tracks the "Daily Trend Level" numeric score and Hourly VL
 * (Volatility Level) with rate of change.
 * 
 * Key insight from smarttrading.club: EMA alignment across timeframes
 * (EMA5 > EMA10 > EMA20 = bullish cascade) is a powerful confirmation.
 */
const AgentBase = typeof require !== 'undefined' ? require('./core/AgentBase') : window.AgentBase;
const Indicators = typeof require !== 'undefined' ? require('./core/indicators') : window.Indicators;

class EMATrendAgent extends AgentBase {
    constructor(config = {}) {
          super({
                  name: 'EMATrendAgent',
                  ...config
          });
    }

  /**
     * Classify intraday pattern using smarttrading.club pattern codes.
     */
  _classifyPattern(closes, opens) {
        if (closes.length < 20) return 'N/A';

      const price = closes[closes.length - 1];
        const prevClose = closes[closes.length - 2];
        const open = opens && opens.length > 0 ? opens[opens.length - 1] : prevClose;
        const dayReturn = (price - prevClose) / prevClose;
        const gapPct = (open - prevClose) / prevClose;

      const ema5 = Indicators.ema(closes, 5);
        const ema10 = Indicators.ema(closes, 10);
        const ema20 = Indicators.ema(closes, 20);
        const e5 = Indicators.last(ema5);
        const e10 = Indicators.last(ema10);
        const e20 = Indicators.last(ema20);

      // EMA cascade alignment
      const bullCascade = e5 > e10 && e10 > e20;
        const bearCascade = e5 < e10 && e10 < e20;

      // Gap detection
      if (gapPct > 0.01) return 'GU';  // Gap Up
      if (gapPct < -0.01) return 'GD'; // Gap Down

      // Strong trends
      if (bullCascade && dayReturn > 0.01) return 'SU';  // Strong Uptrend
      if (bearCascade && dayReturn < -0.01) return 'SD';  // Strong Downtrend

      // Regular trends
      if (price > e5 && e5 > e10) return 'UT';  // Uptrend
      if (price < e5 && e5 < e10) return 'DT';  // Downtrend

      // Correction in uptrend
      if (bullCascade && dayReturn < -0.005) return 'CR';
        // Rebound in downtrend
      if (bearCascade && dayReturn > 0.005) return 'RB';

      return 'N/A';
  }

  /**
     * Compute the Daily Trend Level — a numeric score representing
     * trend strength on a scale roughly from -10 to +10.
     */
  _trendLevel(closes) {
        if (closes.length < 50) return 0;

      let level = 0;
        const price = closes[closes.length - 1];
        const ema5 = Indicators.last(Indicators.ema(closes, 5));
        const ema10 = Indicators.last(Indicators.ema(closes, 10));
        const ema20 = Indicators.last(Indicators.ema(closes, 20));
        const sma50 = Indicators.last(Indicators.sma(closes, 50));

      // +/- points for price vs each MA
      if (price > ema5) level += 2; else level -= 2;
        if (price > ema10) level += 2; else level -= 2;
        if (price > ema20) level += 2; else level -= 2;
        if (price > sma50) level += 2; else level -= 2;

      // EMA cascade bonus
      if (ema5 > ema10 && ema10 > ema20) level += 2;
        else if (ema5 < ema10 && ema10 < ema20) level -= 2;

      return level;
  }

  /**
     * EMA percentage spread for each EMA vs price.
     */
  _emaSpread(closes) {
        const price = closes[closes.length - 1];
        const ema5 = Indicators.last(Indicators.ema(closes, 5));
        const ema10 = Indicators.last(Indicators.ema(closes, 10));
        const ema20 = Indicators.last(Indicators.ema(closes, 20));

      return {
              ema5Trend: ((price - ema5) / ema5 * 100).toFixed(1),
              ema10Trend: ((price - ema10) / ema10 * 100).toFixed(1),
              ema20Trend: ((price - ema20) / ema20 * 100).toFixed(1),
              cascade: ema5 > ema10 && ema10 > ema20 ? 'bullish'
                        : ema5 < ema10 && ema10 < ema20 ? 'bearish' : 'mixed'
      };
  }

  compute(data) {
        const daily = data.ohlcv_daily || [];
        const hourly = data.ohlcv_hourly || [];
        const intra = data.ohlcv_10min || [];

      const dCloses = daily.map(c => c.close);
        const dOpens = daily.map(c => c.open);
        const hCloses = hourly.map(c => c.close);
        const hOpens = hourly.map(c => c.open);

      if (dCloses.length < 20) {
              return { action: 'hold', strength: 0, reason: 'Insufficient data for EMA analysis' };
      }

      // Pattern classification across timeframes
      const intradayPattern = this._classifyPattern(
              intra.length >= 20 ? intra.map(c => c.close) : dCloses,
              intra.length >= 20 ? intra.map(c => c.open) : dOpens
            );
        const hourlyPattern = hCloses.length >= 20
          ? this._classifyPattern(hCloses, hOpens) : 'N/A';
        const dailyPattern = this._classifyPattern(dCloses, dOpens);

      // Trend level
      const dailyTrendLevel = this._trendLevel(dCloses);
        const hourlyTrendLevel = hCloses.length >= 50 ? this._trendLevel(hCloses) : 0;

      // EMA spreads
      const dailyEMA = this._emaSpread(dCloses);
        const hourlyEMA = hCloses.length >= 20 ? this._emaSpread(hCloses) : null;

      // Decision
      let action = 'hold';
        let strength = 0;
        let reason = '';

      const bullPatterns = ['UT', 'SU', 'GU', 'RB'];
        const bearPatterns = ['DT', 'SD', 'GD', 'CR'];

      // Strong signal: daily + hourly patterns align
      if (bullPatterns.includes(dailyPattern) && bullPatterns.includes(hourlyPattern)) {
              action = 'buy';
              strength = 0.75;
              reason = `Daily ${dailyPattern} + Hourly ${hourlyPattern} — aligned bullish`;
      } else if (bearPatterns.includes(dailyPattern) && bearPatterns.includes(hourlyPattern)) {
              action = 'sell';
              strength = 0.75;
              reason = `Daily ${dailyPattern} + Hourly ${hourlyPattern} — aligned bearish`;
      }
        // Daily pattern only
      else if (bullPatterns.includes(dailyPattern)) {
              action = 'buy';
              strength = 0.5;
              reason = `Daily ${dailyPattern}, hourly ${hourlyPattern}`;
      } else if (bearPatterns.includes(dailyPattern)) {
              action = 'sell';
              strength = 0.5;
              reason = `Daily ${dailyPattern}, hourly ${hourlyPattern}`;
      }

      // EMA cascade boost
      if (dailyEMA.cascade === 'bullish' && action === 'buy') {
              strength = Math.min(0.9, strength + 0.15);
              reason += ' + bullish EMA cascade';
      } else if (dailyEMA.cascade === 'bearish' && action === 'sell') {
              strength = Math.min(0.9, strength + 0.15);
              reason += ' + bearish EMA cascade';
      }

      // Trend level extreme = strong conviction
      if (Math.abs(dailyTrendLevel) >= 8) {
              strength = Math.min(0.95, strength + 0.1);
              reason += ` (trend level ${dailyTrendLevel})`;
      }

      if (!reason) reason = `Pattern: D=${dailyPattern} H=${hourlyPattern}, level ${dailyTrendLevel}`;

      return {
              action,
              strength,
              reason,
              metrics: {
                        intradayPattern,
                        hourlyPattern,
                        dailyPattern,
                        dailyTrendLevel,
                        hourlyTrendLevel,
                        dailyEMA,
                        hourlyEMA
              }
      };
  }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EMATrendAgent;
}
