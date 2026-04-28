/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  id: string;
  type: 'LONG' | 'SHORT';
  entryTime: number;
  entryPrice: number;
  exitTime?: number;
  exitPrice?: number;
  profit: number; // In currency
  profitPercent: number; // In percentage
}

export interface BacktestResult {
  trades: Trade[];
  equityCurve: { time: number; value: number }[];
  totalProfit: number;
  winRate: number;
  maxDrawdown: number;
  totalTrades: number;
  sharpeRatio: number;
}

export interface StrategyParams {
  emaFast: number;
  emaSlow: number;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
}

export interface ChartTheme {
  upColor: string;
  upBorder: string;
  upWick: string;
  downColor: string;
  downBorder: string;
  downWick: string;
  bg: string;
  grid: string;
  text: string;
  showGrid?: boolean;
}
