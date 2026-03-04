const AgentBase = (typeof require !== 'undefined') ? require('./core/AgentBase') : window.AgentBase;
const { SMA, EMA, ATR, returns } = (typeof require !== 'undefined') ? require('./core/indicators') : window.indicators;

class EarningsCatalystAgent extends AgentBase {
    constructor(ticker, config = {}) {
          super('EarningsCatalystAgent', ticker, config);
          this.preEarningsDays = config.preEarningsDays || 5;
          this.postEarningsDays = config.postEarningsDays || 3;
          this.ivSurgeThreshold = config.ivSurgeThreshold || 1.5;
          this.gapThreshold = config.gapThreshold || 0.03;
    }

  detectEarningsProximity(data) {
        const earningsDate = data.nextEarningsDate || null;
        const prevEarningsDate = data.prevEarningsDate || null;
        const now = data.currentDate || new Date();

      let daysToEarnings = null;
        let daysSinceEarnings = null;

      if (earningsDate) {
              const diff = (new Date(earningsDate) - new Date(now)) / (1000 * 60 * 60 * 24);
              daysToEarnings = Math.round(diff);
      }
        if (prevEarningsDate) {
                const diff = (new Date(now) - new Date(prevEarningsDate)) / (1000 * 60 * 60 * 24);
                daysSinceEarnings = Math.round(diff);
        }

      return { daysToEarnings, daysSinceEarnings };
  }

  detectPostEarningsGap(dailyData) {
        if (!dailyData || dailyData.length < 2) return { hasGap: false, gapPct: 0 };
        const last = dailyData[dailyData.length - 1];
        const prev = dailyData[dailyData.length - 2];
        const gapPct = (last.open - prev.close) / prev.close;
        return {
                hasGap: Math.abs(gapPct) >= this.gapThreshold,
                gapPct,
                gapDirection: gapPct > 0 ? 'up' : gapPct < 0 ? 'down' : 'flat'
        };
  }

  detectIVSurge(data) {
        const ivHistory = data.impliedVolatility || [];
        if (ivHistory.length < 10) return { ivSurge: false, ivRatio: 1 };
        const current = ivHistory[ivHistory.length - 1];
        const baseline = ivHistory.slice(-30, -5);
        if (baseline.length === 0) return { ivSurge: false, ivRatio: 1 };
        const avgIV = baseline.reduce((s, v) => s + v, 0) / baseline.length;
        const ratio = avgIV > 0 ? current / avgIV : 1;
        return { ivSurge: ratio >= this.ivSurgeThreshold, ivRatio: ratio };
  }

  analyzeHistoricalEarnings(data) {
        const history = data.earningsHistory || [];
        if (history.length < 2) return { avgMove: 0.05, beatRate: 0.5, avgSurprise: 0 };
        const moves = history.map(e => Math.abs(e.priceMove || 0));
        const beats = history.filter(e => (e.surprise || 0) > 0).length;
        const surprises = history.map(e => e.surprise || 0);
        return {
                avgMove: moves.reduce((s, v) => s + v, 0) / moves.length,
                beatRate: beats / history.length,
                avgSurprise: surprises.reduce((s, v) => s + v, 0) / surprises.length
        };
  }

  compute(data) {
        const daily = data.ohlcv_daily || [];
        const closes = daily.map(c => c.close);
        const { daysToEarnings, daysSinceEarnings } = this.detectEarningsProximity(data);
        const gapInfo = this.detectPostEarningsGap(daily);
        const ivInfo = this.detectIVSurge(data);
        const histInfo = this.analyzeHistoricalEarnings(data);

      const atr = ATR(daily, 14);
        const atrPct = closes.length > 0 && atr.length > 0 ? atr[atr.length - 1] / closes[closes.length - 1] : 0.02;

      let action = 'hold';
        let strength = 0;
        let phase = 'neutral';

      if (daysToEarnings !== null && daysToEarnings >= 0 && daysToEarnings <= this.preEarningsDays) {
              phase = 'pre-earnings';
              if (ivInfo.ivSurge) {
                        action = 'sell';
                        strength = 0.4;
              } else if (histInfo.beatRate > 0.7 && histInfo.avgMove < atrPct * 3) {
                        action = 'buy';
                        strength = Math.min(0.5, 0.2 + histInfo.beatRate * 0.3);
              } else {
                        action = 'hold';
                        strength = 0.3;
              }
      } else if (daysSinceEarnings !== null && daysSinceEarnings >= 0 && daysSinceEarnings <= this.postEarningsDays) {
              phase = 'post-earnings';
              if (gapInfo.hasGap) {
                        if (gapInfo.gapDirection === 'up') {
                                    action = 'buy';
                                    strength = Math.min(0.8, 0.4 + Math.abs(gapInfo.gapPct) * 5);
                        } else {
                                    action = 'sell';
                                    strength = Math.min(0.8, 0.4 + Math.abs(gapInfo.gapPct) * 5);
                        }
              } else {
                        action = 'hold';
                        strength = 0.2;
              }
      } else if (daysToEarnings !== null && daysToEarnings > this.preEarningsDays && daysToEarnings <= 20) {
              phase = 'approaching';
              if (histInfo.beatRate > 0.75) {
                        action = 'buy';
                        strength = 0.2;
              }
      } else {
              phase = 'neutral';
              action = 'hold';
              strength = 0;
      }

      return {
              action,
              strength,
              reason: `Earnings: phase=${phase}, daysTo=${daysToEarnings}, daysSince=${daysSinceEarnings}, gap=${gapInfo.gapPct ? (gapInfo.gapPct * 100).toFixed(1) + '%' : 'none'}, IV ratio=${ivInfo.ivRatio.toFixed(2)}, beat rate=${(histInfo.beatRate * 100).toFixed(0)}%`,
              metrics: {
                        phase,
                        daysToEarnings,
                        daysSinceEarnings,
                        gapPct: gapInfo.gapPct ? +gapInfo.gapPct.toFixed(4) : 0,
                        gapDirection: gapInfo.gapDirection || 'none',
                        ivRatio: +ivInfo.ivRatio.toFixed(3),
                        ivSurge: ivInfo.ivSurge,
                        historicalBeatRate: +histInfo.beatRate.toFixed(3),
                        historicalAvgMove: +histInfo.avgMove.toFixed(4),
                        historicalAvgSurprise: +histInfo.avgSurprise.toFixed(4),
                        atrPct: +atrPct.toFixed(4)
              }
      };
  }
}

if (typeof module !== 'undefined' && module.exports) { module.exports = EarningsCatalystAgent; }
