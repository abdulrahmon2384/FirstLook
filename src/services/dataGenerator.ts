/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle } from '../types';

export function generateHistoricalData(count: number = 500, intervalSeconds: number = 3600): Candle[] {
  const data: Candle[] = [];
  let currentPrice = 50000; // Start at 50k (e.g., BTC)
  let currentTime = Math.floor(Date.now() / 1000) - (count * intervalSeconds);

  for (let i = 0; i < count; i++) {
    const volatility = 0.005; // 0.5% volatility per candle
    const change = currentPrice * volatility * (Math.random() - 0.5);
    
    const open = currentPrice;
    const close = currentPrice + change;
    const high = Math.max(open, close) + (Math.random() * currentPrice * volatility * 0.5);
    const low = Math.min(open, close) - (Math.random() * currentPrice * volatility * 0.5);
    const volume = Math.random() * 1000;

    data.push({
      time: currentTime,
      open,
      high,
      low,
      close,
      volume,
    });

    currentPrice = close;
    currentTime += intervalSeconds;
  }

  return data;
}
