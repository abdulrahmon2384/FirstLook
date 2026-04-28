import { motion, AnimatePresence } from 'motion/react';
import { 
  Palette, 
  Trash2, 
  Settings2, 
  Layers, 
  Lock, 
  Unlock,
  Eye,
  EyeOff,
  Minus,
  Plus,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { Drawing, DrawingType } from '../types/drawing';
import { useState, useEffect, useRef } from 'react';

interface DrawingSettingsBoxProps {
  drawing: Drawing;
  onUpdate: (settings: Partial<Drawing['settings']>) => void;
  onDelete: () => void;
  onClose: () => void;
}

const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#64748b', // slate
  '#000000', // black
  '#ffffff', // white
  '#089981', // trade profit
  '#f23645', // trade loss
];

const LINE_STYLES = [
  { id: 'solid', icon: <div className="w-6 h-0.5 bg-current" /> },
  { id: 'dashed', icon: <div className="flex gap-1"><div className="w-1.5 h-0.5 bg-current" /><div className="w-1.5 h-0.5 bg-current" /><div className="w-1.5 h-0.5 bg-current" /></div> },
  { id: 'dotted', icon: <div className="flex gap-0.5"><div className="w-0.5 h-0.5 bg-current rounded-full" /><div className="w-0.5 h-0.5 bg-current rounded-full" /><div className="w-0.5 h-0.5 bg-current rounded-full" /></div> }
];

