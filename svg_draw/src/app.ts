// ============================================================
// SVG 绘图工具 - 基于 SVG 的矢量绘图应用
// ============================================================

// ---- Types ----
type ToolType = 'pen' | 'line' | 'rect' | 'circle' | 'eraser';
type BrushStyle = 'solid' | 'dashed' | 'dotted' | 'dashdot' | 'marker' | 'double';

interface Point {
  x: number;
  y: number;
}

interface ShapeStyle {
  stroke: string;
  strokeWidth: number;
  fill: string;
  fillEnabled: boolean;
  strokeDasharray: string;
  opacity: number;
}

interface HistoryEntry {
  svgContent: string; // innerHTML of drawingLayer
}

// ---- State ----
const state = {
  tool: 'pen' as ToolType,
  strokeColor: '#1a1a1a',
  strokeWidth: 3,
  fillColor: '#ff6b6b',
  fillEnabled: false,
  isDrawing: false,
  startPoint: null as Point | null,
  currentPath: [] as Point[],
  history: [] as HistoryEntry[],
  historyIndex: -1,
  elementCount: 0,
  isCtrlPressed: false,
  isShiftPressed: false,

  // For shape preview
  currentPreview: null as SVGElement | null,

  // Brush style
  brushStyle: 'solid' as BrushStyle,

  // Opacity
  opacity: 1.0,
};

// ---- DOM References ----
const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const canvas = $<SVGSVGElement>('drawingCanvas');
const drawingLayer = $<SVGGElement>('drawingLayer');
const previewLayer = $<SVGGElement>('previewLayer');
const elementCountEl = $<HTMLElement>('elementCount');
const coordInfoEl = $<HTMLElement>('coordDisplay');

// ---- Coordinate Helpers ----
function getSVGCoords(e: MouseEvent): Point {
  const rect = canvas.getBoundingClientRect();
  const viewBox = canvas.viewBox.baseVal;
  const scaleX = viewBox.width / rect.width;
  const scaleY = viewBox.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

// ---- Style Getters ----
function getDashArray(brush: BrushStyle): string {
  switch (brush) {
    case 'dashed': return '8,5';
    case 'dotted': return '2,4';
    case 'dashdot': return '8,5,2,5';
    case 'marker': return '';
    case 'double': return '0,6';
    default: return '';
  }
}

function getCurrentStyle(): ShapeStyle {
  return {
    stroke: state.tool === 'eraser' ? '#ffffff' : state.strokeColor,
    strokeWidth: state.tool === 'eraser' ? Math.max(state.strokeWidth, 10) : state.strokeWidth,
    fill: state.fillColor,
    fillEnabled: state.fillEnabled && state.tool !== 'pen' && state.tool !== 'eraser' && state.tool !== 'line',
    strokeDasharray: getDashArray(state.brushStyle),
    opacity: state.brushStyle === 'marker' ? Math.min(state.opacity, 0.5) : state.opacity,
  };
}

// ---- History Management ----
function saveSnapshot(): void {
  // Remove entries after current index (redo stack)
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push({
    svgContent: drawingLayer.innerHTML,
  });
  if (state.history.length > 100) {
    state.history.shift();
  }
  state.historyIndex = state.history.length - 1;
  updateElementCount();
  updateUndoRedoButtons();
}

function undo(): void {
  if (state.historyIndex > 0) {
    state.historyIndex--;
    restoreSnapshot();
  }
  updateUndoRedoButtons();
}

function redo(): void {
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex++;
    restoreSnapshot();
  }
  updateUndoRedoButtons();
}

function restoreSnapshot(): void {
  const entry = state.history[state.historyIndex];
  if (entry) {
    drawingLayer.innerHTML = entry.svgContent;
  }
  updateElementCount();
}

function updateElementCount(): void {
  const children = drawingLayer.children;
  state.elementCount = 0;
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as SVGElement;
    // Only count actual drawing elements, not utility elements
    if (child.tagName !== 'rect' || !child.classList.contains('canvas-bg')) {
      state.elementCount++;
    }
  }
  elementCountEl.textContent = `元素: ${state.elementCount}`;
}

