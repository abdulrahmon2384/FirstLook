/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { ChartEngine } from './ChartEngine';
import { Candle, Trade, ChartTheme } from '../../types';
import { Drawing, DrawingType, DrawingPoint } from '../../types/drawing';

interface ChartProps {
  data: Candle[];
  trades: Trade[];
  theme?: ChartTheme;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  drawingTool?: DrawingType | null;
  drawings?: Drawing[];
  selectedId?: string | null;
  onDrawingsChange?: (drawings: Drawing[]) => void;
  onSelectDrawing?: (drawing: Drawing | null) => void;
  onDrawingComplete?: () => void;
}

export function ChartComponent({ 
  data, 
  trades, 
  theme, 
  onLoadMore, 
  isLoadingMore,
  drawingTool = null,
  drawings = [],
  selectedId = null,
  onDrawingsChange,
  onSelectDrawing,
  onDrawingComplete
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);

  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      engineRef.current = new ChartEngine(canvasRef.current);
    }
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setData(data, trades);
    }
  }, [data, trades]);

  useEffect(() => {
    if (engineRef.current && theme) {
      engineRef.current.setTheme(theme);
    }
  }, [theme]);

  useEffect(() => {
    if (engineRef.current && onLoadMore) {
      engineRef.current.setOnLoadMore(onLoadMore);
    }
  }, [onLoadMore]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setLoadingMore(!!isLoadingMore);
    }
  }, [isLoadingMore]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setDrawingTool(drawingTool);
    }
  }, [drawingTool]);

  useEffect(() => {
    if (engineRef.current) {
      if (onDrawingsChange) engineRef.current.setOnDrawingsChange(onDrawingsChange);
      if (onSelectDrawing) engineRef.current.setOnSelectDrawing(onSelectDrawing);
      if (onDrawingComplete) engineRef.current.setOnDrawingComplete(onDrawingComplete);
    }
  }, [onDrawingsChange, onSelectDrawing, onDrawingComplete]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setDrawings(drawings || []);
    }
  }, [drawings]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setSelectedDrawingId(selectedId || null);
    }
  }, [selectedId]);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && engineRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        engineRef.current.resize(width, height);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full bg-white relative overflow-hidden flex-1">
      <canvas ref={canvasRef} className="block w-full h-full touch-none" />
    </div>
  );
}
