/**
 * SectorSentimentAgent.js — Sector Rotation & Market Breadth Agent
 * 
 * Analyzes sector strength/weakness, sector rotation, and overall
 * market sentiment breadth. Directly maps to smarttrading.club's:
 * - Sector Sentiment (e.g., "76% Bullish")
 * - Strong Sectors / Weak Sectors breakdown with percentages
 * - Strong/Weak Large Cap, Strong/Weak ETF, Strong/Weak Trendy Stocks
 * - SPY-IWM correlation (risk-on/off gauge)
 * - Sector forecast ("Large cap value IVE will advance...")
 * - Internal strength / Market Behaviors
 * 
 * Core idea: when most sectors are strong and breadth is wide,
 * buying conditions are favorable. Narrow rallies are fragile.
 */
const AgentBase = typeof require !== 'undefined' ? require('./core/AgentBase') : window.AgentBase;
const Indicators = typeof require !== 'undefined' ? require('./core/indicators') : window.Indicators;

class SectorSentimentAgent extends AgentBase {
    constructor(config = {}) {
          super({
                  name: 'SectorSentimentAgent',
                  ...config
          });
          // Sector ETFs used as proxies for each sector
      this.sectorETFs = config.sectorETFs || [
              'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP',
              'XLB', 'XLU', 'XLRE', 'XLC', 'SMH', 'XBI', 'XRT'
            ];
          this.bullishThreshold = config.bullishThreshold || 0.6;
          this.bearishThreshold = config.bearishThreshold || 0.4;
    }