function updateUndoRedoButtons(): void {
  const undoBtn = $<HTMLButtonElement>('undoBtn');
  const redoBtn = $<HTMLButtonElement>('redoBtn');
  undoBtn.classList.toggle('disabled', state.historyIndex <= 0);
  redoBtn.classList.toggle('disabled', state.historyIndex >= state.history.length - 1);
  undoBtn.style.opacity = state.historyIndex <= 0 ? '0.4' : '1';
  redoBtn.style.opacity = state.historyIndex >= state.history.length - 1 ? '0.4' : '1';
}

// ---- Drawing Functions ----

/** Create an SVG element with attributes */
function createSVGElement(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

/** Build path data from points for smooth freehand drawing */
function buildSmoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0]!;
    return `M${p.x},${p.y} L${p.x + 0.01},${p.y}`;
  }

  let d = `M${points[0]!.x},${points[0]!.y}`;
  // Use quadratic bezier curves between midpoints for smooth lines
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i]!.x + points[i + 1]!.x) / 2;
    const midY = (points[i]!.y + points[i + 1]!.y) / 2;
    d += ` Q${points[i]!.x},${points[i]!.y} ${midX},${midY}`;
  }
  // Last segment
  const last = points[points.length - 1]!;
  d += ` Q${last.x},${last.y} ${last.x},${last.y}`;
  return d;
}

/** Determine fill attribute for a shape */
function getFillValue(el: SVGElement, style: ShapeStyle): string {
  if (el.tagName === 'line' || el.tagName === 'path') return 'none';
  return style.fillEnabled ? style.fill : 'none';
}

// ---- Tool Handlers ----

