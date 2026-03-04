const AgentBase = (typeof require !== 'undefined') ? require('./core/AgentBase') : window.AgentBase;
const { SMA, EMA, returns, slope } = (typeof require !== 'undefined') ? require('./core/indicators') : window.indicators;

class IntermarketAgent extends AgentBase {
    constructor(ticker, config = {}) {
          super('IntermarketAgent', ticker, config);
          this.corrWindow = config.corrWindow || 20;
          this.shortCorrWindow = config.shortCorrWindow || 10;
          this.divergenceThreshold = config.divergenceThreshold || 0.02;
    }

  correlate(arrA, arrB, len) {
        const a = arrA.slice(-len);
        const b = arrB.slice(-len);
        if (a.length < len || b.length < len) return 0;
        const meanA = a.reduce((s, v) => s + v, 0) / len;
        const meanB = b.reduce((s, v) => s + v, 0) / len;
        let num = 0, denA = 0, denB = 0;
        for (let i = 0; i < len; i++) {
                const da = a[i] - meanA;
                const db = b[i] - meanB;
                num += da * db;
                denA += da * da;
                denB += db * db;
        }
        const den = Math.sqrt(denA * denB);
        return den === 0 ? 0 : num / den;
  }

  betaCalc(tickerReturns, benchReturns, len) {
        const t = tickerReturns.slice(-len);
        const b = benchReturns.slice(-len);
        if (t.length < len || b.length < len) return 1;
        const meanT = t.reduce((s, v) => s + v, 0) / len;
        const meanB = b.reduce((s, v) => s + v, 0) / len;
        let cov = 0, varB = 0;
        for (let i = 0; i < len; i++) {
                cov += (t[i] - meanT) * (b[i] - meanB);
                varB += (b[i] - meanB) * (b[i] - meanB);
        }
        return varB === 0 ? 1 : cov / varB;
  }

  compute(data) {
        const closes = (data.ohlcv_daily || []).map(c => c.close);
        const spyCloses = (data.spy_daily || data.ohlcv_daily || []).map(c => c.close);
        const uvxyCloses = (data.uvxy_daily || []).map(c => c.close);
        const iefCloses = (data.ief_daily || []).map(c => c.close);
        const iwmCloses = (data.iwm_daily || []).map(c => c.close);

      const tickerRet = returns(closes);
        const spyRet = returns(spyCloses);
        const uvxyRet = returns(uvxyCloses);
        const iefRet = returns(iefCloses);
        const iwmRet = returns(iwmCloses);

      const spyUvxyCorr = uvxyRet.length >= this.corrWindow ? this.correlate(spyRet, uvxyRet, this.corrWindow) : -0.85;
        const spyIefCorr = iefRet.length >= this.corrWindow ? this.correlate(spyRet, iefRet, this.corrWindow) : -0.3;
        const spyIwmCorr = iwmRet.length >= this.corrWindow ? this.correlate(spyRet, iwmRet, this.corrWindow) : 0.9;
        const tickerSpyCorr = tickerRet.length >= this.corrWindow ? this.correlate(tickerRet, spyRet, this.corrWindow) : 0.7;

      const spyUvxyCorrShort = uvxyRet.length >= this.shortCorrWindow ? this.correlate(spyRet, uvxyRet, this.shortCorrWindow) : spyUvxyCorr;

      const uvxyDivergence = spyUvxyCorr > -0.5;
        const iefFlightToSafety = spyIefCorr < -0.5;
        const iwmBreadthWeak = spyIwmCorr < 0.7;

      const beta = this.betaCalc(tickerRet, spyRet, this.corrWindow);

      let riskScore = 0;
        if (uvxyDivergence) riskScore += 2;
        if (iefFlightToSafety) riskScore += 1.5;
        if (iwmBreadthWeak) riskScore += 1;
        if (spyUvxyCorrShort > -0.3) riskScore += 1;

      const regime = riskScore >= 4 ? 'risk-off' : riskScore >= 2 ? 'cautious' : 'risk-on';

      let action = 'hold';
        let strength = 0;

      if (regime === 'risk-on') {
              if (beta > 1.2) {
                        action = 'buy';
                        strength = Math.min(0.7, 0.4 + (beta - 1.2) * 0.3);
              } else if (beta > 0.8) {
                        action = 'buy';
                        strength = 0.3;
              } else {
                        action = 'hold';
                        strength = 0.2;
              }
      } else if (regime === 'risk-off') {
              if (beta > 1.2) {
                        action = 'sell';
                        strength = Math.min(0.9, 0.5 + (beta - 1.2) * 0.4);
              } else if (beta > 0.8) {
                        action = 'sell';
                        strength = 0.4;
              } else {
                        action = 'hold';
                        strength = 0.3;
              }
      } else {
              if (uvxyDivergence && beta > 1) {
                        action = 'sell';
                        strength = 0.3;
              } else if (!uvxyDivergence && !iefFlightToSafety) {
                        action = 'buy';
                        strength = 0.25;
              }
      }

      return {
              action,
              strength,
              reason: `Intermarket: regime=${regime}, beta=${beta.toFixed(2)}, SPY-UVXY r=${spyUvxyCorr.toFixed(2)}, SPY-IEF r=${spyIefCorr.toFixed(2)}, SPY-IWM r=${spyIwmCorr.toFixed(2)}`,
              metrics: {
                        regime,
                        beta: +beta.toFixed(3),
                        spyUvxyCorr: +spyUvxyCorr.toFixed(3),
                        spyIefCorr: +spyIefCorr.toFixed(3),
                        spyIwmCorr: +spyIwmCorr.toFixed(3),
                        tickerSpyCorr: +tickerSpyCorr.toFixed(3),
                        riskScore,
                        uvxyDivergence,
                        iefFlightToSafety,
                        iwmBreadthWeak
              }
      };
  }
}

if (typeof module !== 'undefined' && module.exports) { module.exports = IntermarketAgent; }
