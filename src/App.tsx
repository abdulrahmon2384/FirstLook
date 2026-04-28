/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, memo } from 'react';
import { motion, AnimatePresence, useSpring } from 'motion/react';
import { 
  TrendingUp, 
  Activity, 
  History, 
  Settings2, 
  BarChart3, 
  ArrowUpRight, 
  ArrowDownRight,
  Maximize2,
  RefreshCcw,
  Zap,
  Bitcoin,
  Settings,
  Wallet,
  Briefcase,
  User,
  LayoutGrid,
  Clock,
  Pencil,
  BarChart2,
  Play,
  ChevronDown
} from 'lucide-react';
import { ChartComponent } from './components/Chart/ChartComponent';
import { DrawingToolbar } from './components/DrawingToolbar';
import { DrawingSettingsBox } from './components/DrawingSettingsBox';
import { DrawingType, Drawing } from './types/drawing';
import { fetchBTCData } from './services/binanceService';
import { runBacktest } from './services/backtestEngine';
import { StrategyParams, BacktestResult, Candle, ChartTheme } from './types';

const TIMEFRAMES = [
  { id: '1m', label: '1m', seconds: 60 },
  { id: '3m', label: '3m', seconds: 180 },
  { id: '5m', label: '5m', seconds: 300 },
  { id: '15m', label: '15m', seconds: 900 },
  { id: '30m', label: '30m', seconds: 1800 },
  { id: '45m', label: '45m', seconds: 2700 },
  { id: '1h', label: '1h', seconds: 3600 },
  { id: '2h', label: '2h', seconds: 7200 },
  { id: '3h', label: '3h', seconds: 10800 },
  { id: '4h', label: '4h', seconds: 14400 },
  { id: '6h', label: '6h', seconds: 21600 },
  { id: '12h', label: '12h', seconds: 43200 },
  { id: '1d', label: '1D', seconds: 86400 },
  { id: '1w', label: '1W', seconds: 604800 },
  { id: '1mo', label: '1M', seconds: 2592000 },
];

const DEFAULT_THEME: ChartTheme = {
  bg: '#0B0F19',
  grid: '#1e293b',
  text: '#64748b',
  upColor: '#10b981',
  upBorder: '#10b981',
  upWick: '#10b981',
  downColor: '#ef4444',
  downBorder: '#ef4444',
  downWick: '#ef4444',
  showGrid: true
};

const MemoizedChart = memo(ChartComponent);