function onPointerDown(e: MouseEvent): void {
  if (e.button !== 0) return; // left click only
  state.isDrawing = true;
  const pt = getSVGCoords(e);
  state.startPoint = pt;
  state.currentPath = [pt];

  const style = getCurrentStyle();

  if (state.tool === 'pen' || state.tool === 'eraser') {
    // Freehand: create a path element immediately
    const path = createSVGElement('path', {
      d: `M${pt.x},${pt.y}`,
      fill: 'none',
      stroke: style.stroke,
      'stroke-width': String(style.strokeWidth),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    if (style.strokeDasharray) {
      path.setAttribute('stroke-dasharray', style.strokeDasharray);
    }
    if (style.opacity < 1.0) {
      path.setAttribute('stroke-opacity', String(style.opacity));
    }
    // Double brush: overlay a thinner, lighter path for a dual-line effect
    if (state.brushStyle === 'double' && state.tool !== 'eraser') {
      const innerPath = createSVGElement('path', {
        d: `M${pt.x},${pt.y}`,
        fill: 'none',
        stroke: style.stroke,
        'stroke-width': String(Math.max(1, style.strokeWidth * 0.4)),
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-opacity': '0.5',
      });
      innerPath.style.pointerEvents = 'none';
      drawingLayer.appendChild(innerPath);
    }
    drawingLayer.appendChild(path);
    state.currentPreview = path;
  } else {
    // Shapes: create preview element in preview layer
    const tag = state.tool === 'line' ? 'line' : state.tool === 'rect' ? 'rect' : 'ellipse';
    previewLayer.innerHTML = '';

    let previewEl: SVGElement;
    const dashAttr = style.strokeDasharray ? { 'stroke-dasharray': style.strokeDasharray } : {};
    if (tag === 'line') {
      previewEl = createSVGElement('line', {
        x1: String(pt.x),
        y1: String(pt.y),
        x2: String(pt.x),
        y2: String(pt.y),
        stroke: style.stroke,
        'stroke-width': String(style.strokeWidth),
        'stroke-linecap': 'round',
        ...dashAttr,
      });
    } else if (tag === 'rect') {
      previewEl = createSVGElement('rect', {
        x: String(pt.x),
        y: String(pt.y),
        width: '0',
        height: '0',
        stroke: style.stroke,
        'stroke-width': String(style.strokeWidth),
        fill: style.fillEnabled ? style.fill : 'none',
        rx: '0',
        ...dashAttr,
      });
    } else {
      // ellipse
      previewEl = createSVGElement('ellipse', {
        cx: String(pt.x),
        cy: String(pt.y),
        rx: '0',
        ry: '0',
        stroke: style.stroke,
        'stroke-width': String(style.strokeWidth),
        fill: style.fillEnabled ? style.fill : 'none',
        ...dashAttr,
      });
    }
    if (style.opacity < 1.0) {
      previewEl.setAttribute('stroke-opacity', String(style.opacity));
    }
    previewLayer.appendChild(previewEl);
    state.currentPreview = previewEl;
  }
}

function onPointerMove(e: MouseEvent): void {
  const pt = getSVGCoords(e);

  // Update coordinate display
  coordInfoEl.textContent = `坐标: ${Math.round(pt.x)}, ${Math.round(pt.y)}`;

  if (!state.isDrawing) return;

  const style = getCurrentStyle();

  if (state.tool === 'pen' || state.tool === 'eraser') {
    state.currentPath.push(pt);
    if (state.currentPreview) {
      const d = buildSmoothPath(state.currentPath);
      state.currentPreview.setAttribute('d', d);
      // Update double brush companion path
      if (state.brushStyle === 'double' && state.currentPreview.previousSibling) {
        const prev = state.currentPreview.previousSibling as SVGElement;
        if (prev.tagName === 'path' && prev.getAttribute('stroke-opacity') === '0.5') {
          prev.setAttribute('d', d);
        }
      }
    }
  } else if (state.currentPreview && state.startPoint) {
    const start = state.startPoint;
    let x1 = start.x, y1 = start.y;
    let x2 = pt.x, y2 = pt.y;

    // Shift key constraint for shapes
    if (state.isShiftPressed) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      if (state.tool === 'line') {
        // Snap line direction to 0°, 45°, 90°, etc.
        const angle = Math.atan2(dy, dx);
        const len = Math.sqrt(dx * dx + dy * dy);
        const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        x2 = x1 + len * Math.cos(snapped);
        y2 = y1 + len * Math.sin(snapped);
      } else if (state.tool === 'rect') {
        // For rect in onPointerMove, shift is handled in the rect branch below
        // Just use the raw dx/dy - the rect branch will constrain to square
      } else if (state.tool === 'circle') {
        // For circle in onPointerMove, shift is handled in the circle branch below
      }
    }

    const tag = state.tool;
    if (tag === 'line') {
      state.currentPreview.setAttribute('x1', String(x1));
      state.currentPreview.setAttribute('y1', String(y1));
      state.currentPreview.setAttribute('x2', String(x2));
      state.currentPreview.setAttribute('y2', String(y2));
    } else if (tag === 'rect') {
      const rx = Math.min(x1, x2);
      const ry = Math.min(y1, y2);
      let w = Math.abs(x2 - x1);
      let h = Math.abs(y2 - y1);
      // Shift: constrain to square
      if (state.isShiftPressed) {
        const side = Math.max(w, h);
        w = side;
        h = side;
      }
      state.currentPreview.setAttribute('x', String(rx));
      state.currentPreview.setAttribute('y', String(ry));
      state.currentPreview.setAttribute('width', String(w));
      state.currentPreview.setAttribute('height', String(h));
    } else if (tag === 'circle') {
      let cx = (x1 + x2) / 2;
      let cy = (y1 + y2) / 2;
      let rx = Math.abs(x2 - x1) / 2;
      let ry = Math.abs(y2 - y1) / 2;
      // Shift: constrain to perfect circle
      if (state.isShiftPressed) {
        const r = Math.max(rx, ry);
        rx = r;
        ry = r;
      }
      state.currentPreview.setAttribute('cx', String(cx));
      state.currentPreview.setAttribute('cy', String(cy));
      state.currentPreview.setAttribute('rx', String(rx));
      state.currentPreview.setAttribute('ry', String(ry));
    }
  }
}

function onPointerUp(e: MouseEvent): void {
  if (!state.isDrawing) return;
  state.isDrawing = false;

  const style = getCurrentStyle();

  if (state.tool === 'pen' || state.tool === 'eraser') {
    // The path is already in drawingLayer
    if (state.currentPreview && state.currentPath.length > 1) {
      const d = buildSmoothPath(state.currentPath);
      state.currentPreview.setAttribute('d', d);
    } else if (state.currentPreview && state.currentPath.length <= 1) {
      // Single dot: draw a small circle or remove
      state.currentPreview.remove();
    }
    state.currentPreview = null;
    state.currentPath = [];
  } else {
    // Shapes: move preview to drawing layer
    if (state.currentPreview && state.startPoint) {
      const pt = getSVGCoords(e);
      const start = state.startPoint;
      let x2 = pt.x, y2 = pt.y;

      if (state.isShiftPressed) {
        const dx = x2 - start.x;
        const dy = y2 - start.y;
        if (state.tool === 'line') {
          const angle = Math.atan2(dy, dx);
          const len = Math.sqrt(dx * dx + dy * dy);
          const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          x2 = start.x + len * Math.cos(snapped);
          y2 = start.y + len * Math.sin(snapped);
        } else if (state.tool === 'rect') {
          const side = Math.max(Math.abs(dx), Math.abs(dy));
          x2 = start.x + Math.sign(dx) * side;
          y2 = start.y + Math.sign(dy) * side;
        } else if (state.tool === 'circle') {
          const r = Math.max(Math.abs(dx), Math.abs(dy));
          x2 = start.x + Math.sign(dx) * r;
          y2 = start.y + Math.sign(dy) * r;
        }
      }

      // Check if shape has size
      const hasSize =
        (state.tool === 'line' && (Math.abs(x2 - start.x) > 1 || Math.abs(y2 - start.y) > 1)) ||
        (state.tool === 'rect' && (Math.abs(x2 - start.x) > 1 || Math.abs(y2 - start.y) > 1)) ||
        (state.tool === 'circle' && (Math.abs(x2 - start.x) > 1 || Math.abs(y2 - start.y) > 1));

      if (hasSize) {
        // Update fill for final shape
        const fillVal = getFillValue(state.currentPreview, style);
        state.currentPreview.setAttribute('fill', fillVal);
        // Move from preview to drawing layer
        drawingLayer.appendChild(state.currentPreview);
      } else {
        previewLayer.innerHTML = '';
      }
    }
    previewLayer.innerHTML = '';
    state.currentPreview = null;
  }

  state.startPoint = null;
  saveSnapshot();
}

// ---- Export Functions ----

/** Build a clean SVG clone ready for export */
function buildExportClone(): SVGSVGElement {
  const clone = canvas.cloneNode(true) as SVGSVGElement;

  // Remove preview layer
  const clonePreview = clone.querySelector('#previewLayer') as SVGGElement;
  if (clonePreview) clonePreview.innerHTML = '';

  // Optionally remove background rect
  const includeBg = $<HTMLInputElement>('exportIncludeBg').checked;
  if (!includeBg) {
    const bgRect = clone.querySelector('.canvas-bg') as SVGRectElement;
    if (bgRect) bgRect.remove();
  }

  // Keep full canvas viewBox
  const vb = canvas.viewBox.baseVal;
  clone.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
  clone.setAttribute('width', String(vb.width));
  clone.setAttribute('height', String(vb.height));

  // Ensure proper XML namespace
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  return clone;
}

function exportSVG(): void {
  const clone = buildExportClone();
  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(clone);
  svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString;

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, 'svg');
  closeExportDialog();
}

