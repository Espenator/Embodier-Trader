const AgentBase = (typeof require !== 'undefined') ? require('./core/AgentBase') : window.AgentBase;
const { SMA, EMA, returns, slope } = (typeof require !== 'undefined') ? require('./core/indicators') : window.indicators;

class RelativeStrengthAgent extends AgentBase {
    constructor(ticker, config = {}) {
          super('RelativeStrengthAgent', ticker, config);
          this.lookbackPeriods = config.lookbackPeriods || [5, 20, 60];
          this.topPctThreshold = config.topPctThreshold || 0.2;
          this.bottomPctThreshold = config.bottomPctThreshold || 0.2;
    }

  computePerformance(closes, period) {
        if (closes.length < period + 1) return 0;
        const current = closes[closes.length - 1];
        const past = closes[closes.length - 1 - period];
        return past > 0 ? (current - past) / past : 0;
  }

  rankAmongPeers(tickerPerf, peerPerfs) {
        if (peerPerfs.length === 0) return { rank: 1, percentile: 0.5, total: 1 };
        const all = [...peerPerfs, tickerPerf].sort((a, b) => b - a);
        const rank = all.indexOf(tickerPerf) + 1;
        const percentile = 1 - (rank - 1) / all.length;
        return { rank, percentile, total: all.length };
  }

  computeRelativeStrengthLine(tickerCloses, benchCloses, len) {
        const rsLine = [];
        const minLen = Math.min(tickerCloses.length, benchCloses.length, len);
        for (let i = 0; i < minLen; i++) {
                const ti = tickerCloses.length - minLen + i;
                const bi = benchCloses.length - minLen + i;
                rsLine.push(benchCloses[bi] > 0 ? tickerCloses[ti] / benchCloses[bi] : 1);
        }
        return rsLine;
  }

  detectMomentumLeader(perf5, perf20, perf60) {
        if (perf5 > 0 && perf20 > 0 && perf60 > 0) {
                if (perf5 > perf20 && perf20 > perf60) return 'accelerating';
                return 'strong';
        }
        if (perf5 < 0 && perf20 < 0 && perf60 < 0) {
                if (perf5 < perf20 && perf20 < perf60) return 'deteriorating';
                return 'weak';
        }
        if (perf5 > 0 && perf60 < 0) return 'recovering';
        if (perf5 < 0 && perf60 > 0) return 'fading';
        return 'mixed';
  }

  compute(data) {
        const closes = (data.ohlcv_daily || []).map(c => c.close);
        const benchCloses = (data.spy_daily || data.benchmark_daily || data.ohlcv_daily || []).map(c => c.close);
        const peerData = data.peerCloses || {};

      const perf5 = this.computePerformance(closes, 5);
        const perf20 = this.computePerformance(closes, 20);
        const perf60 = this.computePerformance(closes, 60);

      const benchPerf5 = this.computePerformance(benchCloses, 5);
        const benchPerf20 = this.computePerformance(benchCloses, 20);
        const benchPerf60 = this.computePerformance(benchCloses, 60);

      const excessReturn5 = perf5 - benchPerf5;
        const excessReturn20 = perf20 - benchPerf20;
        const excessReturn60 = perf60 - benchPerf60;

      const peerPerf20 = Object.values(peerData).map(pCloses => this.computePerformance(pCloses, 20));
        const ranking = this.rankAmongPeers(perf20, peerPerf20);

      const rsLine = this.computeRelativeStrengthLine(closes, benchCloses, 20);
        const rsSlope = rsLine.length >= 5 ? slope(rsLine, 5) : 0;
        const rsTrending = rsSlope > 0.001 ? 'up' : rsSlope < -0.001 ? 'down' : 'flat';

      const momentum = this.detectMomentumLeader(perf5, perf20, perf60);

      const quarterlyStrength = perf60;

      let action = 'hold';
        let strength = 0;

      const isTopPerformer = ranking.percentile >= (1 - this.topPctThreshold);
        const isBottomPerformer = ranking.percentile <= this.bottomPctThreshold;

      if (isTopPerformer && rsTrending === 'up') {
              action = 'buy';
              strength = Math.min(0.8, 0.4 + ranking.percentile * 0.4);
      } else if (isTopPerformer && rsTrending === 'flat') {
              action = 'buy';
              strength = 0.35;
      } else if (isBottomPerformer && rsTrending === 'down') {
              action = 'sell';
              strength = Math.min(0.8, 0.4 + (1 - ranking.percentile) * 0.4);
      } else if (isBottomPerformer && rsTrending === 'flat') {
              action = 'sell';
              strength = 0.3;
      } else if (momentum === 'accelerating' && excessReturn20 > 0.02) {
              action = 'buy';
              strength = 0.4;
      } else if (momentum === 'deteriorating' && excessReturn20 < -0.02) {
              action = 'sell';
              strength = 0.4;
      } else if (momentum === 'recovering' && rsSlope > 0) {
              action = 'buy';
              strength = 0.25;
      } else if (momentum === 'fading' && rsSlope < 0) {
              action = 'sell';
              strength = 0.25;
      }

      return {
              action,
              strength,
              reason: `RelStrength: rank=${ranking.rank}/${ranking.total} (${(ranking.percentile * 100).toFixed(0)}%ile), momentum=${momentum}, RS trend=${rsTrending}, excess20=${(excessReturn20 * 100).toFixed(1)}%`,
              metrics: {
                        perf5: +(perf5 * 100).toFixed(2),
                        perf20: +(perf20 * 100).toFixed(2),
                        perf60: +(perf60 * 100).toFixed(2),
                        excessReturn5: +(excessReturn5 * 100).toFixed(2),
                        excessReturn20: +(excessReturn20 * 100).toFixed(2),
                        excessReturn60: +(excessReturn60 * 100).toFixed(2),
                        rank: ranking.rank,
                        totalPeers: ranking.total,
                        percentile: +ranking.percentile.toFixed(3),
                        rsTrend: rsTrending,
                        rsSlope: +rsSlope.toFixed(6),
                        momentum,
                        quarterlyStrength: +(quarterlyStrength * 100).toFixed(2)
              }
      };
  }
}

if (typeof module !== 'undefined' && module.exports) { module.exports = RelativeStrengthAgent; }
