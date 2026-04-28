import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  Minus, 
  MoveVertical, 
  MoveHorizontal, 
  CircleDot, 
  ArrowUpRight, 
  ArrowDownRight,
  Maximize,
  Calendar,
  ArrowRight,
  Square,
  Share2,
  Pencil,
  Star,
  ChevronRight,
  Type,
  Activity,
  Trash2
} from 'lucide-react';
import { DrawingType } from '../types/drawing';
import { useState } from 'react';

interface DrawingToolbarProps {
  activeTool: DrawingType | null;
  onSelectTool: (tool: DrawingType | null) => void;
}

const DRAWING_GROUPS = [
  {
    id: 'lines',
    icon: TrendingUp,
    label: 'Lines',
    tools: [
      { id: DrawingType.TREND_LINE, label: 'Trend Line', icon: TrendingUp },
      { id: DrawingType.HORIZONTAL_RAY, label: 'Horizontal Ray', icon: ArrowRight },
      { id: DrawingType.VERTICAL_LINE, label: 'Vertical Line', icon: MoveVertical },
      { id: DrawingType.HORIZONTAL_LINE, label: 'Horizontal Line', icon: MoveHorizontal },
    ]
  },
  {
    id: 'forecasting',
    icon: Activity,
    label: 'Forecasting',
    tools: [
      { id: DrawingType.FIB_RETRACEMENT, label: 'Fib Retracement', icon: Type },
      { id: DrawingType.LONG_POSITION, label: 'Long Position', icon: ArrowUpRight },
      { id: DrawingType.SHORT_POSITION, label: 'Short Position', icon: ArrowDownRight },
      { id: DrawingType.PRICE_RANGE, label: 'Price Range', icon: Maximize },
      { id: DrawingType.DATE_RANGE, label: 'Date Range', icon: Calendar },
    ]
  },
  {
    id: 'shapes',
    icon: Square,
    label: 'Shapes',
    tools: [
      { id: DrawingType.ARROW_MARKER, label: 'Arrow Marker', icon: ArrowRight },
      { id: DrawingType.RECTANGLE, label: 'Rectangle', icon: Square },
      { id: DrawingType.PATH, label: 'Path', icon: Share2 },
      { id: DrawingType.BRUSH, label: 'Brush', icon: Pencil },
    ]
  }
];

export function DrawingToolbar({ activeTool, onSelectTool }: DrawingToolbarProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<DrawingType[]>([]);

  const toggleFavorite = (toolId: DrawingType) => {
    setFavorites(prev => 
      prev.includes(toolId) 
        ? prev.filter(id => id !== toolId)
        : [...prev, toolId]
    );
  };

  return (
    <div className="flex flex-col gap-2 p-2 bg-white/80 backdrop-blur-md rounded-xl border border-slate-100 shadow-xl overflow-visible pointer-events-auto relative">
      {/* Click-away overlay when a group is open */}
      <AnimatePresence>
        {openGroup && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-transparent cursor-default"
            onClick={() => setOpenGroup(null)}
          />
        )}
      </AnimatePresence>

      {/* Favorites Bar */}
      {favorites.length > 0 && (
        <div className="flex flex-col gap-1 pb-2 border-b border-slate-50">
          {favorites.map(toolId => {
            const tool = DRAWING_GROUPS.flatMap(g => g.tools).find(t => t.id === toolId);
            if (!tool) return null;
            return (
              <button
                key={tool.id}
                onClick={() => onSelectTool(activeTool === tool.id ? null : tool.id)}
                className={`p-2 rounded-lg transition-all ${activeTool === tool.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
                title={tool.label}
              >
                <tool.icon size={16} strokeWidth={2.5} />
              </button>
            );
          })}
        </div>
      )}

      {/* Main Groups */}
      <div className="flex flex-col gap-1">
        {DRAWING_GROUPS.map(group => (
          <div key={group.id} className="relative group/btn">
            <button
              onClick={() => setOpenGroup(openGroup === group.id ? null : group.id)}
              className={`p-2 rounded-lg transition-all ${openGroup === group.id ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <group.icon size={16} strokeWidth={2.5} />
            </button>

            <AnimatePresence>
              {openGroup === group.id && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="absolute left-full ml-3 top-0 w-56 bg-white border border-slate-100 rounded-xl shadow-2xl z-[100] p-1.5"
                >
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 px-3 py-2 border-b border-slate-50 mb-1">
                    {group.label}
                  </div>
                  {group.tools.map(tool => (
                    <div key={tool.id} className="flex items-center gap-1 group/item">
                      <button
                        onClick={() => {
                          onSelectTool(activeTool === tool.id ? null : tool.id);
                          setOpenGroup(null);
                        }}
                        className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all ${activeTool === tool.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        <tool.icon size={14} strokeWidth={2.5} />
                        <span className="text-[11px] font-bold tracking-tight">{tool.label}</span>
                      </button>
                      <button 
                        onClick={() => toggleFavorite(tool.id)}
                        className={`p-2 rounded-lg opacity-0 group-hover/item:opacity-100 transition-all ${favorites.includes(tool.id) ? 'text-amber-500 opacity-100' : 'text-slate-300 hover:text-amber-500'}`}
                      >
                        <Star size={12} fill={favorites.includes(tool.id) ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
        
        <div className="h-px bg-slate-100 my-1" />
        
        <button
          onClick={() => onSelectTool(null)}
          className={`p-2 rounded-lg transition-all ${activeTool === null ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
          title="Pointer"
        >
          <CircleDot size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