function exportPNG(): void {
  const clone = buildExportClone();
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const vb = canvas.viewBox.baseVal;
  const cropW = vb.width;
  const cropH = vb.height;

  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = cropW;
    c.height = cropH;
    const ctx = c.getContext('2d')!;

    const includeBg = $<HTMLInputElement>('exportIncludeBg').checked;
    if (includeBg) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
    }

    ctx.drawImage(img, 0, 0);

    c.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, 'png');
      URL.revokeObjectURL(url);
    }, 'image/png');
  };
  img.onerror = () => {
    alert('PNG 导出失败，可能是浏览器安全策略导致。请使用 SVG 导出。');
    URL.revokeObjectURL(url);
  };
  img.src = url;
  closeExportDialog();
}

function downloadBlob(blob: Blob, ext: 'svg' | 'png'): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
  link.download = `drawing-${timestamp}.${ext}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---- Export Dialog ----

function openExportDialog(): void {
  const vb = canvas.viewBox.baseVal;
  $<HTMLElement>('exportInfo').textContent = `导出尺寸: ${vb.width} × ${vb.height}`;
  $<HTMLElement>('exportModal').classList.add('active');
}

function closeExportDialog(): void {
  $<HTMLElement>('exportModal').classList.remove('active');
}

function clearCanvas(): void {
  if (state.elementCount === 0) return;
  if (!confirm('确定要清空画布吗？')) return;
  drawingLayer.innerHTML = '';
  previewLayer.innerHTML = '';
  state.history = [];
  state.historyIndex = -1;
  saveSnapshot(); // save empty state
  updateElementCount();
}

// ---- Tool Switching ----
function setTool(tool: ToolType): void {
  state.tool = tool;
  document.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tool') === tool);
  });
  // Update cursor
  canvas.classList.toggle('drawing-eraser', tool === 'eraser');
}

// ---- Init ----
function init(): void {
  // Tool buttons
  document.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tool = btn.getAttribute('data-tool') as ToolType;
      if (tool) setTool(tool);
    });
  });

  // Color pickers
  const strokeColorInput = $<HTMLInputElement>('strokeColor');
  strokeColorInput.addEventListener('input', () => {
    state.strokeColor = strokeColorInput.value;
  });

  const fillColorInput = $<HTMLInputElement>('fillColor');
  fillColorInput.addEventListener('input', () => {
    state.fillColor = fillColorInput.value;
  });

  // Brush style buttons
  document.querySelectorAll('.brush-btn[data-brush]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const brush = btn.getAttribute('data-brush') as BrushStyle;
      if (brush) {
        state.brushStyle = brush;
        document.querySelectorAll('.brush-btn').forEach((b) => {
          b.classList.toggle('active', b.getAttribute('data-brush') === brush);
        });
      }
    });
  });

  // Stroke width
  const strokeWidthInput = $<HTMLInputElement>('strokeWidth');
  const strokeWidthValue = $<HTMLElement>('strokeWidthValue');
  strokeWidthInput.addEventListener('input', () => {
    state.strokeWidth = parseInt(strokeWidthInput.value, 10);
    strokeWidthValue.textContent = String(state.strokeWidth);
  });

  // Fill toggle
  const fillToggle = $<HTMLInputElement>('fillToggle');
  fillToggle.addEventListener('change', () => {
    state.fillEnabled = fillToggle.checked;
  });

  // Opacity control
  const opacityInput = $<HTMLInputElement>('strokeOpacity');
  const opacityValue = $<HTMLElement>('strokeOpacityValue');
  if (opacityInput) {
    opacityInput.addEventListener('input', () => {
      state.opacity = parseFloat(opacityInput.value);
      opacityValue.textContent = String(Math.round(state.opacity * 100)) + '%';
    });
  }

  // Canvas events
  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mousemove', onPointerMove);
  canvas.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('mouseleave', (e: MouseEvent) => {
    // If drawing and mouse leaves canvas, consider it cancelled for shapes, but finish for pen
    if (state.isDrawing && (state.tool === 'line' || state.tool === 'rect' || state.tool === 'circle')) {
      previewLayer.innerHTML = '';
      state.isDrawing = false;
      state.currentPreview = null;
      state.startPoint = null;
    } else if (state.isDrawing) {
      onPointerUp(e);
    }
  });

  // Keyboard events
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    state.isCtrlPressed = e.ctrlKey || e.metaKey;
    state.isShiftPressed = e.shiftKey;

    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      redo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Z') {
      e.preventDefault();
      redo();
    } else if (e.key === 'Escape') {
      if ($<HTMLElement>('exportModal').classList.contains('active')) {
        closeExportDialog();
      } else if (state.isDrawing) {
        previewLayer.innerHTML = '';
        state.isDrawing = false;
        state.currentPreview = null;
        state.startPoint = null;
      }
    }
  });

  document.addEventListener('keyup', (e: KeyboardEvent) => {
    state.isCtrlPressed = e.ctrlKey || e.metaKey;
    state.isShiftPressed = e.shiftKey;
  });

  // Keep shift state when window loses focus
  window.addEventListener('blur', () => {
    state.isShiftPressed = false;
    state.isCtrlPressed = false;
  });

  // Undo / Redo buttons
  $<HTMLButtonElement>('undoBtn').addEventListener('click', undo);
  $<HTMLButtonElement>('redoBtn').addEventListener('click', redo);

  // Clear
  $<HTMLButtonElement>('clearBtn').addEventListener('click', clearCanvas);

  // ---- Export Dialog ----
  $<HTMLButtonElement>('exportDialogBtn').addEventListener('click', openExportDialog);
  $<HTMLButtonElement>('modalCloseBtn').addEventListener('click', closeExportDialog);
  $<HTMLButtonElement>('exportSvgBtn').addEventListener('click', exportSVG);
  $<HTMLButtonElement>('exportPngBtn').addEventListener('click', exportPNG);

  // Close modal on overlay click
  const modalOverlay = $<HTMLElement>('exportModal');
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeExportDialog();
  });

  // Initial snapshot
  saveSnapshot();

  // Set initial active tool
  setTool('pen');
}

// ---- Start ----
document.addEventListener('DOMContentLoaded', init);