  compute(data) {
        // Expects data.sectors: { ETF: { closes: [], quarterlyReturn, weeklyReturn } }
      // Or falls back to using this ticker's data for a simpler version
      const sectors = data.sectors || {};
        const sectorKeys = Object.keys(sectors);

      // If no sector data, analyze the ticker's own quarterly strength + trend
      if (sectorKeys.length === 0) {
              return this._analyzeTickerOnly(data);
      }

      let bullCount = 0, bearCount = 0, neutralCount = 0;
        const strongSectors = [];
        const weakSectors = [];
        let totalReturn = 0;

      for (const etf of sectorKeys) {
              const sec = sectors[etf];
              const closes = sec.closes || [];
              if (closes.length < 20) continue;

          const weeklyReturn = sec.weeklyReturn || 0;
              const trend = Indicators.trendDirection(closes, 10, 50);
              const rsiValues = Indicators.rsi(closes, 14);
              const rsi = Indicators.last(rsiValues);

          totalReturn += weeklyReturn;

          if (trend === 'up' && weeklyReturn > 0) {
                    bullCount++;
                    strongSectors.push({ etf, weeklyReturn, trend, rsi });
          } else if (trend === 'down' && weeklyReturn < 0) {
                    bearCount++;
                    weakSectors.push({ etf, weeklyReturn, trend, rsi });
          } else {
                    neutralCount++;
          }
      }

      const total = bullCount + bearCount + neutralCount;
        const bullPct = total > 0 ? bullCount / total : 0.5;
        const avgReturn = total > 0 ? totalReturn / total : 0;

      // Breadth analysis: are most sectors participating?
      const breadth = bullPct;

      // SPY vs IWM spread (risk-on/off proxy)
      let riskAppetite = 'neutral';
        if (sectors.SPY && sectors.IWM) {
                const spyReturn = sectors.SPY.weeklyReturn || 0;
                const iwmReturn = sectors.IWM.weeklyReturn || 0;
                if (iwmReturn > spyReturn + 0.005) riskAppetite = 'risk-on';
                else if (spyReturn > iwmReturn + 0.005) riskAppetite = 'risk-off';
        }

      // Sector rotation signal
      let rotationSignal = 'none';
        if (strongSectors.length > 0 && weakSectors.length > 0) {
                const topStrong = strongSectors.sort((a, b) => b.weeklyReturn - a.weeklyReturn)[0];
                const topWeak = weakSectors.sort((a, b) => a.weeklyReturn - b.weeklyReturn)[0];
                // Defensive sectors strong + growth weak = late cycle
          const defensives = ['XLU', 'XLP', 'XLV', 'GLD', 'TLT'];
                const growth = ['XLK', 'SMH', 'XLY', 'XBI', 'XRT'];
                if (defensives.includes(topStrong.etf) && growth.includes(topWeak.etf)) {
                          rotationSignal = 'late-cycle-defensive';
                } else if (growth.includes(topStrong.etf) && defensives.includes(topWeak.etf)) {
                          rotationSignal = 'early-cycle-growth';
                }
        }

      let action = 'hold';
        let strength = 0;
        let reason = '';

      if (bullPct >= this.bullishThreshold) {
              action = 'buy';
              strength = Math.min(0.8, bullPct);
              reason = `Broad bullish sentiment (${(bullPct * 100).toFixed(0)}% sectors up)`;
              if (riskAppetite === 'risk-on') {
                        strength = Math.min(0.9, strength + 0.1);
                        reason += ', risk-on (small caps leading)';
              }
      } else if (bullPct <= this.bearishThreshold) {
              action = 'sell';
              strength = Math.min(0.8, 1 - bullPct);
              reason = `Broad bearish sentiment (${((1 - bullPct) * 100).toFixed(0)}% sectors down)`;
              if (riskAppetite === 'risk-off') {
                        strength = Math.min(0.9, strength + 0.1);
                        reason += ', risk-off (flight to safety)';
              }
      } else {
              reason = `Mixed sentiment (${(bullPct * 100).toFixed(0)}% bullish)`;
              if (rotationSignal === 'late-cycle-defensive') {
                        action = 'sell';
                        strength = 0.4;
                        reason += ' — late-cycle rotation to defensives';
              } else if (rotationSignal === 'early-cycle-growth') {
                        action = 'buy';
                        strength = 0.4;
                        reason += ' — early-cycle rotation to growth';
              }
      }

      return {
              action,
              strength,
              reason,
              metrics: {
                        bullPct: (bullPct * 100).toFixed(0) + '%',
                        strongCount: bullCount,
                        weakCount: bearCount,
                        neutralCount,
                        riskAppetite,
                        rotationSignal,
                        avgWeeklyReturn: (avgReturn * 100).toFixed(2) + '%',
                        strongSectors: strongSectors.slice(0, 3).map(s => s.etf),
                        weakSectors: weakSectors.slice(0, 3).map(s => s.etf)
              }
      };
  }

  _analyzeTickerOnly(data) {
        const closes = (data.ohlcv_daily || []).map(c => c.close);
        if (closes.length < 63) {
                return { action: 'hold', strength: 0, reason: 'Insufficient data for sentiment' };
        }
        // Quarterly strength: return over ~63 trading days
      const qReturn = (closes[closes.length - 1] - closes[closes.length - 63]) / closes[closes.length - 63];
        const trend = Indicators.trendDirection(closes, 10, 50);

      let action = 'hold';
        let strength = 0;
        let reason = `Quarterly return ${(qReturn * 100).toFixed(1)}%, trend: ${trend}`;

      if (qReturn > 0.05 && trend === 'up') {
              action = 'buy';
              strength = Math.min(0.6, qReturn * 3);
              reason = `Strong quarterly (+${(qReturn * 100).toFixed(1)}%) in uptrend`;
      } else if (qReturn < -0.05 && trend === 'down') {
              action = 'sell';
              strength = Math.min(0.6, Math.abs(qReturn) * 3);
              reason = `Weak quarterly (${(qReturn * 100).toFixed(1)}%) in downtrend`;
      }

      return { action, strength, reason, metrics: { quarterlyReturn: qReturn, trend } };
  }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SectorSentimentAgent;
}
