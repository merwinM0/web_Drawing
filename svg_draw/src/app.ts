// ============================================================
// SVG 绘图工具 - 基于 SVG 的矢量绘图应用
// ============================================================

// ---- Types ----
type ToolType = 'pen' | 'line' | 'rect' | 'circle' | 'eraser';

interface Point {
  x: number;
  y: number;
}

interface ShapeStyle {
  stroke: string;
  strokeWidth: number;
  fill: string;
  fillEnabled: boolean;
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

  // For crop selection
  isCropSelecting: false,
  cropSelectStart: null as Point | null,
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
function getCurrentStyle(): ShapeStyle {
  return {
    stroke: state.tool === 'eraser' ? '#ffffff' : state.strokeColor,
    strokeWidth: state.tool === 'eraser' ? Math.max(state.strokeWidth, 10) : state.strokeWidth,
    fill: state.fillColor,
    fillEnabled: state.fillEnabled && state.tool !== 'pen' && state.tool !== 'eraser' && state.tool !== 'line',
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

// ---- Crop Selection Handlers ----
function enterCropSelectMode(): void {
  state.isCropSelecting = true;
  canvas.classList.add('crop-selecting');
  // Cancel any ongoing drawing
  state.isDrawing = false;
  state.currentPreview = null;
  state.startPoint = null;
  previewLayer.innerHTML = '';
  $<HTMLButtonElement>('cropSelectBtn').classList.add('active');
}

function exitCropSelectMode(): void {
  state.isCropSelecting = false;
  state.isDrawing = false;
  state.cropSelectStart = null;
  state.currentPreview = null;
  previewLayer.innerHTML = '';
  canvas.classList.remove('crop-selecting');
  $<HTMLButtonElement>('cropSelectBtn').classList.remove('active');
}

function onCropSelectPointerDown(e: MouseEvent): void {
  if (e.button !== 0) return;
  state.isDrawing = true;
  const pt = getSVGCoords(e);
  state.cropSelectStart = pt;

  previewLayer.innerHTML = '';
  const rect = createSVGElement('rect', {
    x: String(pt.x),
    y: String(pt.y),
    width: '0',
    height: '0',
    stroke: '#4a6cf7',
    'stroke-width': '1.5',
    'stroke-dasharray': '6,3',
    fill: 'rgba(74, 108, 247, 0.08)',
  });
  previewLayer.appendChild(rect);
  state.currentPreview = rect;
}

function onCropSelectPointerMove(e: MouseEvent): void {
  if (!state.isDrawing || !state.cropSelectStart) return;
  const pt = getSVGCoords(e);
  const start = state.cropSelectStart;
  const x = Math.min(start.x, pt.x);
  const y = Math.min(start.y, pt.y);
  const w = Math.abs(pt.x - start.x);
  const h = Math.abs(pt.y - start.y);
  if (state.currentPreview) {
    state.currentPreview.setAttribute('x', String(x));
    state.currentPreview.setAttribute('y', String(y));
    state.currentPreview.setAttribute('width', String(w));
    state.currentPreview.setAttribute('height', String(h));
  }
}

function onCropSelectPointerUp(e: MouseEvent): void {
  if (!state.isDrawing || !state.cropSelectStart) return;
  state.isDrawing = false;

  const pt = getSVGCoords(e);
  const start = state.cropSelectStart;
  const x = Math.min(start.x, pt.x);
  const y = Math.min(start.y, pt.y);
  const w = Math.abs(pt.x - start.x);
  const h = Math.abs(pt.y - start.y);

  if (w > 5 && h > 5) {
    $<HTMLInputElement>('cropX').value = String(Math.round(x));
    $<HTMLInputElement>('cropY').value = String(Math.round(y));
    $<HTMLInputElement>('cropW').value = String(Math.round(w));
    $<HTMLInputElement>('cropH').value = String(Math.round(h));
    updateExportInfo();
    toggleCropOverlay(true);
    $<HTMLInputElement>('showCropPreview').checked = true;
  }

  previewLayer.innerHTML = '';
  state.cropSelectStart = null;
  state.currentPreview = null;
  exitCropSelectMode();
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
  if (state.isCropSelecting) {
    onCropSelectPointerDown(e);
    return;
  }
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
    drawingLayer.appendChild(path);
    state.currentPreview = path;
  } else {
    // Shapes: create preview element in preview layer
    const tag = state.tool === 'line' ? 'line' : state.tool === 'rect' ? 'rect' : 'ellipse';
    previewLayer.innerHTML = '';

    let previewEl: SVGElement;
    if (tag === 'line') {
      previewEl = createSVGElement('line', {
        x1: String(pt.x),
        y1: String(pt.y),
        x2: String(pt.x),
        y2: String(pt.y),
        stroke: style.stroke,
        'stroke-width': String(style.strokeWidth),
        'stroke-linecap': 'round',
      });
    } else if (tag === 'rect') {
      previewEl = createSVGElement('rect', {
        x: String(pt.x),
        y: String(pt.y),
        width: '0',
        height: '0',
        stroke: style.stroke,
        'stroke-width': String(style.strokeWidth),
        fill: getFillValue(previewEl!, style),
        rx: '0',
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
        fill: getFillValue(previewEl!, style),
      });
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
  if (state.isCropSelecting) {
    onCropSelectPointerMove(e);
    return;
  }

  const style = getCurrentStyle();

  if (state.tool === 'pen' || state.tool === 'eraser') {
    state.currentPath.push(pt);
    if (state.currentPreview) {
      const d = buildSmoothPath(state.currentPath);
      state.currentPreview.setAttribute('d', d);
    }
  } else if (state.currentPreview && state.startPoint) {
    const start = state.startPoint;
    let x1 = start.x, y1 = start.y;
    let x2 = pt.x, y2 = pt.y;

    // Shift key constraint for shapes
    if (state.isShiftPressed) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const angle = Math.atan2(dy, dx);
      const len = Math.sqrt(dx * dx + dy * dy);
      // Snap to 0°, 45°, 90°, etc.
      const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      x2 = x1 + len * Math.cos(snapped);
      y2 = y1 + len * Math.sin(snapped);
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
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      state.currentPreview.setAttribute('x', String(rx));
      state.currentPreview.setAttribute('y', String(ry));
      state.currentPreview.setAttribute('width', String(w));
      state.currentPreview.setAttribute('height', String(h));
    } else if (tag === 'circle') {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      state.currentPreview.setAttribute('cx', String(cx));
      state.currentPreview.setAttribute('cy', String(cy));
      state.currentPreview.setAttribute('rx', String(rx));
      state.currentPreview.setAttribute('ry', String(ry));
    }
  }
}

function onPointerUp(e: MouseEvent): void {
  if (!state.isDrawing) return;
  if (state.isCropSelecting) {
    onCropSelectPointerUp(e);
    return;
  }
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

    // Update fill for path if eraser - ensure it's always 'none'
    // (already handled in onPointerDown)
  } else {
    // Shapes: move preview to drawing layer
    if (state.currentPreview && state.startPoint) {
      const pt = getSVGCoords(e);
      const start = state.startPoint;
      let x2 = pt.x, y2 = pt.y;

      if (state.isShiftPressed) {
        const dx = x2 - start.x;
        const dy = y2 - start.y;
        const angle = Math.atan2(dy, dx);
        const len = Math.sqrt(dx * dx + dy * dy);
        const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        x2 = start.x + len * Math.cos(snapped);
        y2 = start.y + len * Math.sin(snapped);
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

  // Apply crop (viewBox)
  const cropX = parseInt($<HTMLInputElement>('cropX').value, 10) || 0;
  const cropY = parseInt($<HTMLInputElement>('cropY').value, 10) || 0;
  const cropW = parseInt($<HTMLInputElement>('cropW').value, 10) || 1;
  const cropH = parseInt($<HTMLInputElement>('cropH').value, 10) || 1;

  clone.setAttribute('viewBox', `${cropX} ${cropY} ${cropW} ${cropH}`);
  clone.setAttribute('width', String(cropW));
  clone.setAttribute('height', String(cropH));

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

  const cropW = parseInt($<HTMLInputElement>('cropW').value, 10) || 1000;
  const cropH = parseInt($<HTMLInputElement>('cropH').value, 10) || 700;

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

let cropOverlayRect: SVGRectElement | null = null;

function openExportDialog(): void {
  // Reset form to current canvas values
  const vb = canvas.viewBox.baseVal;
  $<HTMLInputElement>('cropX').value = '0';
  $<HTMLInputElement>('cropY').value = '0';
  $<HTMLInputElement>('cropW').value = String(vb.width);
  $<HTMLInputElement>('cropH').value = String(vb.height);
  updateExportInfo();
  $<HTMLElement>('exportModal').classList.add('active');
  removeCropOverlay();
  $<HTMLInputElement>('showCropPreview').checked = false;
}

function closeExportDialog(): void {
  $<HTMLElement>('exportModal').classList.remove('active');
  removeCropOverlay();
  exitCropSelectMode();
}

function updateExportInfo(): void {
  const w = parseInt($<HTMLInputElement>('cropW').value, 10) || 0;
  const h = parseInt($<HTMLInputElement>('cropH').value, 10) || 0;
  $<HTMLElement>('exportInfo').textContent = `导出尺寸: ${w} × ${h}`;
}

function resetCrop(): void {
  $<HTMLInputElement>('cropX').value = '0';
  $<HTMLInputElement>('cropY').value = '0';
  const vb = canvas.viewBox.baseVal;
  $<HTMLInputElement>('cropW').value = String(vb.width);
  $<HTMLInputElement>('cropH').value = String(vb.height);
  updateExportInfo();
}

function toggleCropOverlay(show: boolean): void {
  removeCropOverlay();
  if (!show) return;

  const x = parseInt($<HTMLInputElement>('cropX').value, 10) || 0;
  const y = parseInt($<HTMLInputElement>('cropY').value, 10) || 0;
  const w = parseInt($<HTMLInputElement>('cropW').value, 10) || 0;
  const h = parseInt($<HTMLInputElement>('cropH').value, 10) || 0;

  if (w <= 0 || h <= 0) return;

  cropOverlayRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  cropOverlayRect.setAttribute('class', 'crop-overlay');
  cropOverlayRect.setAttribute('x', String(x));
  cropOverlayRect.setAttribute('y', String(y));
  cropOverlayRect.setAttribute('width', String(w));
  cropOverlayRect.setAttribute('height', String(h));
  // Insert before previewLayer so it appears on top
  canvas.insertBefore(cropOverlayRect, previewLayer);
}

function removeCropOverlay(): void {
  if (cropOverlayRect && cropOverlayRect.parentNode) {
    cropOverlayRect.parentNode.removeChild(cropOverlayRect);
  }
  cropOverlayRect = null;
}

// Track the last non-focused crop field for aspect ratio lock
let lastCropField: 'w' | 'h' | null = null;

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
      if (state.isCropSelecting) {
        exitCropSelectMode();
      }
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
  $<HTMLButtonElement>('resetCropBtn').addEventListener('click', resetCrop);

  // Close modal on overlay click
  const modalOverlay = $<HTMLElement>('exportModal');
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeExportDialog();
  });

  // Crop input events — update info & overlays
  const cropInputs: (keyof HTMLInputElement)[] = ['cropX', 'cropY', 'cropW', 'cropH'];
  cropInputs.forEach(id => {
    const el = $<HTMLInputElement>(id);
    el.addEventListener('input', () => {
      updateExportInfo();
      if ($<HTMLInputElement>('showCropPreview').checked) {
        toggleCropOverlay(true);
      }
    });
  });

  // Aspect ratio lock
  const cropW = $<HTMLInputElement>('cropW');
  const cropH = $<HTMLInputElement>('cropH');
  cropW.addEventListener('focus', () => { lastCropField = 'w'; });
  cropH.addEventListener('focus', () => { lastCropField = 'h'; });

  const lockAspect = $<HTMLInputElement>('cropLockAspect');
  cropW.addEventListener('input', () => {
    if (lockAspect.checked && lastCropField === 'w') {
      const w = parseInt(cropW.value, 10) || 1;
      const vb = canvas.viewBox.baseVal;
      const ratio = vb.height / vb.width;
      cropH.value = String(Math.round(w * ratio));
      updateExportInfo();
    }
  });
  cropH.addEventListener('input', () => {
    if (lockAspect.checked && lastCropField === 'h') {
      const h = parseInt(cropH.value, 10) || 1;
      const vb = canvas.viewBox.baseVal;
      const ratio = vb.width / vb.height;
      cropW.value = String(Math.round(h * ratio));
      updateExportInfo();
    }
  });

  // Show crop preview on canvas
  $<HTMLInputElement>('showCropPreview').addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    toggleCropOverlay(checked);
  });

  // Crop select button
  const cropSelectBtn = $<HTMLButtonElement>('cropSelectBtn');
  cropSelectBtn.addEventListener('click', () => {
    if (state.isCropSelecting) {
      exitCropSelectMode();
    } else {
      enterCropSelectMode();
    }
  });

  // Initial snapshot
  saveSnapshot();

  // Set initial active tool
  setTool('pen');
}

// ---- Start ----
document.addEventListener('DOMContentLoaded', init);