export default function App() {
  const [params, setParams] = useState<StrategyParams>({
    emaFast: 9,
    emaSlow: 21,
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30
  });

  const [historicalData, setHistoricalData] = useState<Candle[]>([]);
  const [isLoadingPast, setIsLoadingPast] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chart' | 'drawings' | 'orders' | 'history' | 'settings'>('chart');
  const [selectedTimeframe, setSelectedTimeframe] = useState(TIMEFRAMES[6]); // Default to 1h
  const [isTimeframeOpen, setIsTimeframeOpen] = useState(false);
  const [theme, setTheme] = useState<ChartTheme>(() => {
    const saved = localStorage.getItem('chart_theme');
    return saved ? JSON.parse(saved) : DEFAULT_THEME;
  });
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingType | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);

  const updateDrawing = (id: string, updates: Partial<Drawing>) => {
    setDrawings(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    if (selectedDrawing?.id === id) {
      setSelectedDrawing(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const deleteDrawing = (id: string) => {
    setDrawings(prev => prev.filter(d => d.id !== id));
    if (selectedDrawing?.id === id) setSelectedDrawing(null);
  };

  useEffect(() => {
    localStorage.setItem('chart_theme', JSON.stringify(theme));
  }, [theme]);

  useEffect(() => {
    // Fetch real BTC data from Binance
    const loadData = async () => {
      const data = await fetchBTCData(selectedTimeframe.id, 300);
      if (data.length > 0) {
        setHistoricalData(data);
      }
    };
    loadData();
  }, [selectedTimeframe]);

  const loadMorePast = async () => {
    if (isLoadingPast || historicalData.length === 0) return;
    
    setIsLoadingPast(true);
    try {
      const oldestCandle = historicalData[0];
      // Binance endTime is inclusive, so we subtract 1ms to get previous data
      const endTime = oldestCandle.time * 1000 - 1;
      const olderData = await fetchBTCData(selectedTimeframe.id, 300, endTime);
      
      if (olderData.length > 0) {
        setHistoricalData(prev => [...olderData, ...prev]);
      }
    } catch (err) {
      console.error('Failed to load older data:', err);
    } finally {
      setIsLoadingPast(false);
    }
  };

  const results: BacktestResult = useMemo(() => {
    if (historicalData.length === 0) return {
      trades: [],
      equityCurve: [],
      totalProfit: 0,
      winRate: 0,
      maxDrawdown: 0,
      totalTrades: 0,
      sharpeRatio: 0
    };
    return runBacktest(historicalData, params);
  }, [historicalData, params]);

  return (
    <div className="h-screen w-full bg-slate-50 flex flex-col md:flex-row overflow-hidden font-sans text-slate-900 select-none">
      {/* Floating Navigation Trigger (RESTORED) */}
      <motion.button 
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="fixed top-3 left-3 z-[70] w-9 h-9 bg-white/90 backdrop-blur-md border border-slate-100 rounded-xl flex items-center justify-center shadow-lg shadow-black/5 cursor-pointer hover:bg-slate-50 transition-colors"
      >
        <div className="flex flex-col gap-1">
          <motion.div animate={{ rotate: isMenuOpen ? 45 : 0, y: isMenuOpen ? 4 : 0 }} className="w-3 h-[1.2px] bg-slate-900 rounded-full" />
          <motion.div animate={{ opacity: isMenuOpen ? 0 : 1 }} className="w-3 h-[1.2px] bg-slate-900 rounded-full" />
          <motion.div animate={{ rotate: isMenuOpen ? -45 : 0, y: isMenuOpen ? -4 : 0 }} className="w-3 h-[1.2px] bg-slate-900 rounded-full" />
        </div>
      </motion.button>

      {/* Desktop Side Dock (Slimmer) */}
      <nav className="hidden md:flex w-[52px] flex-col items-center py-12 bg-white border-r border-slate-100 z-50">
        <div className="flex-1 flex flex-col gap-6">
          {/* Timeframe Tool */}
          <div className="relative">
            <button
              onClick={() => setIsTimeframeOpen(!isTimeframeOpen)}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${isTimeframeOpen ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-900 hover:bg-slate-50'}`}
            >
              <div className="text-[11px] font-black uppercase tracking-tight">{selectedTimeframe.label}</div>
            </button>
            
            <AnimatePresence>
              {isTimeframeOpen && (
                <motion.div 
                  initial={{ opacity: 0, x: 5 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 5 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-full ml-3 top-0 w-24 bg-white border border-slate-100 rounded-xl shadow-2xl overflow-hidden z-[100]"
                >
                  <div className="max-h-[350px] overflow-y-auto py-1 scrollbar-hide">
                    {TIMEFRAMES.map((tf) => (
                      <button
                        key={tf.id}
                        onClick={() => {
                          setSelectedTimeframe(tf);
                          setIsTimeframeOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-colors ${selectedTimeframe.id === tf.id ? 'text-black bg-slate-50 border-r-2 border-black' : 'text-slate-500'}`}
                      >
                        {tf.label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button 
            onClick={() => setActiveTab(activeTab === 'drawings' ? 'chart' : 'drawings')}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all ${activeTab === 'drawings' ? 'bg-slate-900 text-white' : 'text-slate-900 hover:bg-slate-50'}`}
          >
            <Pencil size={18} strokeWidth={2} />
          </button>
          
          <button className="w-9 h-9 flex items-center justify-center text-slate-900 hover:bg-slate-50 rounded-lg transition-all">
            <BarChart2 size={18} strokeWidth={2} />
          </button>

          <button className="w-9 h-9 flex items-center justify-center text-slate-900 hover:bg-slate-50 rounded-lg transition-all">
            <Play size={18} strokeWidth={2} />
          </button>
        </div>
      </nav>

      {/* Drawing Toolbar (Floating next to dock) */}
      <AnimatePresence>
        {activeTab === 'drawings' && (
          <>
            <div 
              className="fixed inset-0 z-40 bg-transparent"
              onClick={() => {
                setActiveTab('chart');
                setSelectedDrawing(null);
              }}
            />
            <motion.div
              drag
              dragMomentum={false}
              whileDrag={{ scale: 1.1, opacity: 0.8 }}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="fixed left-[64px] top-1/2 -translate-y-1/2 z-50 cursor-move"
            >
              <DrawingToolbar 
                activeTool={activeDrawingTool} 
                onSelectTool={setActiveDrawingTool} 
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Viewport */}
      <main className="flex-1 flex flex-col relative min-w-0 pb-[36px] md:pb-0">
        <div className="flex-1 relative">
          <MemoizedChart 
            data={historicalData} 
            trades={results.trades} 
            theme={theme} 
            onLoadMore={loadMorePast}
            isLoadingMore={isLoadingPast}
            drawingTool={activeDrawingTool}
            drawings={drawings}
            selectedId={selectedDrawing?.id}
            onDrawingsChange={setDrawings}
            onSelectDrawing={setSelectedDrawing}
            onDrawingComplete={() => setActiveDrawingTool(null)}
          />

          <AnimatePresence>
            {selectedDrawing && (
              <DrawingSettingsBox 
                drawing={selectedDrawing}
                onUpdate={(settings) => updateDrawing(selectedDrawing.id, { settings: { ...selectedDrawing.settings, ...settings } })}
                onDelete={() => deleteDrawing(selectedDrawing.id)}
                onClose={() => setSelectedDrawing(null)}
              />
            )}
          </AnimatePresence>
          
          {/* Top Info Bar (Ultra Minimalist - Positioned left of sidebar) */}
          <div className="absolute top-4 right-[62px] z-10 pointer-events-none transition-all">
             <div className="flex flex-col items-end px-2 py-1">
                <div className="flex items-center gap-1 mb-0.5">
                  <Bitcoin size={10} className="text-amber-500/80 fill-amber-500/5" />
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] font-sans leading-none">BTCUSD</span>
                </div>
                <span className="text-[11px] font-mono font-bold text-white/90 tabular-nums leading-none tracking-tight">
                  {historicalData[historicalData.length-1]?.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '---'}
                </span>
             </div>
          </div>
          
          {/* Sidebar Settings Trigger (Mobile Only Overlay) */}
          <div className="absolute bottom-6 right-0 w-[50px] flex justify-center z-10 md:hidden">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 text-slate-900 hover:bg-slate-100/50 rounded-lg transition-colors"
            >
              <Settings size={15} />
            </button>
          </div>
        </div>

        {/* Mobile Bottom Navigation (Minimalist Bar - Ultra Compact) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[36px] bg-white border-t border-slate-50 px-8 flex items-center justify-between z-[60] pb-safe">
          {/* Timeframe Selector for Mobile */}
          <div className="relative">
            <button 
              onClick={() => setIsTimeframeOpen(!isTimeframeOpen)}
              className={`flex flex-col items-center transition-all ${isTimeframeOpen ? 'text-black' : 'text-slate-900'}`}
            >
              <div className="text-[10px] font-black uppercase tracking-tighter leading-none border-[1.5px] border-current px-1 rounded-[2px]">{selectedTimeframe.label}</div>
            </button>
            
            <AnimatePresence>
              {isTimeframeOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full left-0 mb-2 w-24 bg-white border border-slate-100 rounded-xl shadow-2xl overflow-hidden z-[60]"
                >
                  <div className="max-h-[220px] overflow-y-auto py-1 scrollbar-hide">
                    {TIMEFRAMES.map((tf) => (
                      <button
                        key={tf.id}
                        onClick={() => {
                          setSelectedTimeframe(tf);
                          setIsTimeframeOpen(false);
                        }}
                        className={`w-full text-left px-4 py-3 text-[11px] font-bold uppercase tracking-widest hover:bg-slate-50 ${selectedTimeframe.id === tf.id ? 'text-black bg-slate-50' : 'text-slate-500'}`}
                      >
                        {tf.label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button 
            onClick={() => setActiveTab(activeTab === 'drawings' ? 'chart' : 'drawings')}
            className={`p-1 px-3 transition-all ${activeTab === 'drawings' ? 'text-black' : 'text-slate-900'}`}
          >
            <Pencil size={18} strokeWidth={2} />
          </button>

          <button className="p-1 px-3 text-slate-900 hover:text-black transition-all">
            <BarChart2 size={18} strokeWidth={2} />
          </button>

          <button className="p-1 px-3 text-slate-900 hover:text-black transition-all">
            <Play size={18} strokeWidth={2} />
          </button>
        </nav>
      </main>

      {/* Settings Modal (Overlay) */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="w-full max-w-sm bg-white rounded-3xl shadow-2xl relative overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h2 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400">Chart Appearance</h2>
                <button onClick={() => setIsSettingsOpen(false)} className="text-[10px] font-bold text-slate-400 hover:text-black">CLOSE</button>
              </div>
              
              <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto scrollbar-hide">
                <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                  {/* Background Section */}
                  <div className="col-span-2 space-y-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Canvas Background</label>
                    <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl">
                      <input 
                        type="color" value={theme.bg} 
                        onChange={(e) => setTheme(t => ({ ...t, bg: e.target.value }))}
                        className="w-8 h-8 rounded-lg cursor-pointer border-none p-0 bg-transparent"
                      />
                      <span className="text-[10px] font-mono text-slate-400">{theme.bg.toUpperCase()}</span>
                    </div>
                  </div>

                  <div className="col-span-2 space-y-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Grid Settings</label>
                    <div className="flex flex-col gap-4 bg-slate-50 p-4 rounded-2xl">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700">Display Grid</span>
                        <button 
                          onClick={() => setTheme(t => ({ ...t, showGrid: !t.showGrid }))}
                          className={`w-10 h-5 rounded-full p-1 transition-colors ${theme.showGrid !== false ? 'bg-black' : 'bg-slate-300'}`}
                        >
                          <motion.div 
                            animate={{ x: theme.showGrid !== false ? 20 : 0 }}
                            className="w-3 h-3 bg-white rounded-full shadow-sm"
                          />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <input 
                          type="color" value={theme.grid} 
                          onChange={(e) => setTheme(t => ({ ...t, grid: e.target.value }))}
                          className="w-8 h-8 rounded-lg cursor-pointer border-none p-0 bg-transparent"
                        />
                        <span className="text-[10px] font-mono text-slate-400">{theme.grid.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-2 space-y-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Axis / Text Color</label>
                    <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl">
                      <input 
                        type="color" value={theme.text} 
                        onChange={(e) => setTheme(t => ({ ...t, text: e.target.value }))}
                        className="w-8 h-8 rounded-lg cursor-pointer border-none p-0 bg-transparent"
                      />
                      <span className="text-[10px] font-mono text-slate-400">{theme.text.toUpperCase()}</span>
                    </div>
                  </div>

                  {/* Bullish Section */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider block">Bullish Candle</label>
                    <div className="space-y-3">
                      {['Color', 'Border', 'Wick'].map(part => (
                        <div key={part} className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={theme[`up${part}` as keyof ChartTheme]} 
                            onChange={(e) => setTheme(t => ({ ...t, [`up${part}`]: e.target.value }))}
                            className="w-6 h-6 rounded cursor-pointer border-none p-0 bg-transparent"
                          />
                          <span className="text-[9px] font-bold text-slate-400 uppercase">{part}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bearish Section */}
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block">Bearish Candle</label>
                    <div className="space-y-3">
                      {['Color', 'Border', 'Wick'].map(part => (
                        <div key={part} className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={theme[`down${part}` as keyof ChartTheme]} 
                            onChange={(e) => setTheme(t => ({ ...t, [`down${part}`]: e.target.value }))}
                            className="w-6 h-6 rounded cursor-pointer border-none p-0 bg-transparent"
                          />
                          <span className="text-[9px] font-bold text-slate-400 uppercase">{part}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50/50 flex justify-between gap-4">
                <button 
                  onClick={() => setTheme(DEFAULT_THEME)}
                  className="text-[10px] font-black uppercase text-slate-400 hover:text-black transition-colors"
                >
                  Reset to Default
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Menu Drawer */}
      <motion.div 
        initial={{ x: '-100%' }}
        animate={{ x: isMenuOpen ? 0 : '-100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed inset-y-0 left-0 w-80 bg-white shadow-[20px_0_40px_rgba(0,0,0,0.05)] z-40 border-r border-slate-100 p-8 flex flex-col"
      >
        <div className="mt-16 space-y-10 flex-1 overflow-y-auto scrollbar-hide pt-4">
          <section>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 border-b border-slate-100 pb-2">Strategy Model</h3>
            <div className="space-y-8">
              {[
                { label: 'Moving Average Fast', key: 'emaFast', min: 2, max: 50 },
                { label: 'Moving Average Slow', key: 'emaSlow', min: 10, max: 200 },
                { label: 'Relative Strength', key: 'rsiPeriod', min: 2, max: 30 },
              ].map((item) => (
                <div key={item.key} className="space-y-3">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">{item.label}</label>
                    <span className="text-black font-mono text-xs font-bold">{params[item.key as keyof StrategyParams]}</span>
                  </div>
                  <input 
                    type="range" min={item.min} max={item.max} step="1" 
                    value={params[item.key as keyof StrategyParams]} 
                    onChange={(e) => setParams(p => ({ ...p, [item.key]: parseInt(e.target.value) }))}
                    className="w-full accent-black h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer"
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="pt-8">
             <button 
                onClick={async () => {
                  const data = await fetchBTCData(selectedTimeframe.id, 300);
                  if (data.length > 0) setHistoricalData(data);
                }}
                className="w-full py-4 bg-black hover:bg-slate-800 text-white rounded-2xl transition-all flex items-center justify-center gap-3 text-sm font-bold active:scale-95"
             >
                <RefreshCcw size={16} />
                Refresh Dataset
             </button>
             <p className="text-[10px] text-center text-slate-400 mt-4 uppercase tracking-widest leading-relaxed">
               Generated {historicalData.length} records <br/> {new Date().toLocaleTimeString()}
             </p>
          </section>
        </div>
        
        <div className="mt-auto pt-8 border-t border-slate-50 flex flex-col gap-1">
           <span className="font-black text-xl italic tracking-tighter">QuantLab.</span>
           <span className="text-[10px] text-slate-300 font-mono">v1.2.0 • BUILT_IN_HOUSE</span>
        </div>
      </motion.div>

      {/* Backdrop for Menu */}
      <motion.div 
        animate={{ opacity: isMenuOpen ? 1 : 0, pointerEvents: isMenuOpen ? 'auto' : 'none' }}
        onClick={() => setIsMenuOpen(false)}
        className="fixed inset-0 bg-black/5 backdrop-blur-sm z-30"
      />
    </div>
  );
}
