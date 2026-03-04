const AgentBase = (typeof require !== 'undefined') ? require('./core/AgentBase') : window.AgentBase;
const { SMA, EMA, slope, returns } = (typeof require !== 'undefined') ? require('./core/indicators') : window.indicators;

class CycleTimingAgent extends AgentBase {
    constructor(ticker, config = {}) {
          super('CycleTimingAgent', ticker, config);
          this.cycleLengths = config.cycleLengths || [5, 10, 20, 40];
          this.seasonalWindow = config.seasonalWindow || 252;
    }

  findSwingPoints(closes, minSwing) {
        const highs = [];
        const lows = [];
        if (closes.length < 5) return { highs, lows };
        for (let i = 2; i < closes.length - 2; i++) {
                if (closes[i] > closes[i - 1] && closes[i] > closes[i - 2] && closes[i] > closes[i + 1] && closes[i] > closes[i + 2]) {
                          highs.push({ index: i, price: closes[i] });
                }
                if (closes[i] < closes[i - 1] && closes[i] < closes[i - 2] && closes[i] < closes[i + 1] && closes[i] < closes[i + 2]) {
                          lows.push({ index: i, price: closes[i] });
                }
        }
        return { highs, lows };
  }

  estimateDominantCycle(swings) {
        if (swings.length < 3) return { length: 20, confidence: 0 };
        const intervals = [];
        for (let i = 1; i < swings.length; i++) {
                intervals.push(swings[i].index - swings[i - 1].index);
        }
        const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
        const variance = intervals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / intervals.length;
        const stdDev = Math.sqrt(variance);
        const confidence = mean > 0 ? Math.max(0, 1 - stdDev / mean) : 0;
        return { length: Math.round(mean), confidence: +confidence.toFixed(3) };
  }

  cyclePhase(closes, cycleLen) {
        if (closes.length < cycleLen) return { phase: 'unknown', position: 0.5 };
        const segment = closes.slice(-cycleLen);
        const minIdx = segment.indexOf(Math.min(...segment));
        const maxIdx = segment.indexOf(Math.max(...segment));
        const position = (cycleLen - 1) / cycleLen;
        let phase = 'mid';
        const relPos = (cycleLen - 1 - minIdx) / cycleLen;
        if (relPos < 0.2) phase = 'bottom';
        else if (relPos < 0.4) phase = 'rising';
        else if (relPos < 0.6) phase = 'top';
        else if (relPos < 0.8) phase = 'falling';
        else phase = 'bottoming';

      const lastPricePos = (closes[closes.length - 1] - Math.min(...segment)) / (Math.max(...segment) - Math.min(...segment) || 1);
        return { phase, position: +lastPricePos.toFixed(3) };
  }

