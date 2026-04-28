/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle, Trade, ChartTheme } from '../../types';
import { Drawing, DrawingType, DrawingPoint } from '../../types/drawing';

export class ChartEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private data: Candle[] = [];
  private trades: Trade[] = [];
  private timeToIdx: Map<number, number> = new Map();
  
  private drawings: Drawing[] = [];
  private selectedDrawingId: string | null = null;
  private draggingPointIdx: number | null = null;
  private currentDrawingType: DrawingType | null = null;
  private activeDrawing: Drawing | null = null;
  private isDrawingToolEnabled: boolean = false;
  
  private onSelectDrawing: ((drawing: Drawing | null) => void) | null = null;
  private onDrawingsChange: ((drawings: Drawing[]) => void) | null = null;
  private onDrawingComplete: (() => void) | null = null;
  
  private offsetX: number = 0; 
  private offsetY: number = 0;
  private zoom: number = 10;
  private yScale: number = 1.0;
  private sidebarWidth: number = 50;
  private lastWidth: number = 0;
  private lastHeight: number = 0;
  
  private onLoadMore?: () => void;
  private isLoadingMore: boolean = false;
  
  private isDragging: boolean = false;
  private isSidebarDragging: boolean = false;
  private lastX: number = 0;
  private lastY: number = 0;
  
  private dragStartCoords: DrawingPoint | null = null;
  private initialPoints: DrawingPoint[] = [];
  
  // Persistent settings per drawing type
  private lastUsedSettings: Partial<Record<DrawingType, any>> = {
    [DrawingType.TREND_LINE]: { color: '#2962ff', lineWidth: 2 }, 
    [DrawingType.HORIZONTAL_LINE]: { color: '#2962ff', lineWidth: 1 },
    [DrawingType.VERTICAL_LINE]: { color: '#2962ff', lineWidth: 1 },
    [DrawingType.HORIZONTAL_RAY]: { color: '#2962ff', lineWidth: 1 },
    [DrawingType.RECTANGLE]: { strokeColor: '#2962ff', fillColor: '#2962ff33', lineWidth: 1 },
    [DrawingType.BRUSH]: { color: '#2962ff', lineWidth: 2 },
    [DrawingType.PATH]: { color: '#2962ff', lineWidth: 2 },
  };
  private velocityX: number = 0;
  private velocityY: number = 0;
  private friction: number = 0.5; 
  
  private mouseX: number = -1;
  private mouseY: number = -1;
  private isCrosshairActive: boolean = false;
  private longPressTimer: any = null;
  private pointers: Map<number, PointerEvent> = new Map();
  private lastPinchDistance: number = 0;
  private theme: ChartTheme = {
    bg: '#ffffff',
    grid: '#f1f5f9',
    text: '#94a3b8',
    upColor: '#26a69a',
    upBorder: '#26a69a',
    upWick: '#26a69a',
    downColor: '#ef5350',
    downBorder: '#ef5350',
    downWick: '#ef5350',
    showGrid: true
  };

  private animationId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!; 
    this.setupEvents();
    this.startAnimationLoop();
  }

  private startAnimationLoop() {
    const loop = () => {
      this.updateMomentum();
      this.draw();
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  private updateMomentum() {
    if (this.pointers.size > 0) return;

    if (Math.abs(this.velocityX) > 0.05) {
      this.offsetX += this.velocityX / (this.zoom || 1);
      this.velocityX *= 0.85; // Faster decay for momentum
    } else {
      this.velocityX = 0;
    }

    if (Math.abs(this.velocityY) > 0.05) {
      if (!this.isSidebarDragging) {
         this.offsetY += this.velocityY;
      }
      this.velocityY *= 0.85;
    } else {
      this.velocityY = 0;
    }

    if (isNaN(this.offsetX)) this.offsetX = 0;
    if (isNaN(this.offsetY)) this.offsetY = 0;
    if (isNaN(this.velocityX)) this.velocityX = 0;
    if (isNaN(this.velocityY)) this.velocityY = 0;
    this.yScale = Math.max(0.1, Math.min(10, this.yScale));
  }

  private setupEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 1. Drawing Tool Creation logic
      if (this.isDrawingToolEnabled && this.currentDrawingType && x < rect.width - this.sidebarWidth) {
        const coords = this.getValuesAtCoords(x, y);
        if (coords) {
          // If we are already drawing a PATH, add a point instead of starting a new one
          if (this.activeDrawing && this.activeDrawing.type === DrawingType.PATH) {
            this.activeDrawing.points.push(coords);
            this.draw();
            return;
          }

          const defaults = this.lastUsedSettings[this.currentDrawingType] || { color: '#000000', lineWidth: 1 };
          
          let points = [coords, coords];
          if (this.currentDrawingType === DrawingType.LONG_POSITION) {
            const tPrice = coords.price + (this.data[this.data.length - 1]?.close * 0.02 || 100);
            const sPrice = coords.price - (this.data[this.data.length - 1]?.close * 0.01 || 50);
            const endTime = coords.time + 3600 * 24; // +1 day default
            points = [coords, { ...coords, price: tPrice, time: endTime }, { ...coords, price: sPrice, time: endTime }];
          } else if (this.currentDrawingType === DrawingType.SHORT_POSITION) {
            const tPrice = coords.price - (this.data[this.data.length - 1]?.close * 0.02 || 100);
            const sPrice = coords.price + (this.data[this.data.length - 1]?.close * 0.01 || 50);
            const endTime = coords.time + 3600 * 24;
            points = [coords, { ...coords, price: tPrice, time: endTime }, { ...coords, price: sPrice, time: endTime }];
          }

          this.activeDrawing = {
            id: Math.random().toString(36).substr(2, 9),
            type: this.currentDrawingType,
            points: points,
            settings: { ...defaults }
          };
          this.drawings.push(this.activeDrawing);
          this.selectedDrawingId = this.activeDrawing.id;
          this.onSelectDrawing?.(this.activeDrawing);

          // For Long/Short positions, we place them on one click
          if (this.currentDrawingType === DrawingType.LONG_POSITION || this.currentDrawingType === DrawingType.SHORT_POSITION) {
            this.activeDrawing = null;
            this.onDrawingsChange?.(this.drawings);
            this.onDrawingComplete?.();
          }
        }
        return;
      }

      // 2. Hit detection for existing drawings/points
      const hit = this.getHitInfo(x, y);
      if (hit) {
        this.selectedDrawingId = hit.id;
        this.draggingPointIdx = hit.pointIdx;
        const selected = this.drawings.find(d => d.id === hit.id) || null;
        if (this.onSelectDrawing && selected) {
          this.onSelectDrawing(JSON.parse(JSON.stringify(selected))); // Pass a copy to avoid immediate mutation issues
        }
        
        // Setup initial drag state for smooth movement
        if (selected) {
          const coords = this.getValuesAtCoords(x, y);
          if (coords) {
            this.dragStartCoords = coords;
            this.initialPoints = selected.points.map(p => ({ ...p }));
          }
        }
        
        // Zero out momentum to prevent chart shifting while dragging drawing
        this.velocityX = 0;
        this.velocityY = 0;
        
        // If it's a point dragging or body dragging, we don't want to start map dragging
        if (hit.pointIdx !== null) {
          this.pointers.set(e.pointerId, e);
          this.canvas.setPointerCapture(e.pointerId);
          return;
        }
      } else {
         // Deselect if clicking background and not drawing
         if (this.selectedDrawingId) {
           this.selectedDrawingId = null;
           this.onSelectDrawing?.(null);
         }
      }

      this.isDragging = true;
      this.isSidebarDragging = x > (rect.width - this.sidebarWidth);
      
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.velocityX = 0;
      this.velocityY = 0;
      this.pointers.set(e.pointerId, e);
      this.canvas.setPointerCapture(e.pointerId);
      
      // Long press for Crosshair activation (TradingView style)
      if (!this.isSidebarDragging && this.pointers.size === 1) {
        this.longPressTimer = setTimeout(() => {
          this.isCrosshairActive = true;
          const isTouch = e.pointerType === 'touch';
          const touchOffset = isTouch ? 60 : 0; // Lift crosshair above finger
          
          this.mouseX = x;
          this.mouseY = y - touchOffset;
          
          if ('vibrate' in navigator) navigator.vibrate(12);
          this.draw(); // Force crosshair reveal
        }, 500);
      }

      if (this.pointers.size >= 2) {
        this.isSidebarDragging = false; 
        this.lastPinchDistance = this.getPinchDistance();
        const center = this.getPointerCenter(rect);
        this.lastX = center.x + rect.left;
        this.lastY = center.y + rect.top;
        if (this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
      }
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (this.activeDrawing) {
        // Path tool stays active until completed (e.g. by double click or Enter)
        if (this.activeDrawing.type === DrawingType.PATH) {
          this.onDrawingsChange?.(this.drawings);
          return;
        }
        
        this.activeDrawing = null;
        this.onDrawingsChange?.(this.drawings);
        this.onDrawingComplete?.();
      }
      this.draggingPointIdx = null;

      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      this.isCrosshairActive = false;
      this.pointers.delete(e.pointerId);
      this.canvas.style.cursor = 'default';
      if (this.pointers.size < 2) {
        this.lastPinchDistance = 0;
      }
      if (this.pointers.size === 1) {
        const remaining = Array.from(this.pointers.values())[0];
        this.lastX = remaining.clientX;
        this.lastY = remaining.clientY;
      }
      if (this.pointers.size === 0) {
        this.isDragging = false;
        this.isSidebarDragging = false;
      }
      this.canvas.releasePointerCapture(e.pointerId);
    });

    this.canvas.addEventListener('pointercancel', (e) => {
      this.pointers.delete(e.pointerId);
      this.isDragging = false;
      this.isSidebarDragging = false;
      this.activeDrawing = null;
      this.draggingPointIdx = null;
    });

    this.canvas.addEventListener('pointermove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Update crosshair pos
      this.mouseX = x;
      this.mouseY = y;

      // Case 1: Point or Body dragging of existing drawing
      if (this.draggingPointIdx !== null && this.selectedDrawingId) {
        const drawing = this.drawings.find(d => d.id === this.selectedDrawingId);
        if (drawing?.settings?.locked) {
           this.draggingPointIdx = null;
           return;
        }
        
        const coords = this.getValuesAtCoords(x, y);
        if (coords && drawing && this.dragStartCoords && !isNaN(coords.time) && !isNaN(coords.price)) {
          if (this.draggingPointIdx === -1) {
            // Whole drawing dragging
            const timeDelta = coords.time - this.dragStartCoords.time;
            const priceDelta = coords.price - this.dragStartCoords.price;
            
            if (!isNaN(timeDelta) && !isNaN(priceDelta)) {
              drawing.points = this.initialPoints.map(p => ({
                time: p.time + timeDelta,
                price: p.price + priceDelta
              }));
            }
          } else if (this.draggingPointIdx >= 0) {
            // Individual point dragging
            if (drawing.type === DrawingType.LONG_POSITION || drawing.type === DrawingType.SHORT_POSITION) {
              const p0 = drawing.points[0];
              const p1 = drawing.points[1];
              const p2 = drawing.points[2] || { ...p0 };

              if (this.draggingPointIdx === 0) {
                // Dragging Entry Handle: Move all prices vertically, or just Entry? 
                // TV behavior: Moving entry moves the whole box vertically
                const priceDelta = coords.price - p0.price;
                drawing.points[0].price = coords.price;
                drawing.points[1].price = p1.price + priceDelta;
                if (drawing.points[2]) drawing.points[2].price = p2.price + priceDelta;
              } else if (this.draggingPointIdx === 1) {
                // Target Handle
                drawing.points[1].price = coords.price;
              } else if (this.draggingPointIdx === 2) {
                // Stop Handle
                if (!drawing.points[2]) drawing.points[2] = { ...p0 };
                drawing.points[2].price = coords.price;
              } else if (this.draggingPointIdx === 3) {
                // Start Time
                drawing.points[0].time = coords.time;
              } else if (this.draggingPointIdx === 4) {
                // End Time
                drawing.points[1].time = coords.time;
                if (drawing.points[2]) drawing.points[2].time = coords.time;
              }
            } else {
              // Default individual point dragging
              drawing.points[this.draggingPointIdx] = coords;
              
              // Constrain 2nd point for horizontal/vertical types
              if (drawing.type === DrawingType.HORIZONTAL_LINE || drawing.type === DrawingType.HORIZONTAL_RAY) {
                const otherIdx = this.draggingPointIdx === 0 ? 1 : 0;
                if (drawing.points[otherIdx]) {
                  drawing.points[otherIdx].price = coords.price;
                }
              } else if (drawing.type === DrawingType.VERTICAL_LINE) {
                const otherIdx = this.draggingPointIdx === 0 ? 1 : 0;
                if (drawing.points[otherIdx]) {
                  drawing.points[otherIdx].time = coords.time;
                }
              }
            }
          }
          this.onDrawingsChange?.([...this.drawings]);
          this.draw(); // Immediate redraw for visual smoothness
        }
        return;
      }

      // Case 2: Active creation dragging
      if (this.activeDrawing && this.isDrawingToolEnabled) {
        const coords = this.getValuesAtCoords(x, y);
        if (coords) {
          if (this.activeDrawing.type === DrawingType.BRUSH || this.activeDrawing.type === DrawingType.PATH) {
            const lastPoint = this.activeDrawing.points[this.activeDrawing.points.length - 1];
            if (lastPoint) {
              const { x: lx, y: ly } = this.getPointCoords(lastPoint);
              const dist = Math.sqrt((x - lx)**2 + (y - ly)**2);
              // Only add point if moved enough (3px) to keep path smooth and manageable
              if (dist > 3) {
                this.activeDrawing.points.push(coords);
              }
            } else {
              this.activeDrawing.points.push(coords);
            }
          } else if (this.activeDrawing.points.length > 1) {
            // Enforce constraints during creation
            if (this.activeDrawing.type === DrawingType.HORIZONTAL_LINE || this.activeDrawing.type === DrawingType.HORIZONTAL_RAY) {
              coords.price = this.activeDrawing.points[0].price;
            } else if (this.activeDrawing.type === DrawingType.VERTICAL_LINE) {
              coords.time = this.activeDrawing.points[0].time;
            } else if (this.activeDrawing.type === DrawingType.LONG_POSITION || this.activeDrawing.type === DrawingType.SHORT_POSITION) {
              // Update Target (point 1) and make Stop (point 2) follow a 1:2 RR ratio initially
              this.activeDrawing.points[1] = coords;
              const entryPrice = this.activeDrawing.points[0].price;
              const targetDiff = coords.price - entryPrice;
              // 1:2 Ratio: If target is +2%, stop is -1%
              this.activeDrawing.points[2] = {
                ...coords,
                price: entryPrice - (targetDiff / 2)
              };
              this.onDrawingsChange?.([...this.drawings]);
              this.draw();
              return;
            }
            this.activeDrawing.points[1] = coords;
          }
           this.onDrawingsChange?.([...this.drawings]);
           this.draw();
        }
        return;
      }

      // Standard panning/pinch-zoom logic
      if (this.longPressTimer && (Math.abs(e.clientX - this.lastX) > 5 || Math.abs(e.clientY - this.lastY) > 5)) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }

      // Cursor feedback
      if (!this.isDragging) {
        const hit = this.getHitInfo(x, y);
        if (hit) {
          this.canvas.style.cursor = hit.pointIdx !== -1 ? 'move' : 'pointer';
        } else if (x > rect.width - this.sidebarWidth) {
          this.canvas.style.cursor = 'ns-resize';
        } else {
          this.canvas.style.cursor = 'crosshair';
        }
      }
      
      this.mouseX = x;
      this.mouseY = y;

      if (this.isDragging) {
        this.pointers.set(e.pointerId, e);

        if (this.activeDrawing && this.isDrawingToolEnabled) {
          const coords = this.getValuesAtCoords(x, y);
          if (coords) {
            if (this.activeDrawing.type === DrawingType.BRUSH || this.activeDrawing.type === DrawingType.PATH) {
              this.activeDrawing.points.push(coords);
            } else {
              // Update second point for standard shapes
              if (this.activeDrawing.points.length === 1) {
                this.activeDrawing.points.push(coords);
              } else {
                this.activeDrawing.points[1] = coords;
              }
            }
          }
          this.onDrawingsChange?.([...this.drawings]);
          return;
        }

        if (this.isCrosshairActive) {
          // If in crosshair mode, only update crosshair position (with touch offset), don't pan
          const isTouch = e.pointerType === 'touch';
          const touchOffset = isTouch ? 60 : 0;
          this.mouseX = x;
          this.mouseY = y - touchOffset;
          return;
        }

        if (this.pointers.size >= 2) {
          this.isSidebarDragging = false; 
          const center = this.getPointerCenter(rect);
          const currentDistance = this.getPinchDistance();
          
          // Pan to follow finger center movement
          const dx = (center.x + rect.left) - this.lastX;
          const dy = (center.y + rect.top) - this.lastY;
          
          this.offsetX += dx / this.zoom;
          this.offsetY += dy;
          
          // Update tracking coordinates
          this.lastX = center.x + rect.left;
          this.lastY = center.y + rect.top;

          // Handle Zoom relative to current pinch center
          if (this.lastPinchDistance > 0 && Math.abs(currentDistance - this.lastPinchDistance) > 0.5) {
            const zoomFactor = currentDistance / this.lastPinchDistance;
            // Use high sensitivity for "pinned" feel, slightly dampened to filter touch noise
            const activeZoomFactor = 1 + (zoomFactor - 1) * 0.8;
            this.handleZoom(activeZoomFactor, center);
          }
          this.lastPinchDistance = currentDistance;
          
          // Disable momentum during multi-touch for professional feel
          this.velocityX = 0;
          this.velocityY = 0;
        } else if (this.pointers.size === 1) {
          const dx = e.clientX - this.lastX;
          const dy = e.clientY - this.lastY;
          
          // Sensitivity tuning: standard 1:1 tracking for natural feel
          const panSensitivity = 1.0; 

          if (this.isSidebarDragging) {
            const scaleFactor = 1 - (dy * 0.0012); 
            this.yScale *= scaleFactor;
          } else {
            this.offsetX += (dx / this.zoom) * panSensitivity;
            this.offsetY += dy * panSensitivity;
          }
          
          this.velocityX = dx * 0.15; // Natural momentum
          this.velocityY = dy * 0.15;
          
          this.lastX = e.clientX;
          this.lastY = e.clientY;
        }
      }
    });

    this.canvas.addEventListener('pointerleave', () => {
        this.mouseX = -1;
        this.mouseY = -1;
    });

    this.canvas.addEventListener('dblclick', (e) => {
      // Finish PATH drawing on double click
      if (this.activeDrawing && this.activeDrawing.type === DrawingType.PATH) {
        this.activeDrawing = null;
        this.onDrawingsChange?.(this.drawings);
        this.onDrawingComplete?.();
        this.draw();
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x > rect.width - this.sidebarWidth) {
        this.yScale = 1.0;
        this.offsetY = 0;
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;

      if (x > rect.width - this.sidebarWidth) {
        // Vertical scaling on sidebar - smoother 2% steps
        const scaleFactor = e.deltaY > 0 ? 0.98 : 1.02;
        this.yScale *= scaleFactor;
      } else {
        // Horizontal zooming on chart
        const zoomFactor = e.deltaY > 0 ? 0.98 : 1.02;
        this.handleZoom(zoomFactor, { x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (this.selectedDrawingId) {
          this.drawings = this.drawings.filter(d => d.id !== this.selectedDrawingId);
          this.selectedDrawingId = null;
          this.onDrawingsChange?.(this.drawings);
          this.onSelectDrawing?.(null);
          this.draw();
        }
      }
      if (e.key === 'Enter') {
        if (this.activeDrawing && this.activeDrawing.type === DrawingType.PATH) {
          this.activeDrawing = null;
          this.onDrawingsChange?.(this.drawings);
          this.onDrawingComplete?.();
          this.draw();
        }
      }
      if (e.key === 'Escape') {
        this.activeDrawing = null;
        this.currentDrawingType = null;
        this.onDrawingComplete?.();
        this.draw();
      }
    });
  }

  private getPinchDistance(): number {
    const p = Array.from(this.pointers.values());
    if (p.length < 2) return 0;
    const dx = p[0].clientX - p[1].clientX;
    const dy = p[0].clientY - p[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getPointerCenter(rect: DOMRect) {
    const p = Array.from(this.pointers.values());
    if (p.length < 2) return { x: this.mouseX, y: this.mouseY };
    return {
      x: ((p[0].clientX + p[1].clientX) / 2) - rect.left,
      y: ((p[0].clientY + p[1].clientY) / 2) - rect.top
    };
  }

  private handleZoom(zoomFactor: number, center: { x: number, y: number }) {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const k = width - (this.sidebarWidth + 10);
    
    const oldZoom = this.zoom;
    this.zoom = Math.max(1, Math.min(200, this.zoom * zoomFactor));
    
    // Algebra: To keep the same world point (candle index) under the cursor/pinch center:
    // offsetX_new = offsetX_old + (center.x - k)/newZoom - (center.x - k)/oldZoom
    const delta = (center.x - k) / this.zoom - (center.x - k) / oldZoom;
    
    if (!isNaN(delta) && isFinite(delta)) {
      this.offsetX += delta;
    }
  }

  private maxVolume: number = 0;
  private tradeIndices: Map<string, { entry: number, exit: number }> = new Map();

  public setData(data: Candle[], trades: Trade[]) {
    const oldLength = this.data.length;
    const firstOldCandle = oldLength > 0 ? this.data[0] : null;

    this.data = data;
    this.trades = trades;

    if (firstOldCandle && data.length > oldLength) {
        // Find if old data was prepended
        // We look for where the first old candle is in the new data
        const newIdx = data.findIndex(c => c.time === firstOldCandle.time);
        if (newIdx > 0) {
            // Data was prepended, adjust offsetX to keep visual position
            this.offsetX += newIdx;
        }
    }
    
    // Pre-calculate max volume for performance
    this.maxVolume = 0;
    for (let i = 0; i < data.length; i++) {
        if (data[i].volume > this.maxVolume) this.maxVolume = data[i].volume;
    }
    if (this.maxVolume === 0) this.maxVolume = 1;

    // Pre-calculate trade indices
    this.tradeIndices.clear();
    this.timeToIdx.clear();
    for (let i = 0; i < data.length; i++) {
        this.timeToIdx.set(data[i].time, i);
    }

    trades.forEach(t => {
        this.tradeIndices.set(t.id, {
            entry: this.timeToIdx.get(t.entryTime) ?? -1,
            exit: t.exitTime ? (this.timeToIdx.get(t.exitTime) ?? -1) : -1
        });
    });
  }

  public setTheme(theme: ChartTheme) {
    this.theme = { ...this.theme, ...theme };
  }

  public setSelectedDrawingId(id: string | null) {
    this.selectedDrawingId = id;
    this.draw(); // Force redraw to show selection
  }

  public getSelectedDrawingId(): string | null {
    return this.selectedDrawingId;
  }

  public setDrawingTool(type: DrawingType | null) {
    this.currentDrawingType = type;
    this.isDrawingToolEnabled = type !== null;
    if (type === null) {
      this.activeDrawing = null;
    }
  }

  public getDrawings(): Drawing[] {
    return this.drawings;
  }

  public setDrawings(drawings: Drawing[]) {
    // Detect if settings were changed to update persistence
    drawings.forEach(d => {
      const existing = this.drawings.find(prev => prev.id === d.id);
      if (existing && JSON.stringify(existing.settings) !== JSON.stringify(d.settings)) {
        this.lastUsedSettings[d.type] = { ...d.settings };
      }
    });
    this.drawings = drawings;
  }

  public clearDrawings() {
    this.drawings = [];
    this.activeDrawing = null;
  }

  private getValuesAtCoords(x: number, y: number): DrawingPoint | null {
    if (!this.canvas || this.data.length === 0) return null;
    const { width, height } = this.canvas.getBoundingClientRect();
    const paddingRight = this.sidebarWidth + 10;

    const lastIdx = this.data.length - 1;
    const endIdx = Math.min(lastIdx, Math.ceil(lastIdx - this.offsetX + (paddingRight / this.zoom) + 10));
    const startIdx = Math.max(0, Math.floor(endIdx - (width / this.zoom) - 20));

    let minPriceVisible = Infinity;
    let maxPriceVisible = -Infinity;
    for (let i = startIdx; i <= endIdx; i++) {
        const d = this.data[i];
        if (d) {
            minPriceVisible = Math.min(minPriceVisible, d.low);
            maxPriceVisible = Math.max(maxPriceVisible, d.high);
        }
    }
    
    if (minPriceVisible === Infinity || isNaN(minPriceVisible)) {
        const recent = this.data.slice(-100);
        minPriceVisible = Math.min(...recent.map(d => d.low)) || 0;
        maxPriceVisible = Math.max(...recent.map(d => d.high)) || 100;
    }

    if (minPriceVisible === maxPriceVisible) {
        minPriceVisible -= 1;
        maxPriceVisible += 1;
    }

    const rangeBuffer = (maxPriceVisible - minPriceVisible) * 0.1;
    const minP = minPriceVisible - rangeBuffer;
    const maxP = maxPriceVisible + rangeBuffer;
    const priceRange = Math.abs(maxP - minP) || 1;
    const priceScale = (height * 0.8 * this.yScale) / priceRange;

    // Continuous Index from X
    const index = lastIdx - this.offsetX + (x - (width - paddingRight)) / this.zoom;
    
    // Stable extrapolation logic
    const lastCandle = this.data[lastIdx];
    const firstCandle = this.data[0];
    const avgInterval = this.data.length > 1 
      ? (lastCandle.time - firstCandle.time) / (this.data.length - 1) 
      : 3600;
    
    // Price from Y (Continuous)
    const price = (height * 0.9 + this.offsetY - y) / priceScale + minP;
    const time = lastCandle.time + (index - (this.data.length - 1)) * avgInterval;

    // Snap to nearest candle
    const snapIdx = Math.round(index);
    if (snapIdx >= 0 && snapIdx < this.data.length) {
      return { time: this.data[snapIdx].time, price };
    }

    return { time, price };
  }

  private getPointCoords(p: DrawingPoint): { x: number; y: number } {
    const { width, height } = this.canvas.getBoundingClientRect();
    const paddingRight = this.sidebarWidth + 10;
    
    // Bounds calculation
    const lastIdx = this.data.length - 1;
    const endIdx = Math.min(lastIdx, Math.ceil(lastIdx - this.offsetX + (paddingRight / this.zoom) + 10));
    const startIdx = Math.max(0, Math.floor(endIdx - (width / this.zoom) - 20));

    let minPriceVisible = Infinity;
    let maxPriceVisible = -Infinity;
    for (let i = startIdx; i <= endIdx; i++) {
        const d = this.data[i];
        if (d) {
            minPriceVisible = Math.min(minPriceVisible, d.low);
            maxPriceVisible = Math.max(maxPriceVisible, d.high);
        }
    }
    if (minPriceVisible === Infinity) {
      minPriceVisible = 0;
      maxPriceVisible = 100;
    }
    const rangeBuffer = (maxPriceVisible - minPriceVisible) * 0.1;
    const minP = minPriceVisible - rangeBuffer;
    const maxP = maxPriceVisible + rangeBuffer;
    const priceScale = (height * 0.8 * this.yScale) / (maxP - minP || 1);

    // X calculation
    const lastCandle = this.data[this.data.length - 1];
    const firstCandle = this.data[0];
    const avgInterval = this.data.length > 1 ? (lastCandle.time - firstCandle.time) / (this.data.length - 1) : 3600;
    const idx = (p.time - lastCandle.time) / avgInterval + (this.data.length - 1);
    
    const x = (width - paddingRight) - (this.data.length - 1 - idx - this.offsetX) * this.zoom + (this.zoom / 2);
    const y = height * 0.9 + this.offsetY - (p.price - minP) * priceScale;
    
    return { x, y: isNaN(y) ? 0 : y };
  }

  private renderDrawings(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    getX: (idx: number) => number,
    getY: (price: number) => number,
    minP: number,
    priceScale: number
  ) {
    // Context-sensitive X from Time (including stable extrapolation)
    const getXFromTime = (time: number) => {
      const lastCandle = this.data[this.data.length - 1];
      const firstCandle = this.data[0];
      const avgInterval = this.data.length > 1 ? (lastCandle.time - firstCandle.time) / (this.data.length - 1) : 3600;
      
      // Calculate continuous index
      const idx = (time - lastCandle.time) / avgInterval + (this.data.length - 1);
      return getX(idx) + this.zoom / 2;
    };

    this.drawings.forEach(d => {
      if (d.points.length === 0 || d.settings.hidden) return;

      const isSelected = d.id === this.selectedDrawingId;
      const coords = d.points.map(p => ({
        x: getXFromTime(p.time),
        y: getY(p.price)
      }));

      ctx.strokeStyle = d.settings.color || '#000000';
      const baseWidth = d.settings.lineWidth || 1;
      ctx.lineWidth = baseWidth;
      
      // Line Styles
      if (d.settings.lineStyle === 'dashed') {
        ctx.setLineDash(baseWidth < 1 ? [3, 3] : [5, 5]);
      } else if (d.settings.lineStyle === 'dotted') {
        ctx.setLineDash(baseWidth < 1 ? [1, 2] : [2, 4]);
      } else {
        ctx.setLineDash([]);
      }

      // Restore anchor points for selected drawing
      if (isSelected) {
        coords.forEach(p => {
          ctx.setLineDash([]); // Anchors are always solid
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = d.settings.color || '#000000';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
        
        // Restore dash for the main drawing body
        if (d.settings.lineStyle === 'dashed') {
          ctx.setLineDash(baseWidth < 1 ? [3, 3] : [5, 5]);
        } else if (d.settings.lineStyle === 'dotted') {
          ctx.setLineDash(baseWidth < 1 ? [1, 2] : [2, 4]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.strokeStyle = d.settings.color || '#000000';
        ctx.lineWidth = baseWidth;
      }

      switch (d.type) {
        case DrawingType.TREND_LINE:
          if (coords.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(coords[0].x, coords[0].y);
            ctx.lineTo(coords[1].x, coords[1].y);
            ctx.stroke();
          }
          break;

        case DrawingType.HORIZONTAL_LINE:
          const hy = coords[0].y;
          ctx.beginPath();
          ctx.moveTo(0, hy);
          ctx.lineTo(width - this.sidebarWidth, hy);
          ctx.stroke();
          break;

        case DrawingType.HORIZONTAL_RAY:
          const ry = coords[0].y;
          ctx.beginPath();
          ctx.moveTo(coords[0].x, ry);
          ctx.lineTo(width - this.sidebarWidth, ry);
          ctx.stroke();
          break;

        case DrawingType.VERTICAL_LINE:
          const vx = coords[0].x;
          ctx.beginPath();
          ctx.moveTo(vx, 0);
          ctx.lineTo(vx, height);
          ctx.stroke();
          break;

        case DrawingType.RECTANGLE:
          if (coords.length >= 2) {
            const rx = Math.min(coords[0].x, coords[1].x);
            const ry = Math.min(coords[0].y, coords[1].y);
            const rw = Math.abs(coords[1].x - coords[0].x);
            const rh = Math.abs(coords[1].y - coords[0].y);
            
            // Fill
            ctx.fillStyle = d.settings.fillColor || (d.settings.color ? d.settings.color + '22' : '#2962ff22');
            ctx.fillRect(rx, ry, rw, rh);
            
            // Border
            ctx.strokeStyle = d.settings.strokeColor || d.settings.color || '#2962ff';
            ctx.strokeRect(rx, ry, rw, rh);
          }
          break;

        case DrawingType.BRUSH:
        case DrawingType.PATH:
          if (coords.length >= 2) {
            ctx.beginPath();
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            
            if (d.type === DrawingType.BRUSH) {
              // Smoother Brush using quadratic curves
              ctx.moveTo(coords[0].x, coords[0].y);
              let i;
              for (i = 1; i < coords.length - 2; i++) {
                const xc = (coords[i].x + coords[i + 1].x) / 2;
                const yc = (coords[i].y + coords[i + 1].y) / 2;
                ctx.quadraticCurveTo(coords[i].x, coords[i].y, xc, yc);
              }
              // For the last 2 points
              if (i < coords.length) {
                ctx.quadraticCurveTo(
                  coords[i].x,
                  coords[i].y,
                  coords[coords.length - 1].x,
                  coords[coords.length - 1].y
                );
              }
            } else {
              // Standard Path (Multi-line)
              ctx.moveTo(coords[0].x, coords[0].y);
              for (let i = 1; i < coords.length; i++) {
                ctx.lineTo(coords[i].x, coords[i].y);
              }
              ctx.stroke();
              
              // If actively drawing a path, draw a preview line to current mouse position
              if (this.activeDrawing && d.id === this.activeDrawing.id) {
                ctx.beginPath();
                ctx.moveTo(coords[coords.length - 1].x, coords[coords.length - 1].y);
                ctx.lineTo(this.mouseX, this.mouseY);
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]);
              }
              return; // Skip final stroke
            }
            ctx.stroke();
          } else if (d.type === DrawingType.PATH && coords.length === 1 && this.activeDrawing && d.id === this.activeDrawing.id) {
            // Preview for the very first segment
            ctx.beginPath();
            ctx.moveTo(coords[0].x, coords[0].y);
            ctx.lineTo(this.mouseX, this.mouseY);
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          break;

        case DrawingType.FIB_RETRACEMENT:
          if (coords.length >= 2) {
            const p1 = d.points[0];
            const p2 = d.points[1];
            const diff = p2.price - p1.price;
            
            // Default levels if none specified
            const fibLevels = d.settings.levels || [
              { value: 0, color: '#787b86', opacity: 0, visible: true },
              { value: 0.236, color: '#f23645', opacity: 0.1, visible: true },
              { value: 0.382, color: '#ff9800', opacity: 0.1, visible: true },
              { value: 0.5, color: '#4caf50', opacity: 0.1, visible: true },
              { value: 0.618, color: '#089981', opacity: 0.1, visible: true },
              { value: 0.786, color: '#2196f3', opacity: 0.1, visible: true },
              { value: 1, color: '#787b86', opacity: 0.1, visible: true }
            ];

            const left = Math.min(coords[0].x, coords[1].x);
            const right = Math.max(coords[0].x, coords[1].x);
            const w = right - left;
            
            // Draw backgrounds first
            if (d.settings.showBackground !== false) {
              const visibleLevels = fibLevels.filter((l: any) => l.visible).sort((a: any, b: any) => a.value - b.value);
              for (let i = 0; i < visibleLevels.length - 1; i++) {
                const l1 = visibleLevels[i];
                const l2 = visibleLevels[i+1];
                const y1 = getY(p1.price + diff * l1.value);
                const y2 = getY(p1.price + diff * l2.value);
                
                ctx.fillStyle = l2.color + '22'; // 13% opacity approx
                ctx.fillRect(left, Math.min(y1, y2), w, Math.abs(y2 - y1));
              }
            }

            // Draw Trendline (Grayish dotted slanted line)
            ctx.beginPath();
            ctx.setLineDash([2, 4]);
            ctx.strokeStyle = '#787b8688';
            ctx.lineWidth = baseWidth;
            ctx.moveTo(coords[0].x, coords[0].y);
            ctx.lineTo(coords[1].x, coords[1].y);
            ctx.stroke();

            fibLevels.forEach((lvl: any) => {
              if (!lvl.visible) return;
              
              const price = p1.price + diff * lvl.value;
              const y = getY(price);
              
              ctx.beginPath();
              ctx.strokeStyle = lvl.color || d.settings.color || '#787b86';
              ctx.lineWidth = baseWidth;
              
              const style = d.settings.lineStyle || 'solid';
              if (style === 'dashed') ctx.setLineDash([5, 5]);
              else if (style === 'dotted') ctx.setLineDash([2, 3]);
              else ctx.setLineDash([]);
              
              ctx.moveTo(left, y);
              ctx.lineTo(right, y);
              ctx.stroke();
              
              // Labels
              ctx.setLineDash([]);
              ctx.font = '9px sans-serif'; // Slightly smaller font
              ctx.fillStyle = ctx.strokeStyle;
              
              const label = `${lvl.value.toFixed(3)} (${price.toFixed(2)})`;
              const margin = 2; // Reduced margin to hug the "last edge"
              
              // Vertical Label Position
              const vPos = d.settings.labelPos || 'top';
              if (vPos === 'top') ctx.textBaseline = 'bottom';
              else if (vPos === 'bottom') ctx.textBaseline = 'top';
              else ctx.textBaseline = 'middle';

              const yOffset = vPos === 'top' ? -2 : (vPos === 'bottom' ? 2 : 0);
              
              // Label Alignment
              const align = d.settings.labelAlign || 'right'; // left, center, right
              if (align === 'right') {
                ctx.textAlign = 'right';
                ctx.fillText(label, right - margin, y + yOffset);
              } else if (align === 'left') {
                ctx.textAlign = 'left';
                ctx.fillText(label, left + margin, y + yOffset);
              } else {
                ctx.textAlign = 'center';
                ctx.fillText(label, left + w/2, y + yOffset);
              }
            });
          }
          break;

        case DrawingType.LONG_POSITION:
        case DrawingType.SHORT_POSITION:
          if (coords.length >= 2) {
            const isLong = d.type === DrawingType.LONG_POSITION;
            const p0 = d.points[0];
            const p1 = d.points[1];
            const p2 = d.points[2] || { ...p0, price: isLong ? p0.price - (p1.price - p0.price) : p0.price + (p0.price - p1.price) };
            
            const entry = p0.price;
            const target = p1.price;
            const stop = p2.price;

            const startTime = p0.time;
            const endTime = p1.time;
            
            const entryY = getY(entry);
            const targetY = getY(target);
            const stopY = getY(stop);

            const profitColor = '#089981'; // Green
            const lossColor = '#f23645';   // Red
            
            const left = getXFromTime(startTime);
            const right = getXFromTime(endTime);
            const w = right - left;
            const midX = left + w / 2;


            // --- SIMULATION & TRACKING ---
            let hasTriggered = false;
            let triggerTime = null;
            let maxHigh = entry;
            let maxLow = entry;
            let status: 'active' | 'won' | 'lost' = 'active';
            let statusTime: number | null = null;

            for (const candle of this.data) {
                if (candle.time < startTime) continue;
                if (candle.time > endTime) break;

                if (!hasTriggered) {
                    // Position activates when market touches entry price
                    if (candle.low <= entry && candle.high >= entry) {
                        hasTriggered = true;
                        triggerTime = candle.time;
                        maxHigh = candle.high;
                        maxLow = candle.low;
                    } else {
                        continue; 
                    }
                }

                // Track price extremes while trade is active
                maxHigh = Math.max(maxHigh, candle.high);
                maxLow = Math.min(maxLow, candle.low);

                if (isLong) {
                    if (candle.low <= stop) { status = 'lost'; statusTime = candle.time; break; }
                    if (candle.high >= target) { status = 'won'; statusTime = candle.time; break; }
                } else {
                    if (candle.high >= stop) { status = 'lost'; statusTime = candle.time; break; }
                    if (candle.low <= target) { status = 'won'; statusTime = candle.time; break; }
                }
            }

            const lastDataTime = this.data[this.data.length - 1]?.time || Date.now();
            const activeEnd = Math.min(endTime, lastDataTime);
            const outcomeX = (status !== 'active' && statusTime) ? getXFromTime(statusTime) : getXFromTime(activeEnd);

            // --- ZONES ---
            ctx.setLineDash([]);
            
            // 1. Base Zones (Full width, static levels)
            // Use slightly higher opacity for "normal" color
            ctx.fillStyle = profitColor + '40'; // 25%
            ctx.fillRect(left, Math.min(entryY, targetY), w, Math.abs(targetY - entryY));
            ctx.fillStyle = lossColor + '40'; 
            ctx.fillRect(left, Math.min(entryY, stopY), w, Math.abs(stopY - entryY));

            // 2. Dynamic Highlights (Overlay deeper color only on the active/hit range)
            if (hasTriggered) {
                const fillW = outcomeX - left;
                const lastPrice = (status === 'won' ? target : (status === 'lost' ? stop : (this.data[this.data.length-1]?.close || entry)));
                const currentY = getY(lastPrice);

                if (isLong) {
                    if (lastPrice >= entry) {
                        ctx.fillStyle = profitColor + '4D'; // Extra 30% layer
                        ctx.fillRect(left, Math.min(entryY, currentY), fillW, Math.abs(currentY - entryY));
                    } else {
                        ctx.fillStyle = lossColor + '4D';
                        ctx.fillRect(left, Math.min(entryY, currentY), fillW, Math.abs(currentY - entryY));
                    }
                } else {
                    if (lastPrice <= entry) {
                        ctx.fillStyle = profitColor + '4D';
                        ctx.fillRect(left, Math.min(entryY, currentY), fillW, Math.abs(currentY - entryY));
                    } else {
                        ctx.fillStyle = lossColor + '4D';
                        ctx.fillRect(left, Math.min(entryY, currentY), fillW, Math.abs(currentY - entryY));
                    }
                }
            }

            // Guideline (Path)
            if (hasTriggered) {
                ctx.strokeStyle = '#ffffffaa';
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(left, entryY);
                const lastPrice = this.data[this.data.length - 1]?.close || entry;
                const pathEndPrice = status === 'won' ? target : (status === 'lost' ? stop : lastPrice);
                ctx.lineTo(outcomeX, getY(pathEndPrice));
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Central Axis
            ctx.strokeStyle = '#ffffff22';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(midX, Math.min(targetY, stopY));
            ctx.lineTo(midX, Math.max(targetY, stopY));
            ctx.stroke();

            // Entry line
            ctx.strokeStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(left, entryY);
            ctx.lineTo(right, entryY);
            ctx.stroke();

            // --- LABELS & HANDLES (Only visible when selected) ---
            if (isSelected) {
                const qty = 4;
                const pDiff = Math.abs(target - entry);
                const lDiff = Math.abs(stop - entry);
                const rr = pDiff / (lDiff || 0.0001);
                
                const lastPrice = this.data[this.data.length - 1]?.close || entry;
                const pnlPrice = status === 'won' ? target : (status === 'lost' ? stop : lastPrice);
                const currentPnl = (isLong ? (pnlPrice - entry) : (entry - pnlPrice)) * qty * 1000;

                // Center Badge
                ctx.font = '500 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const badgeTitle = `${status === 'active' ? 'Position' : (status === 'won' ? 'Closed' : 'Stopped')} P&L: ${currentPnl.toFixed(1)}`;
                const badgeSub = `Risk/Reward Ratio: ${rr.toFixed(2)}`;
                const bw = Math.max(ctx.measureText(badgeTitle).width, ctx.measureText(badgeSub).width) + 30;
                const bh = 40;
                const bx = midX - bw/2;
                const by = entryY - bh/2;
                
                ctx.shadowBlur = 10;
                ctx.shadowColor = 'rgba(0,0,0,0.4)';
                ctx.fillStyle = status === 'won' ? profitColor : (status === 'lost' ? lossColor : '#1e293bcc');
                this.roundRect(ctx, bx, by, bw, bh, 6, true, false);
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(badgeTitle, midX, by + 13);
                ctx.fillText(badgeSub, midX, by + 27);

                // Tags
                const drawMetricTag = (price: number, diff: number, title: string, color: string, top: boolean) => {
                    const pct = ((diff / entry) * 100).toFixed(3);
                    const amt = (diff * qty * 1000).toFixed(1);
                    const ticks = (diff * 10).toFixed(0); 
                    const txt = `${title}: ${diff.toFixed(1)} (${pct}%) ${ticks}, Amount: ${amt}`;
                    ctx.font = '500 11px sans-serif';
                    const tw = ctx.measureText(txt).width + 20;
                    const th = 24;
                    const tx = midX - tw/2;
                    const ty = top ? getY(price) - th - 8 : getY(price) + 8;
                    ctx.fillStyle = color;
                    this.roundRect(ctx, tx, ty, tw, th, 4, true, false);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(txt, midX, ty + th/2);
                };

                if (isLong) {
                    drawMetricTag(target, pDiff, 'Target', profitColor, true);
                    drawMetricTag(stop, lDiff, 'Stop', lossColor, false);
                } else {
                    drawMetricTag(stop, lDiff, 'Stop', lossColor, true);
                    drawMetricTag(target, pDiff, 'Target', profitColor, false);
                }

                // Simplify entry handles: small white circles
                const hRadius = 4;
                const handles = [
                    { x: left, y: entryY, idx: 0 },
                    { x: right, y: entryY, idx: 4 }
                ];
                ctx.setLineDash([]);
                handles.forEach(h => {
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#2962ff';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(h.x, h.y, hRadius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                });
            }
          }
          break;

        case DrawingType.PRICE_RANGE:
          if (coords.length >= 2) {
            const p1 = d.points[0].price;
            const p2 = d.points[1].price;
            const x1 = coords[0].x;
            const x2 = coords[1].x;
            const y1 = coords[0].y;
            const y2 = coords[1].y;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            
            // Background highlight
            ctx.fillStyle = (d.settings.color || '#3b82f6') + '11';
            const rectX = Math.min(x1, x2);
            const rectY = Math.min(y1, y2);
            const rectW = Math.abs(x2 - x1);
            const rectH = Math.abs(y2 - y1);
            ctx.fillRect(rectX, rectY, rectW, rectH);

            // Boundary lines (Horizontal)
            ctx.setLineDash([2, 2]);
            ctx.strokeStyle = (d.settings.color || '#3b82f6') + '88';
            ctx.beginPath();
            ctx.moveTo(0, y1);
            ctx.lineTo(width, y1);
            ctx.moveTo(0, y2);
            ctx.lineTo(width, y2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Main connecting line at midX
            ctx.beginPath();
            ctx.strokeStyle = d.settings.color || '#3b82f6';
            ctx.lineWidth = d.settings.lineWidth || 1.5;
            ctx.moveTo(midX, y1);
            ctx.lineTo(midX, y2);
            ctx.stroke();
            
            const diff = p2 - p1;
            const pc = (diff / p1) * 100;
            const labelLines = [
              `${diff.toFixed(2)}`,
              `(${pc.toFixed(2)}%)`
            ];

            // Info Box
            ctx.font = 'bold 10px sans-serif';
            const boxPadding = 8;
            let maxW = 0;
            labelLines.forEach(l => maxW = Math.max(maxW, ctx.measureText(l).width));
            
            const boxW = maxW + boxPadding * 2;
            const boxH = (labelLines.length * 14) + boxPadding;
            const boxX = midX - boxW / 2;
            const boxY = midY - boxH / 2;

            ctx.shadowColor = 'rgba(0,0,0,0.2)';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#ffffff';
            this.roundRect(ctx, boxX, boxY, boxW, boxH, 4, true, false);
            ctx.shadowBlur = 0;
            
            ctx.strokeStyle = d.settings.color || '#3b82f6';
            ctx.lineWidth = 1;
            this.roundRect(ctx, boxX, boxY, boxW, boxH, 4, false, true);

            ctx.fillStyle = diff >= 0 ? '#10b981' : '#ef4444'; 
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            labelLines.forEach((line, i) => {
              ctx.fillText(line, midX, boxY + boxPadding + 7 + (i * 14));
            });
          }
          break;

        case DrawingType.DATE_RANGE:
          if (coords.length >= 2) {
            const t1 = d.points[0].time;
            const t2 = d.points[1].time;
            const x1 = coords[0].x;
            const x2 = coords[1].x;
            const y1 = coords[0].y;
            const y2 = coords[1].y;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            
            const start = Math.min(t1, t2);
            const end = Math.max(t1, t2);
            
            // Highlight area
            ctx.fillStyle = (d.settings.color || '#3b82f6') + '11';
            const rectX = Math.min(x1, x2);
            const rectW = Math.abs(x2 - x1);
            ctx.fillRect(rectX, 0, rectW, height);

            // Vertical boundary lines
            ctx.setLineDash([2, 2]);
            ctx.strokeStyle = (d.settings.color || '#3b82f6') + '88';
            ctx.beginPath();
            ctx.moveTo(x1, 0);
            ctx.lineTo(x1, height);
            ctx.moveTo(x2, 0);
            ctx.lineTo(x2, height);
            ctx.stroke();
            ctx.setLineDash([]);

            // Main connecting line at midY
            ctx.beginPath();
            ctx.strokeStyle = d.settings.color || '#3b82f6';
            ctx.lineWidth = d.settings.lineWidth || 1.5;
            ctx.moveTo(x1, midY);
            ctx.lineTo(x2, midY);
            ctx.stroke();

            // Stats calculation
            let bars = 0;
            let totalVolume = 0;
            for (const candle of this.data) {
                if (candle.time >= start && candle.time <= end) {
                    bars++;
                    totalVolume += candle.volume;
                }
            }

            // Duration calculation
            const diffSeconds = end - start;
            const days = Math.floor(diffSeconds / 86400);
            const hours = Math.floor((diffSeconds % 86400) / 3600);
            const mins = Math.floor((diffSeconds % 3600) / 60);
            
            let durationStr = '';
            if (days > 0) durationStr += `${days}d `;
            if (hours > 0 || days > 0) durationStr += `${hours}h `;
            durationStr += `${mins}m`;

            // Volume formatting
            let volStr = totalVolume.toString();
            if (totalVolume >= 1000000) volStr = (totalVolume/1000000).toFixed(2) + 'M';
            else if (totalVolume >= 1000) volStr = (totalVolume/1000).toFixed(2) + 'K';

            // Draw Info Box
            const labelLines = [
              `${bars} bars, ${durationStr}`,
              `Vol: ${volStr}`
            ];
            
            ctx.font = 'bold 10px sans-serif';
            const boxPadding = 8;
            let maxW = 0;
            labelLines.forEach(l => maxW = Math.max(maxW, ctx.measureText(l).width));
            
            const boxW = maxW + boxPadding * 2;
            const boxH = (labelLines.length * 14) + boxPadding;
            const boxX = midX - boxW / 2;
            const boxY = midY - boxH / 2;

            // Box shadow & background
            ctx.shadowColor = 'rgba(0,0,0,0.2)';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#ffffff';
            this.roundRect(ctx, boxX, boxY, boxW, boxH, 4, true, false);
            ctx.shadowBlur = 0;
            
            // Box border
            ctx.strokeStyle = d.settings.color || '#3b82f6';
            ctx.lineWidth = 1;
            this.roundRect(ctx, boxX, boxY, boxW, boxH, 4, false, true);

            // Text
            ctx.fillStyle = '#1e293b';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            labelLines.forEach((line, i) => {
              ctx.fillText(line, midX, boxY + boxPadding + 7 + (i * 14));
            });
          }
          break;

        case DrawingType.ARROW_MARKER:
          if (coords.length >= 2) {
            const fromX = coords[0].x;
            const fromY = coords[0].y;
            const toX = coords[1].x;
            const toY = coords[1].y;
            
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.stroke();
            
            const headlen = 10;
            const angle = Math.atan2(toY - fromY, toX - fromX);
            ctx.beginPath();
            ctx.moveTo(toX, toY);
            ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(toX, toY);
            ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
          }
          break;
      }
    });
    ctx.setLineDash([]);
  }

  public setOnDrawingsChange(callback: (drawings: Drawing[]) => void) {
    this.onDrawingsChange = callback;
  }

  public setOnSelectDrawing(callback: (drawing: Drawing | null) => void) {
    this.onSelectDrawing = callback;
  }

  public setOnDrawingComplete(callback: () => void) {
    this.onDrawingComplete = callback;
  }

  private getHitInfo(x: number, y: number): { id: string; pointIdx: number } | null {
    if (this.data.length === 0) return null;
    const { width, height } = this.canvas.getBoundingClientRect();

    const getX = (idx: number) => {
        const paddingRight = this.sidebarWidth + 10;
        return (width - paddingRight) - (this.data.length - 1 - idx - this.offsetX) * this.zoom;
    };

    let minPriceVisible = Infinity;
    let maxPriceVisible = -Infinity;
    // We reuse logic but it's nested in draw() usually. 
    // Ideally we'd extract price bounds calc.
    // For hit test simplification, we assume priceScale etc is roughly stable or we re-calc.
    // Let's re-calc briefly or store from last draw.
    const paddingRight = this.sidebarWidth + 10;
    const lastIdx = this.data.length - 1;
    const endIdx = Math.min(lastIdx, Math.ceil(lastIdx - this.offsetX + (paddingRight / this.zoom) + 10));
    const startIdx = Math.max(0, Math.floor(endIdx - (width / this.zoom) - 20));

    for (let i = startIdx; i <= endIdx; i++) {
        const d = this.data[i];
        if (d) {
            minPriceVisible = Math.min(minPriceVisible, d.low);
            maxPriceVisible = Math.max(maxPriceVisible, d.high);
        }
    }
    const rangeBuffer = (maxPriceVisible - minPriceVisible) * 0.1;
    const minP = minPriceVisible - rangeBuffer;
    const maxP = maxPriceVisible + rangeBuffer;
    const priceScale = (height * 0.8 * this.yScale) / (maxP - minP || 1);
    const getY = (price: number) => height * 0.9 + this.offsetY - (price - minP) * priceScale;
    
    // Sort drawings to check the currently selected one first (to prioritize it if things overlap)
    const sortedDrawings = [...this.drawings].sort((a, b) => {
      if (a.id === this.selectedDrawingId) return -1;
      if (b.id === this.selectedDrawingId) return 1;
      return 0;
    });

    const lastCandle = this.data[this.data.length - 1];
    const firstCandle = this.data[0];
    const avgInterval = this.data.length > 1 
      ? (lastCandle.time - firstCandle.time) / (this.data.length - 1) 
      : 3600;

    for (const d of sortedDrawings) {
        if (d.settings.hidden) continue;
        
        const coords = d.points.map(p => {
          const idx = (p.time - lastCandle.time) / avgInterval + (this.data.length - 1);
          return {
            x: getX(idx) + this.zoom / 2,
            y: getY(p.price)
          };
        });

        // Check points first
        for (let i = 0; i < coords.length; i++) {
          const dist = Math.sqrt((coords[i].x - x)**2 + (coords[i].y - y)**2);
          if (dist < 15) { 
            return { id: d.id, pointIdx: i };
          }
        }

        // Special cases for infinite lines or rays 
        if (d.type === DrawingType.HORIZONTAL_LINE) {
          const distY = Math.abs(coords[0].y - y);
          if (distY < 15) return { id: d.id, pointIdx: -1 };
        } else if (d.type === DrawingType.HORIZONTAL_RAY) {
          const distY = Math.abs(coords[0].y - y);
          const isRightSide = x >= coords[0].x - 5;
          if (distY < 15 && isRightSide) return { id: d.id, pointIdx: -1 };
        } else if (d.type === DrawingType.VERTICAL_LINE) {
          const distX = Math.abs(coords[0].x - x);
          if (distX < 15) return { id: d.id, pointIdx: -1 };
        }

        if (d.type === DrawingType.FIB_RETRACEMENT) {
          if (coords.length >= 2) {
            const p1 = d.points[0];
            const p2 = d.points[1];
            const diff = p2.price - p1.price;
            const fibLevels = d.settings.levels || [
              { value: 0 }, { value: 0.236 }, { value: 0.382 }, { value: 0.5 }, { value: 0.618 }, { value: 0.786 }, { value: 1 }
            ];
            const left = Math.min(coords[0].x, coords[1].x);
            const right = Math.max(coords[0].x, coords[1].x);

            // Check each visible level line
            for (const lvl of fibLevels) {
              if (lvl.visible === false) continue;
              const yLine = getY(p1.price + diff * lvl.value);
              if (x >= left - 5 && x <= right + 5 && Math.abs(y - yLine) < 8) {
                return { id: d.id, pointIdx: -1 };
              }
            }

            // Check trendline
            const dx = coords[1].x - coords[0].x;
            const dy = coords[1].y - coords[0].y;
            const dist = Math.abs(dy * x - dx * y + coords[1].x * coords[0].y - coords[1].y * coords[0].x) / Math.sqrt(dx * dx + dy * dy);
            if (dist < 8 && x >= Math.min(coords[0].x, coords[1].x) && x <= Math.max(coords[0].x, coords[1].x)) {
              return { id: d.id, pointIdx: -1 };
            }
          }
        }

        // Check path hit (rudimentary distance to segment)
        if (d.type === DrawingType.LONG_POSITION || d.type === DrawingType.SHORT_POSITION) {
          if (coords.length >= 2) {
             const entryY = coords[0].y;
             const targetY = coords[1].y;
             const stopY = coords[2]?.y ?? (entryY - (targetY - entryY));
             
             const left = Math.min(coords[0].x, coords[1].x);
             const right = Math.max(coords[0].x, coords[1].x);
             const midX = (left + right) / 2;
             const w = Math.max(20, right - left);
             
             // Check for adjustment handles
             // 1. Check target/stop levels across entire width (adjustable from anywhere on the line)
             if (x >= left - 5 && x <= right + 5) {
               if (Math.abs(y - targetY) < 10) return { id: d.id, pointIdx: 1 };
               if (Math.abs(y - stopY) < 10) return { id: d.id, pointIdx: 2 };
             }

             // 2. Check entry / side handles
             const handles = [
               { x: left, y: entryY, idx: 0 },
               { x: right, y: entryY, idx: 4 },
               { x: midX, y: entryY, idx: 0 } // Center entry hit
             ];

             for (const h of handles) {
               const dist = Math.sqrt((h.x - x)**2 + (h.y - y)**2);
               if (dist < 12) return { id: d.id, pointIdx: h.idx };
             }

             const top = Math.min(targetY, stopY);
             const bottom = Math.max(targetY, stopY);
             
             if (x >= left && x <= left + w && y >= top && y <= bottom) {
               return { id: d.id, pointIdx: -1 };
             }
          }
        } else if (d.type === DrawingType.PRICE_RANGE) {
          if (coords.length >= 2) {
            const rx = Math.min(coords[0].x, coords[1].x);
            const ry = Math.min(coords[0].y, coords[1].y);
            const rw = Math.abs(coords[1].x - coords[0].x);
            const rh = Math.abs(coords[1].y - coords[0].y);
            if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) {
              return { id: d.id, pointIdx: -1 };
            }
          }
        } else if (d.type === DrawingType.DATE_RANGE) {
          if (coords.length >= 2) {
            const rx = Math.min(coords[0].x, coords[1].x);
            const rw = Math.abs(coords[1].x - coords[0].x);
            if (x >= rx && x <= rx + rw) {
              return { id: d.id, pointIdx: -1 };
            }
          }
        } else if (d.type === DrawingType.RECTANGLE) {
           if (coords.length >= 2) {
            const rx = Math.min(coords[0].x, coords[1].x);
            const ry = Math.min(coords[0].y, coords[1].y);
            const rw = Math.abs(coords[1].x - coords[0].x);
            const rh = Math.abs(coords[1].y - coords[0].y);
            if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) {
              return { id: d.id, pointIdx: -1 };
            }
          }
        }

        if (coords.length >= 2) {
          for (let i = 0; i < coords.length - 1; i++) {
            const p1 = coords[i];
            const p2 = coords[i+1];
            const d2 = (p2.x - p1.x)**2 + (p2.y - p1.y)**2;
            if (d2 === 0) {
              const dist = Math.sqrt((x - p1.x)**2 + (y - p1.y)**2);
              if (dist < 20) return { id: d.id, pointIdx: -1 };
            } else {
              let t = ((x - p1.x) * (p2.x - p1.x) + (y - p1.y) * (p2.y - p1.y)) / d2;
              t = Math.max(0, Math.min(1, t));
              const dist = Math.sqrt((x - (p1.x + t * (p2.x - p1.x)))**2 + (y - (p1.y + t * (p2.y - p1.y)))**2);
              if (dist < 15) return { id: d.id, pointIdx: -1 }; // Hit body
            }
          }
        } else if (coords.length === 1 && (d.type === DrawingType.HORIZONTAL_LINE || d.type === DrawingType.VERTICAL_LINE || d.type === DrawingType.HORIZONTAL_RAY)) {
          // Special cases for infinite lines or rays with 1 point
          if (d.type === DrawingType.HORIZONTAL_LINE || d.type === DrawingType.HORIZONTAL_RAY) {
            const distY = Math.abs(coords[0].y - y);
            const isRay = d.type === DrawingType.HORIZONTAL_RAY;
            const isRightSide = x >= coords[0].x;
            if (distY < 15 && (!isRay || isRightSide)) return { id: d.id, pointIdx: -1 };
          } else if (d.type === DrawingType.VERTICAL_LINE) {
            const distX = Math.abs(coords[0].x - x);
            if (distX < 15) return { id: d.id, pointIdx: -1 };
          }
        }
      }
    return null;
  }

  public setOnLoadMore(callback: () => void) {
    this.onLoadMore = callback;
  }

  public setLoadingMore(loading: boolean) {
    this.isLoadingMore = loading;
  }

  public resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;

    const oldWidth = this.lastWidth;
    const oldHeight = this.lastHeight;
    const oldSidebarWidth = this.sidebarWidth;
    const oldZoom = this.zoom;
    
    // Capture what index (distance from end) is currently at the center
    const paddingRightOld = oldSidebarWidth + 10;
    // indexOffsetFromEnd = (X - (width - paddingRight)) / zoom + offsetX
    const focalIndexOffset = oldWidth > 0 ? ((oldWidth / 2 - (oldWidth - paddingRightOld)) / oldZoom - this.offsetX) : 0;

    // Update dimensions and sidebar
    this.sidebarWidth = (width < 768 || height < 500) ? 50 : 50; 
    const paddingRightNew = this.sidebarWidth + 10;

    // Maintain focal point
    if (oldWidth > 0 && oldHeight > 0) {
        // offsetX_new = ( (center_new - (width_new - paddingRight_new)) / zoom ) - focalIndexOffset
        const newOffsetX = ((-width / 2 + paddingRightNew) / this.zoom) - focalIndexOffset;
        if (!isNaN(newOffsetX) && isFinite(newOffsetX)) {
            this.offsetX = newOffsetX;
        }
        
        // Vertical adjustment to keep similar vertical position
        this.offsetY = (this.offsetY * height) / oldHeight;
    }

    this.lastWidth = width;
    this.lastHeight = height;
    
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    
    // Ensure context is clean and properly scaled
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: boolean, stroke: boolean) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  public draw() {
    if (!this.canvas) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    
    const ctx = this.ctx;
    ctx.setLineDash([]);

    // Background clear is critical
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = this.theme.bg;
    ctx.fillRect(0, 0, width, height);

    if (this.data.length === 0) return;

    // Coordinate System constants
    const paddingRight = this.sidebarWidth + 10; 
    
    const getX = (index: number) => {
        return width - paddingRight - (this.data.length - 1 - index) * this.zoom + (this.offsetX * this.zoom);
    };

    const lastIdx = this.data.length - 1;
    const endIdx = Math.min(lastIdx, Math.ceil(lastIdx - this.offsetX + (paddingRight / this.zoom) + 10));
    const startIdx = Math.max(0, Math.floor(endIdx - (width / this.zoom) - 20));

    let minPriceVisible = Infinity;
    let maxPriceVisible = -Infinity;
    let visibleCount = 0;
    
    for (let i = startIdx; i <= endIdx; i++) {
        const d = this.data[i];
        if (d) {
            minPriceVisible = Math.min(minPriceVisible, d.low);
            maxPriceVisible = Math.max(maxPriceVisible, d.high);
            visibleCount++;
        }
    }

    if (visibleCount === 0 || minPriceVisible === Infinity || isNaN(minPriceVisible)) {
        const recent = this.data.slice(-50);
        minPriceVisible = Math.min(...recent.map(d => d.low)) || 0;
        maxPriceVisible = Math.max(...recent.map(d => d.high)) || 100;
    }

    // Add some padding to price range
    const rangeBuffer = (maxPriceVisible - minPriceVisible) * 0.1;
    const minP = minPriceVisible - rangeBuffer;
    const maxP = maxPriceVisible + rangeBuffer;
    const priceRange = Math.abs(maxP - minP) || 1;
    
    // Applying yScale to expand/compress the visible range
    const priceScale = (height * 0.8 * this.yScale) / priceRange;
    const getY = (price: number) => {
        const y = height * 0.9 - (price - minP) * priceScale + this.offsetY;
        return isNaN(y) ? 0 : y;
    };

    // Draw Grid Lines (aligned with labels)
    if (this.theme.showGrid !== false) {
      ctx.strokeStyle = this.theme.grid;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([]); // Regular grids are solid but very faint in TV

      // 1. Horizontal Price Grid
      const targetLabelCount = Math.max(2, Math.floor(height / 60));
      const rawStep = priceRange / targetLabelCount;
      const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
      const magResChars = rawStep / mag;
      
      let priceStep: number;
      if (magResChars < 1.5) priceStep = 1 * mag;
      else if (magResChars < 3) priceStep = 2 * mag;
      else if (magResChars < 7) priceStep = 5 * mag;
      else priceStep = 10 * mag;

      const firstLabel = Math.floor(minP / priceStep) * priceStep;
      
      for (let p = firstLabel; p <= maxP + priceStep; p += priceStep) {
          const y = getY(p);
          if (y < 0 || y > height) continue;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width - this.sidebarWidth, y);
          ctx.stroke();
      }

      // 2. Vertical Time Grid
      const idealSpacing = 100;
      const indexStep = Math.max(1, Math.ceil(idealSpacing / this.zoom));
      const niceIndexStep = (() => {
          const mag = Math.pow(10, Math.floor(Math.log10(indexStep)));
          const res = indexStep / mag;
          if (res < 1.5) return 1 * mag;
          if (res < 3.5) return 2 * mag;
          if (res < 7.5) return 5 * mag;
          return 10 * mag;
      })();

      for (let i = startIdx; i <= endIdx; i++) {
          if (i % niceIndexStep === 0) {
              const x = getX(i) + this.zoom / 2;
              if (x < 0 || x > width - this.sidebarWidth) continue;
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, height);
              ctx.stroke();
          }
      }
    }

    // Check for infinite scroll trigger
    if (this.onLoadMore && !this.isLoadingMore && startIdx <= 5) {
        const firstCandleX = getX(0);
        if (firstCandleX > -20) {
            this.isLoadingMore = true;
            this.onLoadMore();
        }
    }

    // Price Scale calculations for sidebar labels
    const targetLabelCount = Math.max(2, Math.floor(height / 60));
    const rawStep = priceRange / targetLabelCount;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const magResChars = rawStep / mag;
    
    let priceStep: number;
    if (magResChars < 1.5) priceStep = 1 * mag;
    else if (magResChars < 3) priceStep = 2 * mag;
    else if (magResChars < 7) priceStep = 5 * mag;
    else priceStep = 10 * mag;

    const firstLabel = Math.floor(minP / priceStep) * priceStep;

    // Draw Candles
    for (let i = startIdx; i <= endIdx; i++) {
      const candle = this.data[i];
      const x = getX(i);
      if (x < -this.zoom || x > width - this.sidebarWidth) continue;

      const isUp = candle.close >= candle.open;
      const bodyTop = getY(Math.max(candle.open, candle.close));
      const bodyBottom = getY(Math.min(candle.open, candle.close));
      const bodyHeight = Math.max(1, bodyBottom - bodyTop);

      // Wick
      ctx.strokeStyle = isUp ? this.theme.upWick : this.theme.downWick;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + this.zoom / 2, getY(candle.high));
      ctx.lineTo(x + this.zoom / 2, getY(candle.low));
      ctx.stroke();

      // Body (Border)
      ctx.strokeStyle = isUp ? this.theme.upBorder : this.theme.downBorder;
      ctx.strokeRect(x + 1, bodyTop, Math.max(1, this.zoom - 2), bodyHeight);

      // Body (Fill)
      ctx.fillStyle = isUp ? this.theme.upColor : this.theme.downColor;
      ctx.fillRect(x + 1, bodyTop, Math.max(1, this.zoom - 2), bodyHeight);
    }

    // EMA 20 (Solid Indicator)
    if (this.data.length >= 20) {
      ctx.strokeStyle = '#3b82f6'; // Bright Blue
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let first = true;
      
      // Calculate EMA (Simple approximation for visible range)
      let ema = this.data[0].close;
      const k = 2 / (20 + 1);
      
      for (let i = 0; i < this.data.length; i++) {
        ema = this.data[i].close * k + ema * (1 - k);
        
        if (i >= startIdx && i <= endIdx) {
          const x = getX(i) + this.zoom / 2;
          const y = getY(ema);
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
    }

    // Render Drawings
    this.renderDrawings(ctx, width, height, getX, getY, minP, priceScale);

    // X-Axis Labels (Adaptive Date/Time Labeling)
    ctx.fillStyle = this.theme.text;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    
    const interval = this.data.length > 1 ? this.data[1].time - this.data[0].time : 3600;
    const isIntraday = interval < 86400;
    
    // Calculate how many indices to skip between labels to avoid overlap
    // Aim for ~100px between labels
    const idealSpacing = 100;
    const indexStep = Math.max(1, Math.ceil(idealSpacing / this.zoom));
    
    // Find a "nice" step (1, 2, 5, 10, 20, 50, 100...)
    const niceIndexStep = (() => {
        const mag = Math.pow(10, Math.floor(Math.log10(indexStep)));
        const res = indexStep / mag;
        if (res < 1.5) return 1 * mag;
        if (res < 3.5) return 2 * mag;
        if (res < 7.5) return 5 * mag;
        return 10 * mag;
    })();

    for (let i = startIdx; i <= endIdx; i++) {
        // Only draw labels at nice index positions
        if (i % niceIndexStep === 0) {
            const candle = this.data[i];
            const x = getX(i);
            if (x < 0 || x > width - this.sidebarWidth) continue;

            const date = new Date(candle.time * 1000);
            let label = '';
            
            const prevCandle = i > 0 ? this.data[i-1] : null;
            const prevDate = prevCandle ? new Date(prevCandle.time * 1000) : null;

            if (isIntraday) {
                const isNewDay = !prevDate || prevDate.getDate() !== date.getDate();
                if (isNewDay) {
                    // Show Month Name and Day Date
                    label = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
                } else {
                    // Show HH:mm
                    label = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
                }
            } else {
                const isNewYear = !prevDate || prevDate.getFullYear() !== date.getFullYear();
                const isNewMonth = !prevDate || prevDate.getMonth() !== date.getMonth();

                if (isNewYear) {
                    label = date.getFullYear().toString();
                } else if (isNewMonth) {
                    label = date.toLocaleDateString(undefined, { month: 'short' });
                } else {
                    label = date.getDate().toString();
                }
            }
            
            ctx.fillText(label, x + this.zoom / 2, height - 6);
        }
    }

    // Sidebar Price Labels (Dynamic based on scroll)
    ctx.fillStyle = this.theme.bg;
    ctx.fillRect(width - this.sidebarWidth, 0, this.sidebarWidth, height);

    ctx.fillStyle = this.theme.text;
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    for (let p = firstLabel; p <= maxP + priceStep; p += priceStep) {
        const y = getY(p);
        if (y < -10 || y > height + 10) continue;
        ctx.fillText(p.toFixed(2), width - this.sidebarWidth + 4, y - 5);
    }

    // Current Price Indicator (TradingView Style) - Move here to be on top of sidebar labels
    const lastCandle = this.data[this.data.length - 1];
    if (lastCandle) {
        const currentPriceY = getY(lastCandle.close);
        if (currentPriceY >= 0 && currentPriceY <= height) {
            ctx.strokeStyle = lastCandle.close >= lastCandle.open ? this.theme.upColor : this.theme.downColor;
            ctx.lineWidth = 1;
            
            // Dotted horizontal line indicator of the current market price
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, currentPriceY);
            ctx.lineTo(width - this.sidebarWidth, currentPriceY);
            ctx.stroke();
            ctx.setLineDash([]); 
            
            // Current Price Tag in Sidebar (Drawn last to be on top)
            ctx.fillStyle = ctx.strokeStyle;
            ctx.fillRect(width - this.sidebarWidth, currentPriceY - 8, this.sidebarWidth, 16);
            
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(lastCandle.close.toFixed(2), width - this.sidebarWidth / 2, currentPriceY + 3);
        }
    }

    // Drawing Price Tags
    this.drawings.forEach(d => {
      if (d.settings.hidden) return;
      const points = d.points;
      if (points.length === 0) return;
      
      ctx.fillStyle = d.settings.color || '#000000';
      points.forEach(p => {
        const py = getY(p.price);
        if (py >= 0 && py <= height) {
          ctx.beginPath();
          ctx.moveTo(width - this.sidebarWidth, py);
          ctx.lineTo(width - this.sidebarWidth + 5, py - 8);
          ctx.lineTo(width, py - 8);
          ctx.lineTo(width, py + 8);
          ctx.lineTo(width - this.sidebarWidth + 5, py + 8);
          ctx.closePath();
          ctx.fill();
          
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(p.price.toFixed(2), width - this.sidebarWidth / 2, py + 3);
          ctx.fillStyle = d.settings.color || '#000000';
        }
      });
    });

    // Crosshair
    if (this.mouseX >= 0 && this.mouseY >= 0 && this.mouseX < width - this.sidebarWidth) {
      ctx.strokeStyle = this.theme.text;
      ctx.lineWidth = 1.0;
      ctx.setLineDash([3, 3]); // Dotted crosshair
      
      ctx.beginPath();
      ctx.moveTo(this.mouseX, 0);
      ctx.lineTo(this.mouseX, height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, this.mouseY);
      ctx.lineTo(width - this.sidebarWidth, this.mouseY);
      ctx.stroke();
      
      ctx.setLineDash([]); // Reset dash for subsequent drawing (tags, etc.)

      const crossPrice = (height * 0.9 + this.offsetY - this.mouseY) / priceScale + minP;
      const interval = this.data.length > 1 ? this.data[1].time - this.data[0].time : 3600;
      const isIntraday = interval < 86400;

      // Price Tag (Right Sidebar)
      ctx.fillStyle = '#1e293b'; 
      ctx.fillRect(width - this.sidebarWidth, this.mouseY - 10, this.sidebarWidth, 20);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(crossPrice.toFixed(2), width - this.sidebarWidth / 2, this.mouseY + 4);

      // Time Tag (Bottom Gutter)
      const hoverIdx = Math.floor(lastIdx - this.offsetX + (this.mouseX - (width - paddingRight)) / this.zoom);
      if (hoverIdx >= 0 && hoverIdx < this.data.length) {
          const hoverCandle = this.data[hoverIdx];
          const hoverDate = new Date(hoverCandle.time * 1000);
          const timeStr = hoverDate.toLocaleString(undefined, { 
            day: 'numeric', 
            month: 'short', 
            year: isIntraday ? undefined : 'numeric',
            hour: isIntraday ? '2-digit' : undefined, 
            minute: isIntraday ? '2-digit' : undefined,
            hour12: false 
          });
          
          ctx.font = 'bold 9px monospace';
          const textWidth = ctx.measureText(timeStr).width;
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(this.mouseX - (textWidth + 10) / 2, height - 15, textWidth + 10, 15);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(timeStr, this.mouseX, height - 4);
      }
    }
  }

}
