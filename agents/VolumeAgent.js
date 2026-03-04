/**
 * VolumeAgent.js — Volume Analysis & VWAP Agent
 * 
 * Analyzes volume patterns, VWAP position, and unusual volume spikes.
 * Maps to smarttrading.club's Volume Change, Most Active Stocks/ETFs,
 * and Trading Volume metrics.
 * 
 * Volume confirms or denies price moves — high volume = conviction.
 */
const AgentBase = typeof require !== 'undefined' ? require('./core/AgentBase') : window.AgentBase;
const Indicators = typeof require !== 'undefined' ? require('./core/indicators') : window.Indicators;

class VolumeAgent extends AgentBase {
    constructor(config = {}) {
          super({
                  name: 'VolumeAgent',
                  ...config
          });
          this.avgVolPeriod = config.avgVolPeriod || 20;
          this.spikeMultiple = config.spikeMultiple || 2.0; // 2x avg = spike
    }

  compute(data) {
        const daily = data.ohlcv_daily || [];
        const closes = daily.map(c => c.close);
        const volumes = daily.map(c => c.volume);
        const highs = daily.map(c => c.high);
        const lows = daily.map(c => c.low);

      if (volumes.length < this.avgVolPeriod) {
              return { action: 'hold', strength: 0, reason: 'Insufficient volume data' };
      }

      const currentVol = volumes[volumes.length - 1];
        const avgVol = volumes.slice(-this.avgVolPeriod).reduce((a, b) => a + b, 0) / this.avgVolPeriod;
        const volRatio = avgVol > 0 ? currentVol / avgVol : 1;

      // VWAP analysis
      const vwapValues = Indicators.vwap(highs, lows, closes, volumes);
        const currentVWAP = Indicators.last(vwapValues);
        const price = closes[closes.length - 1];
        const priceVsVWAP = currentVWAP > 0 ? (price - currentVWAP) / currentVWAP : 0;

      // Price direction for context
      const dayReturn = closes.length >= 2
          ? (price - closes[closes.length - 2]) / closes[closes.length - 2]
              : 0;

      // Volume trend (increasing or decreasing over 5 days)
      const volSlope = Indicators.slope(volumes.slice(-5), 5);

      // Is volume confirming the price move?
      const volumeConfirms = (dayReturn > 0 && volRatio > 1.3) || (dayReturn < 0 && volRatio > 1.3);

      let action = 'hold';
        let strength = 0;
        let reason = '';

      // High volume spike with price above VWAP = bullish confirmation
      if (volRatio >= this.spikeMultiple && dayReturn > 0 && priceVsVWAP > 0) {
              action = 'buy';
              strength = Math.min(0.8, 0.4 + volRatio * 0.1);
              reason = `Volume spike (${volRatio.toFixed(1)}x avg) + price above VWAP — strong buying`;
      }
        // High volume spike with price below VWAP = bearish
      else if (volRatio >= this.spikeMultiple && dayReturn < 0 && priceVsVWAP < 0) {
              action = 'sell';
              strength = Math.min(0.8, 0.4 + volRatio * 0.1);
              reason = `Volume spike (${volRatio.toFixed(1)}x avg) + price below VWAP — heavy selling`;
      }
        // Price rising but volume fading = weak rally
      else if (dayReturn > 0.01 && volRatio < 0.7) {
              action = 'sell';
              strength = 0.3;
              reason = `Price up but volume fading (${volRatio.toFixed(1)}x) — weak rally`;
      }
        // Price falling but volume fading = weak selloff
      else if (dayReturn < -0.01 && volRatio < 0.7) {
              action = 'buy';
              strength = 0.3;
              reason = `Price down but volume fading (${volRatio.toFixed(1)}x) — weak selloff`;
      }
        // Climax volume (extreme) often marks reversals
      else if (volRatio > 3.0) {
              action = dayReturn > 0 ? 'sell' : 'buy';
              strength = 0.5;
              reason = `Climax volume (${volRatio.toFixed(1)}x) — potential exhaustion reversal`;
      }
        else {
                reason = `Normal volume (${volRatio.toFixed(1)}x avg)`;
        }

      return {
              action,
              strength,
              reason,
              metrics: {
                        currentVolume: currentVol,
                        avgVolume: avgVol,
                        volRatio,
                        vwap: currentVWAP,
                        priceVsVWAP: (priceVsVWAP * 100).toFixed(2) + '%',
                        volSlope,
                        volumeConfirms
              }
      };
  }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = VolumeAgent;
}
