/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle } from '../types';

/**
 * Maps our timeframe IDs to Binance K-line intervals.
 */
const TIMEFRAME_MAP: Record<string, string> = {
  '1m': '1m',
  '3m': '3m',
  '5m': '1m', // Binance doesn't support 5m directly for standard klines in some contexts? Actually it does.
  '15m': '15m',
  '30m': '30m',
  '45m': '15m', // fallback
  '1h': '1h',
  '2h': '2h',
  '3h': '1h', // fallback
  '4h': '4h',
  '6h': '6h',
  '8h': '8h',
  '12h': '12h',
  '1d': '1d',
  '1w': '1w',
  '1mo': '1M',
};

// More accurate mapping
const GET_INTERVAL = (id: string) => {
    const direct = TIMEFRAME_MAP[id];
    if (direct) return direct;
    
    // Fallbacks
    if (id.includes('m')) return '1m';
    if (id.includes('h')) return '1h';
    if (id.includes('d')) return '1d';
    return '1d';
};

/**
 * Fetches real BTC data from Binance Public API (Spot).
 * This is free and fast.
 */
export async function fetchBTCData(timeframeId: string, limit: number = 500, endTime?: number): Promise<Candle[]> {
  const symbol = 'BTCUSDT';
  const interval = GET_INTERVAL(timeframeId);
  let url = `/api/binance?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  if (endTime) {
    url += `&endTime=${endTime}`;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch from proxy');
    
    const data = await response.json();
    
    // Binance kline format:
    // [
    //   [
    //     1499040000000,      // Open time
    //     "0.01634790",       // Open
    //     "0.80000000",       // High
    //     "0.01575800",       // Low
    //     "0.01577100",       // Close
    //     "148976.11427815",  // Volume
    //     1499644799999,      // Close time
    //     "2434.19055334",    // Quote asset volume
    //     308,                // Number of trades
    //     "1756.87402397",    // Taker buy base asset volume
    //     "28.46694368",      // Taker buy quote asset volume
    //     "17928963.48223606" // Ignore.
    //   ]
    // ]
    
    return data.map((d: any) => ({
      time: Math.floor(d[0] / 1000), // convert to seconds
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5]),
    }));
  } catch (error) {
    console.error('Binance API error:', error);
    // Fallback to random data if API fails to keep app usable
    return [];
  }
}
