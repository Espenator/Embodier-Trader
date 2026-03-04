/**
 * Orchestrator.js — Agent Spawner & Signal Aggregator
 * 
 * The Orchestrator is the central brain of the Embodier Trader system.
 * It spawns trading agents for each ticker, feeds them market data,
 * collects their signals, and produces a weighted consensus signal.
 * 
 * Inspired by smarttrading.club's multi-indicator dashboard approach
 * where each metric (RSI, BBV, Trend, Pattern, Volume, Volatility)
 * contributes to an overall trading decision.
 */
const RSIAgent = typeof require !== 'undefined' ? require('./RSIAgent') : window.RSIAgent;
const BBVAgent = typeof require !== 'undefined' ? require('./BBVAgent') : window.BBVAgent;
const TrendAgent = typeof require !== 'undefined' ? require('./TrendAgent') : window.TrendAgent;
const MomentumAgent = typeof require !== 'undefined' ? require('./MomentumAgent') : window.MomentumAgent;
const VolatilityAgent = typeof require !== 'undefined' ? require('./VolatilityAgent') : window.VolatilityAgent;
const PatternAgent = typeof require !== 'undefined' ? require('./PatternAgent') : window.PatternAgent;
const VolumeAgent = typeof require !== 'undefined' ? require('./VolumeAgent') : window.VolumeAgent;

class Orchestrator {
    constructor(config = {}) {
          this.tickers = config.tickers || [];
          this.agents = {};  // { ticker: [agent1, agent2, ...] }
      this.signals = {}; // { ticker: { consensus, agents: [...] } }
      this.weights = config.weights || {
              RSIAgent: 1.0,
              BBVAgent: 0.9,
              TrendAgent: 1.2,
              MomentumAgent: 1.0,
              VolatilityAgent: 0.7,
              PatternAgent: 1.1,
              VolumeAgent: 0.8
      };
          this.history = [];  // recent consensus signals
      this.maxHistory = config.maxHistory || 100;
    }

  /**
     * Spawn a full agent suite for a ticker.
     */
  spawnAgents(ticker) {
        const agentConfigs = [
          { Class: RSIAgent, name: 'RSIAgent' },
          { Class: BBVAgent, name: 'BBVAgent' },
          { Class: TrendAgent, name: 'TrendAgent' },
          { Class: MomentumAgent, name: 'MomentumAgent' },
          { Class: VolatilityAgent, name: 'VolatilityAgent' },
          { Class: PatternAgent, name: 'PatternAgent' },
          { Class: VolumeAgent, name: 'VolumeAgent' }
              ];

      this.agents[ticker] = agentConfigs.map(({ Class, name }) => {
              const agent = new Class({ ticker, name: `${name}:${ticker}` });
              agent.init();
              return agent;
      });

      if (!this.tickers.includes(ticker)) {
              this.tickers.push(ticker);
      }

      return this.agents[ticker];
  }

  /**
     * Run all agents for a ticker with the given market data.
     * Returns a consensus signal.
     */
  run(ticker, data) {
        if (!this.agents[ticker]) {
                this.spawnAgents(ticker);
        }

      const agentSignals = [];

      for (const agent of this.agents[ticker]) {
              const signal = agent.run(data);
              if (signal) {
                        agentSignals.push({
                                    name: agent.name,
                                    signal,
                                    weight: this.weights[agent.name.split(':')[0]] || 1.0,
                                    computeMs: agent.lastComputeTime
                        });
              }
      }

      const consensus = this._computeConsensus(agentSignals);

      this.signals[ticker] = {
              ticker,
              timestamp: Date.now(),
              consensus,
              agents: agentSignals
      };

      // Track history
      this.history.push({ ticker, timestamp: Date.now(), ...consensus });
        if (this.history.length > this.maxHistory) {
                this.history = this.history.slice(-this.maxHistory);
        }

      return this.signals[ticker];
  }

  /**
     * Weighted consensus from all agent signals.
     */
  _computeConsensus(agentSignals) {
        if (agentSignals.length === 0) {
                return { action: 'hold', confidence: 0, reason: 'No agent signals' };
        }

      let buyScore = 0, sellScore = 0, totalWeight = 0;
        const reasons = [];

      for (const { name, signal, weight } of agentSignals) {
              const w = weight * signal.strength;
              totalWeight += weight;

          if (signal.action === 'buy') {
                    buyScore += w;
                    if (signal.strength >= 0.5) reasons.push(`${name}: ${signal.reason}`);
          } else if (signal.action === 'sell') {
                    sellScore += w;
                    if (signal.strength >= 0.5) reasons.push(`${name}: ${signal.reason}`);
          }
      }

      const netScore = totalWeight > 0 ? (buyScore - sellScore) / totalWeight : 0;
        const confidence = Math.abs(netScore);

      let action = 'hold';
        if (netScore > 0.15) action = 'buy';
        else if (netScore < -0.15) action = 'sell';

      return {
              action,
              confidence: Math.min(1, confidence),
              netScore: netScore.toFixed(3),
              buyScore: buyScore.toFixed(3),
              sellScore: sellScore.toFixed(3),
              agentCount: agentSignals.length,
              reasons
      };
  }

  /**
     * Run all tickers.
     */
  runAll(dataByTicker) {
        const results = {};
        for (const ticker of this.tickers) {
                if (dataByTicker[ticker]) {
                          results[ticker] = this.run(ticker, dataByTicker[ticker]);
                }
        }
        return results;
  }

  /**
     * Get dashboard status for all agents across all tickers.
     */
  getStatus() {
        const status = {};
        for (const ticker of this.tickers) {
                status[ticker] = {
                          signal: this.signals[ticker] || null,
                          agents: (this.agents[ticker] || []).map(a => a.getStatus())
                };
        }
        return {
                tickers: this.tickers,
                agentCount: Object.values(this.agents).reduce((sum, arr) => sum + arr.length, 0),
                status
        };
  }

  /**
     * Destroy all agents for a ticker.
     */
  removeTicker(ticker) {
        if (this.agents[ticker]) {
                this.agents[ticker].forEach(a => a.destroy());
                delete this.agents[ticker];
        }
        delete this.signals[ticker];
        this.tickers = this.tickers.filter(t => t !== ticker);
  }

  /**
     * Destroy everything.
     */
  shutdown() {
        for (const ticker of [...this.tickers]) {
                this.removeTicker(ticker);
        }
        this.history = [];
  }
}

// Export for both browser and Node
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Orchestrator;
}