export function DrawingSettingsBox({ drawing, onUpdate, onDelete, onClose }: DrawingSettingsBoxProps) {
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null); // 'main', 'profit', 'loss' or null
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showWidthPicker, setShowWidthPicker] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const advancedMenuRef = useRef<HTMLDivElement>(null);

  const isForecasting = drawing.type === DrawingType.LONG_POSITION || drawing.type === DrawingType.SHORT_POSITION;
  const isFib = drawing.type === DrawingType.FIB_RETRACEMENT;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (advancedMenuRef.current && !advancedMenuRef.current.contains(e.target as Node)) {
        setShowAdvancedSettings(false);
      }
    };
    if (showAdvancedSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAdvancedSettings]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const defaultFibLevels = [
    { value: 0, color: '#787b86', visible: true },
    { value: 0.236, color: '#f23645', visible: true },
    { value: 0.382, color: '#ff9800', visible: true },
    { value: 0.5, color: '#4caf50', visible: true },
    { value: 0.618, color: '#089981', visible: true },
    { value: 0.786, color: '#2196f3', visible: true },
    { value: 1, color: '#787b86', visible: true }
  ];

  const currentFibLevels = drawing.settings.levels || defaultFibLevels;

  const updateFibLevel = (index: number, updates: any) => {
    const newLevels = [...currentFibLevels];
    newLevels[index] = { ...newLevels[index], ...updates };
    onUpdate({ levels: newLevels });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.7 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.7 }}
      className="fixed top-1/4 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-0 p-0.5 bg-white/95 backdrop-blur-md rounded-lg border border-slate-200 shadow-2xl ring-1 ring-black/5"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Main Color Toggle */}
      {!isForecasting && drawing.type !== DrawingType.RECTANGLE && (
        <div className="relative border-r border-slate-100 pr-0.5 mr-0.5">
          <button
            onClick={() => {
              setShowColorPicker(showColorPicker === 'main' ? null : 'main');
              setShowStylePicker(false);
              setShowWidthPicker(false);
            }}
            className="w-6 h-6 rounded border border-black/5 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
            style={{ backgroundColor: drawing.settings.color || '#000000' }}
          >
            <div className="w-1 h-1 rounded-full bg-white opacity-40" />
          </button>

          <AnimatePresence>
            {showColorPicker === 'main' && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute bottom-full left-0 mb-2 p-1.5 bg-white rounded-lg border border-slate-200 shadow-xl grid grid-cols-4 gap-1 z-10"
              >
                {COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => {
                      onUpdate({ color });
                      setShowColorPicker(null);
                    }}
                    className={`w-6 h-6 rounded-md border border-black/5 transition-transform hover:scale-110 ${drawing.settings.color === color ? 'ring-1 ring-slate-400' : ''}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Specialized Colors for Rectangle */}
      {drawing.type === DrawingType.RECTANGLE && (
        <div className="flex items-center gap-0.5 border-r border-slate-100 pr-0.5 mr-0.5">
          {/* Border Color */}
          <div className="relative">
            <button
              onClick={() => {
                setShowColorPicker(showColorPicker === 'stroke' ? null : 'stroke');
                setShowStylePicker(false);
                setShowWidthPicker(false);
              }}
              className="w-6 h-6 rounded border border-black/5 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: drawing.settings.strokeColor || drawing.settings.color || '#2962ff' }}
              title="Border Color"
            >
              <div className="w-4 h-4 border-2 border-white/40 rounded-sm" />
            </button>
            <AnimatePresence>
              {showColorPicker === 'stroke' && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute bottom-full left-0 mb-2 p-1.5 bg-white rounded-lg border border-slate-200 shadow-xl grid grid-cols-4 gap-1 z-10"
                >
                  {COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => {
                        onUpdate({ strokeColor: color });
                        setShowColorPicker(null);
                      }}
                      className="w-6 h-6 rounded-md border border-black/5 transition-transform hover:scale-110"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Fill Color */}
          <div className="relative">
            <button
              onClick={() => {
                setShowColorPicker(showColorPicker === 'fill' ? null : 'fill');
                setShowStylePicker(false);
                setShowWidthPicker(false);
              }}
              className="w-6 h-6 rounded border border-black/5 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: drawing.settings.fillColor?.slice(0, 7) || drawing.settings.color || '#2962ff' }}
              title="Fill Color"
            >
              <div className="w-3 h-3 bg-white/60 rounded-sm" />
            </button>
            <AnimatePresence>
              {showColorPicker === 'fill' && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute bottom-full left-0 mb-2 p-1.5 bg-white rounded-lg border border-slate-200 shadow-xl grid grid-cols-4 gap-1 z-10"
                >
                  {COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => {
                        // For fill, we often want some transparency (e.g., 20% = 33 in hex)
                        onUpdate({ fillColor: color + '33' });
                        setShowColorPicker(null);
                      }}
                      className="w-6 h-6 rounded-md border border-black/5 transition-transform hover:scale-110"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Specialized Colors for Long/Short */}
      {isForecasting && (
        <div className="flex items-center gap-0.5 border-r border-slate-100 pr-0.5 mr-0.5">
          {/* Profit Color */}
          <div className="relative">
            <button
              onClick={() => {
                setShowColorPicker(showColorPicker === 'profit' ? null : 'profit');
                setShowStylePicker(false);
                setShowWidthPicker(false);
              }}
              className="w-6 h-6 rounded border border-black/5 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: drawing.settings.profitColor || '#089981' }}
              title="Profit Color"
            >
              <TrendingUp size={10} className="text-white/80" />
            </button>
            <AnimatePresence>
              {showColorPicker === 'profit' && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute bottom-full left-0 mb-2 p-1.5 bg-white rounded-lg border border-slate-200 shadow-xl grid grid-cols-4 gap-1 z-10"
                >
                  {COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => {
                        onUpdate({ profitColor: color });
                        setShowColorPicker(null);
                      }}
                      className="w-6 h-6 rounded-md border border-black/5 transition-transform hover:scale-110"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Loss Color */}
          <div className="relative">
            <button
              onClick={() => {
                setShowColorPicker(showColorPicker === 'loss' ? null : 'loss');
                setShowStylePicker(false);
                setShowWidthPicker(false);
              }}
              className="w-6 h-6 rounded border border-black/5 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: drawing.settings.lossColor || '#f23645' }}
              title="Stop Loss Color"
            >
              <TrendingDown size={10} className="text-white/80" />
            </button>
            <AnimatePresence>
              {showColorPicker === 'loss' && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute bottom-full left-0 mb-2 p-1.5 bg-white rounded-lg border border-slate-200 shadow-xl grid grid-cols-4 gap-1 z-10"
                >
                  {COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => {
                        onUpdate({ lossColor: color });
                        setShowColorPicker(null);
                      }}
                      className="w-6 h-6 rounded-md border border-black/5 transition-transform hover:scale-110"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      <div className="flex items-center">
        {/* Line Width */}
        <div className="relative">
          <button 
            onClick={() => {
              setShowWidthPicker(!showWidthPicker);
              setShowColorPicker(null);
              setShowStylePicker(false);
            }}
            className={`p-1.5 rounded-md transition-colors flex items-center gap-1 ${showWidthPicker ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
            title="Line Width"
          >
            <Layers size={14} />
            <span className="text-[10px] font-bold min-w-[20px] text-center">{drawing.settings.lineWidth || 1}</span>
          </button>
          
          <AnimatePresence>
            {showWidthPicker && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute bottom-full left-0 mb-2 p-1 bg-white rounded-lg border border-slate-200 shadow-xl flex flex-col gap-0.5 z-10 min-w-[60px]"
              >
                {[0.5, 1, 1.5, 2, 2.5, 3, 4].map(w => (
                  <button
                    key={w}
                    onClick={() => {
                      onUpdate({ lineWidth: w });
                      setShowWidthPicker(false);
                    }}
                    className={`px-2 py-1 rounded-md text-[10px] text-left transition-colors font-bold ${drawing.settings.lineWidth === w ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    {w}px
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Line Style */}
        <div className="relative">
          <button 
            onClick={() => {
              setShowStylePicker(!showStylePicker);
              setShowColorPicker(false);
              setShowWidthPicker(false);
            }}
            className={`p-1.5 rounded-md transition-colors flex items-center ${showStylePicker ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
            title="Line Style"
          >
            <div className="scale-75">
              {LINE_STYLES.find(s => s.id === (drawing.settings.lineStyle || 'solid'))?.icon}
            </div>
          </button>
          
          <AnimatePresence>
            {showStylePicker && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute bottom-full left-0 mb-2 p-1 bg-white rounded-lg border border-slate-200 shadow-xl flex flex-col gap-0.5 z-10"
              >
                {LINE_STYLES.map(style => (
                  <button
                    key={style.id}
                    onClick={() => {
                      onUpdate({ lineStyle: style.id as any });
                      setShowStylePicker(false);
                    }}
                    className={`p-2 rounded-md transition-colors min-w-[80px] flex items-center justify-center ${drawing.settings.lineStyle === style.id ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                  >
                    <div className="text-slate-900 scale-75">{style.icon}</div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="w-px h-5 bg-slate-100 mx-0.5" />

        <button 
          onClick={() => onUpdate({ hidden: !drawing.settings.hidden })}
          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
          title="Toggle Visibility"
        >
          {drawing.settings.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>

        <button 
          onClick={() => onUpdate({ locked: !drawing.settings.locked })}
          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
          title="Lock Drawing"
        >
          {drawing.settings.locked ? <Lock size={14} /> : <Unlock size={14} />}
        </button>

        {isFib && (
          <div className="relative">
            <button 
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              className={`p-1.5 transition-colors rounded-md ${showAdvancedSettings ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}
              title="Fibonacci Settings"
            >
              <Settings2 size={14} />
            </button>

            <AnimatePresence>
              {showAdvancedSettings && (
                <motion.div
                  ref={advancedMenuRef}
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="absolute bottom-full right-0 mb-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xl min-w-[300px] z-[300]"
                >
                  <h3 className="text-xs font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Settings2 size={12} /> Fibonacci Levels
                  </h3>

                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {currentFibLevels.map((lvl: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 py-1">
                        <input 
                          type="checkbox" 
                          checked={lvl.visible}
                          onChange={(e) => updateFibLevel(idx, { visible: e.target.checked })}
                          className="w-3.5 h-3.5 rounded border-slate-300 transition-colors cursor-pointer"
                        />
                        <span className="text-[10px] font-mono font-bold w-12 text-slate-500">{lvl.value.toFixed(3)}</span>
                        <div className="flex-1 h-px bg-slate-100" />
                        <input 
                          type="color" 
                          value={lvl.color}
                          onChange={(e) => updateFibLevel(idx, { color: e.target.value })}
                          className="w-5 h-5 rounded-md border-none p-0 cursor-pointer overflow-hidden bg-transparent"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500">Label Alignment</span>
                      <div className="flex bg-slate-50 p-0.5 rounded-lg border border-slate-100">
                        {['left', 'center', 'right'].map(align => (
                          <button
                            key={align}
                            onClick={() => onUpdate({ labelAlign: align })}
                            className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all capitalize ${drawing.settings.labelAlign === align || (!drawing.settings.labelAlign && align === 'right') ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            {align}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500">Label Position</span>
                      <div className="flex bg-slate-50 p-0.5 rounded-lg border border-slate-100">
                        {['top', 'middle', 'bottom'].map(pos => (
                          <button
                            key={pos}
                            onClick={() => onUpdate({ labelPos: pos })}
                            className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all capitalize ${drawing.settings.labelPos === pos || (!drawing.settings.labelPos && pos === 'top') ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500">Background Fill</span>
                      <button 
                        onClick={() => onUpdate({ showBackground: drawing.settings.showBackground === false ? true : false })}
                        className={`w-8 h-4 rounded-full p-0.5 transition-colors ${drawing.settings.showBackground !== false ? 'bg-black' : 'bg-slate-200'}`}
                      >
                        <motion.div 
                          animate={{ x: drawing.settings.showBackground !== false ? 16 : 0 }}
                          className="w-3 h-3 bg-white rounded-full shadow-sm"
                        />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="w-px h-5 bg-slate-100 mx-0.5" />

        <button 
          onClick={onDelete}
          className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
          title="Delete Drawing"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  );
}
