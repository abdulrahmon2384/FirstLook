/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle, Trade, BacktestResult, StrategyParams } from '../types';

export function runBacktest(data: Candle[], params: StrategyParams): BacktestResult {
  const { emaFast, emaSlow } = params;
  const trades: Trade[] = [];
  const equityCurve: { time: number; value: number }[] = [];
  let balance = 10000; // Starting with $10k
  let currentPosition: Trade | null = null;

  // Calculate EMAs
  const fastEMAValues = calculateEMA(data.map(d => d.close), emaFast);
  const slowEMAValues = calculateEMA(data.map(d => d.close), emaSlow);

  equityCurve.push({ time: data[0].time, value: balance });

  for (let i = 1; i < data.length; i++) {
    const prevFast = fastEMAValues[i - 1];
    const prevSlow = slowEMAValues[i - 1];
    const currFast = fastEMAValues[i];
    const currSlow = slowEMAValues[i];

    // Simple EMA Crossover Strategy
    // Long when fast crosses above slow
    if (currFast > currSlow && prevFast <= prevSlow && !currentPosition) {
      currentPosition = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'LONG',
        entryTime: data[i].time,
        entryPrice: data[i].close,
        profit: 0,
        profitPercent: 0,
      };
    }
    // Exit long when fast crosses below slow
    else if (currFast < currSlow && prevFast >= prevSlow && currentPosition) {
      currentPosition.exitTime = data[i].time;
      currentPosition.exitPrice = data[i].close;
      currentPosition.profit = (currentPosition.exitPrice - currentPosition.entryPrice) * (balance / currentPosition.entryPrice);
      currentPosition.profitPercent = ((currentPosition.exitPrice - currentPosition.entryPrice) / currentPosition.entryPrice) * 100;
      
      balance += currentPosition.profit;
      trades.push(currentPosition);
      currentPosition = null;
    }

    equityCurve.push({ time: data[i].time, value: balance + (currentPosition ? (data[i].close - currentPosition.entryPrice) * (balance / currentPosition.entryPrice) : 0) });
  }

  const totalProfit = balance - 10000;
  const winRate = trades.length > 0 ? (trades.filter(t => t.profit > 0).length / trades.length) * 100 : 0;
  
  // Max Drawdown calculation
  let maxEquity = 10000;
  let maxDD = 0;
  for (const point of equityCurve) {
    if (point.value > maxEquity) maxEquity = point.value;
    const dd = (maxEquity - point.value) / maxEquity;
    if (dd > maxDD) maxDD = dd;
  }

  return {
    trades,
    equityCurve,
    totalProfit,
    winRate,
    maxDrawdown: maxDD * 100,
    totalTrades: trades.length,
    sharpeRatio: 1.5, // Placeholder for now
  };
}

function calculateEMA(data: number[], period: number): number[] {
  const ema = [];
  const k = 2 / (period + 1);
  let prevEMA = data[0];
  ema.push(prevEMA);

  for (let i = 1; i < data.length; i++) {
    const currEMA = data[i] * k + prevEMA * (1 - k);
    ema.push(currEMA);
    prevEMA = currEMA;
  }
  return ema;
}