  dayOfWeekEffect(dailyData) {
        if (dailyData.length < 60) return { bestDay: -1, worstDay: -1, todayEdge: 0 };
        const dayReturns = [[], [], [], [], []];
        for (let i = 1; i < dailyData.length; i++) {
                const bar = dailyData[i];
                const prevBar = dailyData[i - 1];
                if (bar.date) {
                          const d = new Date(bar.date).getDay();
                          if (d >= 1 && d <= 5) {
                                      const ret = prevBar.close > 0 ? (bar.close - prevBar.close) / prevBar.close : 0;
                                      dayReturns[d - 1].push(ret);
                          }
                }
        }
        const avgByDay = dayReturns.map(arr => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
        const bestDay = avgByDay.indexOf(Math.max(...avgByDay));
        const worstDay = avgByDay.indexOf(Math.min(...avgByDay));
        const today = new Date().getDay();
        const todayEdge = today >= 1 && today <= 5 ? avgByDay[today - 1] : 0;
        return { bestDay, worstDay, todayEdge, avgByDay };
  }

  monthOfYearEffect(dailyData) {
        if (dailyData.length < 252) return { bestMonth: -1, worstMonth: -1, currentMonthEdge: 0 };
        const monthReturns = Array.from({ length: 12 }, () => []);
        for (let i = 20; i < dailyData.length; i++) {
                const bar = dailyData[i];
                const prevBar = dailyData[i - 20];
                if (bar.date && prevBar.date) {
                          const m = new Date(bar.date).getMonth();
                          const ret = prevBar.close > 0 ? (bar.close - prevBar.close) / prevBar.close : 0;
                          monthReturns[m].push(ret);
                }
        }
        const avgByMonth = monthReturns.map(arr => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
        const bestMonth = avgByMonth.indexOf(Math.max(...avgByMonth));
        const worstMonth = avgByMonth.indexOf(Math.min(...avgByMonth));
        const currentMonth = new Date().getMonth();
        return { bestMonth, worstMonth, currentMonthEdge: avgByMonth[currentMonth] };
  }

  waveStructure(closes) {
        if (closes.length < 20) return { wave: 'unknown', waveCount: 0 };
        const { highs, lows } = this.findSwingPoints(closes.slice(-60), 0);
        const points = [...highs.map(h => ({ ...h, type: 'H' })), ...lows.map(l => ({ ...l, type: 'L' }))].sort((a, b) => a.index - b.index);
        let upWaves = 0;
        let downWaves = 0;
        for (let i = 1; i < points.length; i++) {
                if (points[i].type === 'H' && points[i - 1].type === 'L') upWaves++;
                if (points[i].type === 'L' && points[i - 1].type === 'H') downWaves++;
        }
        const last = points.length > 0 ? points[points.length - 1] : null;
        let wave = 'unknown';
        if (last && last.type === 'L' && upWaves >= downWaves) wave = 'impulse-up';
        else if (last && last.type === 'H' && downWaves >= upWaves) wave = 'impulse-down';
        else if (last && last.type === 'L') wave = 'corrective-down';
        else if (last && last.type === 'H') wave = 'corrective-up';
        return { wave, waveCount: upWaves + downWaves };
  }

  compute(data) {
        const daily = data.ohlcv_daily || [];
        const closes = daily.map(c => c.close);

      const { highs, lows } = this.findSwingPoints(closes, 0);
        const lowCycle = this.estimateDominantCycle(lows);
        const highCycle = this.estimateDominantCycle(highs);

      const phase20 = this.cyclePhase(closes, 20);
        const phase40 = this.cyclePhase(closes, 40);
        const phaseDominant = this.cyclePhase(closes, lowCycle.length || 20);

      const dowEffect = this.dayOfWeekEffect(daily);
        const monthEffect = this.monthOfYearEffect(daily);
        const waveInfo = this.waveStructure(closes);

      let action = 'hold';
        let strength = 0;

      const cycleScore =
              (phaseDominant.phase === 'bottom' || phaseDominant.phase === 'bottoming' ? 2 : 0) +
              (phaseDominant.phase === 'rising' ? 1 : 0) +
              (phaseDominant.phase === 'top' || phaseDominant.phase === 'falling' ? -2 : 0) +
              (phase20.phase === 'bottom' || phase20.phase === 'bottoming' ? 1 : 0) +
              (phase20.phase === 'top' || phase20.phase === 'falling' ? -1 : 0) +
              (dowEffect.todayEdge > 0.001 ? 0.5 : dowEffect.todayEdge < -0.001 ? -0.5 : 0) +
              (monthEffect.currentMonthEdge > 0.01 ? 0.5 : monthEffect.currentMonthEdge < -0.01 ? -0.5 : 0) +
              (waveInfo.wave === 'impulse-up' ? 1 : 0) +
              (waveInfo.wave === 'impulse-down' ? -1 : 0);

      if (cycleScore >= 3) {
              action = 'buy';
              strength = Math.min(0.8, 0.3 + cycleScore * 0.1);
      } else if (cycleScore <= -3) {
              action = 'sell';
              strength = Math.min(0.8, 0.3 + Math.abs(cycleScore) * 0.1);
      } else if (cycleScore >= 1) {
              action = 'buy';
              strength = 0.2;
      } else if (cycleScore <= -1) {
              action = 'sell';
              strength = 0.2;
      }

      return {
              action,
              strength,
              reason: `Cycle: score=${cycleScore.toFixed(1)}, dominant=${lowCycle.length}d (conf=${lowCycle.confidence}), phase=${phaseDominant.phase}, wave=${waveInfo.wave}, DOW edge=${(dowEffect.todayEdge * 100).toFixed(2)}%`,
              metrics: {
                        cycleScore: +cycleScore.toFixed(2),
                        dominantCycleLength: lowCycle.length,
                        dominantCycleConfidence: lowCycle.confidence,
                        highCycleLength: highCycle.length,
                        phase20: phase20.phase,
                        phase20Position: phase20.position,
                        phase40: phase40.phase,
                        phaseDominant: phaseDominant.phase,
                        phaseDominantPosition: phaseDominant.position,
                        wave: waveInfo.wave,
                        waveCount: waveInfo.waveCount,
                        dayOfWeekEdge: +(dowEffect.todayEdge * 100).toFixed(3),
                        monthEdge: +(monthEffect.currentMonthEdge * 100).toFixed(3),
                        bestDayOfWeek: dowEffect.bestDay,
                        worstDayOfWeek: dowEffect.worstDay,
                        bestMonth: monthEffect.bestMonth,
                        worstMonth: monthEffect.worstMonth
              }
      };
  }
}

if (typeof module !== 'undefined' && module.exports) { module.exports = CycleTimingAgent; }
