const AgentBase = (typeof require !== 'undefined') ? require('./core/AgentBase') : window.AgentBase;
const RSIAgent = (typeof require !== 'undefined') ? require('./RSIAgent') : window.RSIAgent;
const BBVAgent = (typeof require !== 'undefined') ? require('./BBVAgent') : window.BBVAgent;
const TrendAgent = (typeof require !== 'undefined') ? require('./TrendAgent') : window.TrendAgent;
const MomentumAgent = (typeof require !== 'undefined') ? require('./MomentumAgent') : window.MomentumAgent;
const VolatilityAgent = (typeof require !== 'undefined') ? require('./VolatilityAgent') : window.VolatilityAgent;
const PatternAgent = (typeof require !== 'undefined') ? require('./PatternAgent') : window.PatternAgent;
const VolumeAgent = (typeof require !== 'undefined') ? require('./VolumeAgent') : window.VolumeAgent;
const SectorSentimentAgent = (typeof require !== 'undefined') ? require('./SectorSentimentAgent') : window.SectorSentimentAgent;
const EMATrendAgent = (typeof require !== 'undefined') ? require('./EMATrendAgent') : window.EMATrendAgent;
const IntermarketAgent = (typeof require !== 'undefined') ? require('./IntermarketAgent') : window.IntermarketAgent;
const EarningsCatalystAgent = (typeof require !== 'undefined') ? require('./EarningsCatalystAgent') : window.EarningsCatalystAgent;
const RelativeStrengthAgent = (typeof require !== 'undefined') ? require('./RelativeStrengthAgent') : window.RelativeStrengthAgent;
const CycleTimingAgent = (typeof require !== 'undefined') ? require('./CycleTimingAgent') : window.CycleTimingAgent;

class Orchestrator {
        constructor(config = {}) {
                  this.config = config;
                  this.agentWeights = config.agentWeights || {
                              RSIAgent: 1.0,
                              BBVAgent: 0.9,
                              TrendAgent: 1.2,
                              MomentumAgent: 1.0,
                              VolatilityAgent: 0.7,
                              PatternAgent: 1.1,
                              VolumeAgent: 0.8,
                              SectorSentimentAgent: 0.9,
                              EMATrendAgent: 1.1,
                              IntermarketAgent: 1.0,
                              EarningsCatalystAgent: 0.8,
                              RelativeStrengthAgent: 1.0,
                              CycleTimingAgent: 0.7
                  };
                  this.tickers = new Map();
        }

  spawnAgents(ticker) {
            if (this.tickers.has(ticker)) return this.tickers.get(ticker);
            const agents = [
                        new RSIAgent(ticker, this.config.rsi),
                        new BBVAgent(ticker, this.config.bbv),
                        new TrendAgent(ticker, this.config.trend),
                        new MomentumAgent(ticker, this.config.momentum),
                        new VolatilityAgent(ticker, this.config.volatility),
                        new PatternAgent(ticker, this.config.pattern),
                        new VolumeAgent(ticker, this.config.volume),
                        new SectorSentimentAgent(ticker, this.config.sectorSentiment),
                        new EMATrendAgent(ticker, this.config.emaTrend),
                        new IntermarketAgent(ticker, this.config.intermarket),
                        new EarningsCatalystAgent(ticker, this.config.earningsCatalyst),
                        new RelativeStrengthAgent(ticker, this.config.relativeStrength),
                        new CycleTimingAgent(ticker, this.config.cycleTiming)
                      ];
            this.tickers.set(ticker, agents);
            return agents;
  }

  async analyze(ticker, data) {
            const agents = this.spawnAgents(ticker);
            const results = [];

          for (const agent of agents) {
                      try {
                                    await agent.init();
                                    const signal = agent.compute(data);
                                    results.push({ agent: agent.name, signal });
                      } catch (err) {
                                    console.error(`[Orchestrator] ${agent.name} failed for ${ticker}:`, err.message);
                                    results.push({ agent: agent.name, signal: { action: 'hold', strength: 0, reason: 'error', metrics: {} } });
                      }
          }

          const consensus = this.aggregate(results);
            return { ticker, agents: results, consensus };
  }

  aggregate(results) {
            let buyScore = 0, sellScore = 0, totalWeight = 0;
            const reasons = [];

          for (const { agent, signal } of results) {
                      const w = this.agentWeights[agent] || 1.0;
                      totalWeight += w;
                      if (signal.action === 'buy') {
                                    buyScore += signal.strength * w;
                      } else if (signal.action === 'sell') {
                                    sellScore += signal.strength * w;
                      }
                      if (signal.strength > 0.3) {
                                    reasons.push(`${agent}:${signal.action}(${signal.strength.toFixed(2)})`);
                      }
          }

          const netScore = totalWeight > 0 ? (buyScore - sellScore) / totalWeight : 0;
            const confidence = totalWeight > 0 ? (buyScore + sellScore) / totalWeight : 0;

          let action = 'hold';
            if (netScore > 0.15) action = 'buy';
            else if (netScore < -0.15) action = 'sell';

          const agreeCount = results.filter(r => r.signal.action === action && r.signal.strength > 0.2).length;
            const unanimity = results.length > 0 ? agreeCount / results.length : 0;

          return {
                      action,
                      netScore: +netScore.toFixed(4),
                      confidence: +confidence.toFixed(4),
                      buyScore: +buyScore.toFixed(4),
                      sellScore: +sellScore.toFixed(4),
                      unanimity: +unanimity.toFixed(3),
                      agentsAgreeing: agreeCount,
                      totalAgents: results.length,
                      topReasons: reasons.slice(0, 5),
                      timestamp: Date.now()
          };
  }

  removeAgents(ticker) {
            if (this.tickers.has(ticker)) {
                        const agents = this.tickers.get(ticker);
                        agents.forEach(a => { if (a.destroy) a.destroy(); });
                        this.tickers.delete(ticker);
            }
  }

  listTickers() {
            return [...this.tickers.keys()];
  }

  getAgentNames() {
            return Object.keys(this.agentWeights);
  }
}

if (typeof module !== 'undefined' && module.exports) { module.exports = Orchestrator; }
