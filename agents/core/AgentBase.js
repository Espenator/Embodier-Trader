/**
 * AgentBase.js — Embodier Trader Agent Foundation
 * 
 * Every agent in the system extends this class. It provides:
 * - Lifecycle management (init, compute, destroy)
 * - Signal emission via pub/sub
 * - Self-identification and status reporting
 * - Heartbeat tracking so the orchestrator knows who's alive
 * 
 * To create a new agent: extend this class, override compute(), 
 * and call this.emit() with your signal.
 */
class AgentBase {
    constructor(config = {}) {
          this.id = config.id || this._generateId();
          this.name = config.name || 'UnnamedAgent';
          this.ticker = config.ticker || null;
          this.timeframe = config.timeframe || 'all';
          this.status = 'initialized';       // initialized | running | paused | destroyed
      this.lastSignal = null;
          this.lastComputeTime = null;
          this.computeCount = 0;
          this.errors = [];
          this._subscribers = [];
          this.config = config;

      // Every agent gets a creation timestamp
      this.createdAt = Date.now();
    }

  /**
     * Initialize the agent with any startup data or calibration.
     * Override in subclass if needed.
     */
  init(historicalData) {
        this.status = 'running';
        return this;
  }

  /**
     * Core computation method — MUST be overridden by every agent.
     * Receives market data, returns a signal object.
     * @param {Object} data - { ohlcv_10min: [], ohlcv_hourly: [], ohlcv_daily: [], ohlcv_weekly: [] }
     * @returns {Object} signal - agent-specific signal object
     */
  compute(data) {
        throw new Error(`${this.name}: compute() must be implemented by subclass`);
  }

  /**
     * Safe compute wrapper — handles errors, tracks timing, emits signal.
     * The orchestrator calls this, not compute() directly.
     */
  run(data) {
        if (this.status === 'destroyed' || this.status === 'paused') return null;

      const startTime = performance.now();
        try {
                const signal = this.compute(data);
                this.lastSignal = signal;
                this.lastComputeTime = performance.now() - startTime;
                this.computeCount++;
                this.emit(signal);
                return signal;
        } catch (err) {
                this.errors.push({ time: Date.now(), error: err.message });
                console.error(`[${this.name}:${this.ticker}] Error:`, err.message);
                return null;
        }
  }

  /**
     * Subscribe to this agent's signals.
     */
  subscribe(callback) {
        this._subscribers.push(callback);
        return () => {
                this._subscribers = this._subscribers.filter(cb => cb !== callback);
        };
  }

  /**
     * Emit a signal to all subscribers.
     */
  emit(signal) {
        const envelope = {
                agentId: this.id,
                agentName: this.name,
                ticker: this.ticker,
                timestamp: Date.now(),
                computeMs: this.lastComputeTime,
                signal: signal
        };
        this._subscribers.forEach(cb => cb(envelope));
  }

  /**
     * Pause this agent (orchestrator can resume later).
     */
  pause() {
        this.status = 'paused';
  }

  /**
     * Resume a paused agent.
     */
  resume() {
        if (this.status === 'paused') this.status = 'running';
  }

  /**
     * Destroy this agent — clean up resources.
     */
  destroy() {
        this.status = 'destroyed';
        this._subscribers = [];
        this.lastSignal = null;
  }

  /**
     * Status report for the orchestrator dashboard.
     */
  getStatus() {
        return {
                id: this.id,
                name: this.name,
                ticker: this.ticker,
                status: this.status,
                computeCount: this.computeCount,
                lastComputeMs: this.lastComputeTime,
                errorCount: this.errors.length,
                lastSignal: this.lastSignal,
                uptime: Date.now() - this.createdAt
        };
  }

  _generateId() {
        return 'agent_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }
}

// Export for both browser and Node
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AgentBase;
}
