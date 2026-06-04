// src/app.ts
var state = {
  tool: "pen",
  strokeColor: "#1a1a1a",
  strokeWidth: 3,
  fillColor: "#ff6b6b",
  fillEnabled: false,
  isDrawing: false,
  startPoint: null,
  currentPath: [],
  history: [],
  historyIndex: -1,
  elementCount: 0,
  isCtrlPressed: false,
  isShiftPressed: false,
  currentPreview: null,
  isCropSelecting: false,
  cropSelectStart: null,
  brushStyle: "solid"
};
var $ = (id) => document.getElementById(id);
var canvas = $("drawingCanvas");
var drawingLayer = $("drawingLayer");
var previewLayer = $("previewLayer");
var elementCountEl = $("elementCount");
var coordInfoEl = $("coordDisplay");
function getSVGCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const viewBox = canvas.viewBox.baseVal;
  const scaleX = viewBox.width / rect.width;
  const scaleY = viewBox.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}
function getDashArray(brush) {
  switch (brush) {
    case "dashed":
      return "8,5";
    case "dotted":
      return "2,4";
    case "dashdot":
      return "8,5,2,5";
    default:
      return "";
  }
}
function getCurrentStyle() {
  return {
    stroke: state.tool === "eraser" ? "#ffffff" : state.strokeColor,
    strokeWidth: state.tool === "eraser" ? Math.max(state.strokeWidth, 10) : state.strokeWidth,
    fill: state.fillColor,
    fillEnabled: state.fillEnabled && state.tool !== "pen" && state.tool !== "eraser" && state.tool !== "line",
    strokeDasharray: getDashArray(state.brushStyle)
  };
}
function saveSnapshot() {
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push({
    svgContent: drawingLayer.innerHTML
  });
  if (state.history.length > 100) {
    state.history.shift();
  }
  state.historyIndex = state.history.length - 1;
  updateElementCount();
  updateUndoRedoButtons();
}
function undo() {
  if (state.historyIndex > 0) {
    state.historyIndex--;
    restoreSnapshot();
  }
  updateUndoRedoButtons();
}
function redo() {
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex++;
    restoreSnapshot();
  }
  updateUndoRedoButtons();
}
function restoreSnapshot() {
  const entry = state.history[state.historyIndex];
  if (entry) {
    drawingLayer.innerHTML = entry.svgContent;
  }
  updateElementCount();
}
function updateElementCount() {
  const children = drawingLayer.children;
  state.elementCount = 0;
  for (let i = 0;i < children.length; i++) {
    const child = children[i];
    if (child.tagName !== "rect" || !child.classList.contains("canvas-bg")) {
      state.elementCount++;
    }
  }
  elementCountEl.textContent = `元素: ${state.elementCount}`;
}
function updateUndoRedoButtons() {
  const undoBtn = $("undoBtn");
  const redoBtn = $("redoBtn");
  undoBtn.classList.toggle("disabled", state.historyIndex <= 0);
  redoBtn.classList.toggle("disabled", state.historyIndex >= state.history.length - 1);
  undoBtn.style.opacity = state.historyIndex <= 0 ? "0.4" : "1";
  redoBtn.style.opacity = state.historyIndex >= state.history.length - 1 ? "0.4" : "1";
}
function enterCropSelectMode() {
  state.isCropSelecting = true;
  canvas.classList.add("crop-selecting");
  state.isDrawing = false;
  state.currentPreview = null;
  state.startPoint = null;
  previewLayer.innerHTML = "";
  $("cropSelectBtn").classList.add("active");
}
function exitCropSelectMode() {
  state.isCropSelecting = false;
  state.isDrawing = false;
  state.cropSelectStart = null;
  state.currentPreview = null;
  previewLayer.innerHTML = "";
  canvas.classList.remove("crop-selecting");
  $("cropSelectBtn").classList.remove("active");
}
function onCropSelectPointerDown(e) {
  if (e.button !== 0)
    return;
  state.isDrawing = true;
  const pt = getSVGCoords(e);
  state.cropSelectStart = pt;
  previewLayer.innerHTML = "";
  const rect = createSVGElement("rect", {
    x: String(pt.x),
    y: String(pt.y),
    width: "0",
    height: "0",
    stroke: "#4a6cf7",
    "stroke-width": "1.5",
    "stroke-dasharray": "6,3",
    fill: "rgba(74, 108, 247, 0.08)"
  });
  previewLayer.appendChild(rect);
  state.currentPreview = rect;
}
function onCropSelectPointerMove(e) {
  if (!state.isDrawing || !state.cropSelectStart)
    return;
  const pt = getSVGCoords(e);
  const start = state.cropSelectStart;
  const x = Math.min(start.x, pt.x);
  const y = Math.min(start.y, pt.y);
  const w = Math.abs(pt.x - start.x);
  const h = Math.abs(pt.y - start.y);
  if (state.currentPreview) {
    state.currentPreview.setAttribute("x", String(x));
    state.currentPreview.setAttribute("y", String(y));
    state.currentPreview.setAttribute("width", String(w));
    state.currentPreview.setAttribute("height", String(h));
  }
}
function onCropSelectPointerUp(e) {
  if (!state.isDrawing || !state.cropSelectStart)
    return;
  state.isDrawing = false;
  const pt = getSVGCoords(e);
  const start = state.cropSelectStart;
  const x = Math.min(start.x, pt.x);
  const y = Math.min(start.y, pt.y);
  const w = Math.abs(pt.x - start.x);
  const h = Math.abs(pt.y - start.y);
  if (w > 5 && h > 5) {
    $("cropX").value = String(Math.round(x));
    $("cropY").value = String(Math.round(y));
    $("cropW").value = String(Math.round(w));
    $("cropH").value = String(Math.round(h));
    updateExportInfo();
    toggleCropOverlay(true);
    $("showCropPreview").checked = true;
  }
  previewLayer.innerHTML = "";
  state.cropSelectStart = null;
  state.currentPreview = null;
  exitCropSelectMode();
}
function createSVGElement(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}
function buildSmoothPath(points) {
  if (points.length === 0)
    return "";
  if (points.length === 1) {
    const p = points[0];
    return `M${p.x},${p.y} L${p.x + 0.01},${p.y}`;
  }
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1;i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q${points[i].x},${points[i].y} ${midX},${midY}`;
  }
  const last = points[points.length - 1];
  d += ` Q${last.x},${last.y} ${last.x},${last.y}`;
  return d;
}
function getFillValue(el, style) {
  if (el.tagName === "line" || el.tagName === "path")
    return "none";
  return style.fillEnabled ? style.fill : "none";
}
function onPointerDown(e) {
  if (e.button !== 0)
    return;
  if (state.isCropSelecting) {
    onCropSelectPointerDown(e);
    return;
  }
  state.isDrawing = true;
  const pt = getSVGCoords(e);
  state.startPoint = pt;
  state.currentPath = [pt];
  const style = getCurrentStyle();
  if (state.tool === "pen" || state.tool === "eraser") {
    const path = createSVGElement("path", {
      d: `M${pt.x},${pt.y}`,
      fill: "none",
      stroke: style.stroke,
      "stroke-width": String(style.strokeWidth),
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    if (style.strokeDasharray) {
      path.setAttribute("stroke-dasharray", style.strokeDasharray);
    }
    drawingLayer.appendChild(path);
    state.currentPreview = path;
  } else {
    const tag = state.tool === "line" ? "line" : state.tool === "rect" ? "rect" : "ellipse";
    previewLayer.innerHTML = "";
    let previewEl;
    const dashAttr = style.strokeDasharray ? { "stroke-dasharray": style.strokeDasharray } : {};
    if (tag === "line") {
      previewEl = createSVGElement("line", {
        x1: String(pt.x),
        y1: String(pt.y),
        x2: String(pt.x),
        y2: String(pt.y),
        stroke: style.stroke,
        "stroke-width": String(style.strokeWidth),
        "stroke-linecap": "round",
        ...dashAttr
      });
    } else if (tag === "rect") {
      previewEl = createSVGElement("rect", {
        x: String(pt.x),
        y: String(pt.y),
        width: "0",
        height: "0",
        stroke: style.stroke,
        "stroke-width": String(style.strokeWidth),
        fill: getFillValue(previewEl, style),
        rx: "0",
        ...dashAttr
      });
    } else {
      previewEl = createSVGElement("ellipse", {
        cx: String(pt.x),
        cy: String(pt.y),
        rx: "0",
        ry: "0",
        stroke: style.stroke,
        "stroke-width": String(style.strokeWidth),
        fill: getFillValue(previewEl, style),
        ...dashAttr
      });
    }
    previewLayer.appendChild(previewEl);
    state.currentPreview = previewEl;
  }
}
function onPointerMove(e) {
  const pt = getSVGCoords(e);
  coordInfoEl.textContent = `坐标: ${Math.round(pt.x)}, ${Math.round(pt.y)}`;
  if (!state.isDrawing)
    return;
  if (state.isCropSelecting) {
    onCropSelectPointerMove(e);
    return;
  }
  const style = getCurrentStyle();
  if (state.tool === "pen" || state.tool === "eraser") {
    state.currentPath.push(pt);
    if (state.currentPreview) {
      const d = buildSmoothPath(state.currentPath);
      state.currentPreview.setAttribute("d", d);
    }
  } else if (state.currentPreview && state.startPoint) {
    const start = state.startPoint;
    let { x: x1, y: y1 } = start;
    let { x: x2, y: y2 } = pt;
    if (state.isShiftPressed) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const angle = Math.atan2(dy, dx);
      const len = Math.sqrt(dx * dx + dy * dy);
      const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      x2 = x1 + len * Math.cos(snapped);
      y2 = y1 + len * Math.sin(snapped);
    }
    const tag = state.tool;
    if (tag === "line") {
      state.currentPreview.setAttribute("x1", String(x1));
      state.currentPreview.setAttribute("y1", String(y1));
      state.currentPreview.setAttribute("x2", String(x2));
      state.currentPreview.setAttribute("y2", String(y2));
    } else if (tag === "rect") {
      const rx = Math.min(x1, x2);
      const ry = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      state.currentPreview.setAttribute("x", String(rx));
      state.currentPreview.setAttribute("y", String(ry));
      state.currentPreview.setAttribute("width", String(w));
      state.currentPreview.setAttribute("height", String(h));
    } else if (tag === "circle") {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      state.currentPreview.setAttribute("cx", String(cx));
      state.currentPreview.setAttribute("cy", String(cy));
      state.currentPreview.setAttribute("rx", String(rx));
      state.currentPreview.setAttribute("ry", String(ry));
    }
  }
}
function onPointerUp(e) {
  if (!state.isDrawing)
    return;
  if (state.isCropSelecting) {
    onCropSelectPointerUp(e);
    return;
  }
  state.isDrawing = false;
  const style = getCurrentStyle();
  if (state.tool === "pen" || state.tool === "eraser") {
    if (state.currentPreview && state.currentPath.length > 1) {
      const d = buildSmoothPath(state.currentPath);
      state.currentPreview.setAttribute("d", d);
    } else if (state.currentPreview && state.currentPath.length <= 1) {
      state.currentPreview.remove();
    }
    state.currentPreview = null;
    state.currentPath = [];
  } else {
    if (state.currentPreview && state.startPoint) {
      const pt = getSVGCoords(e);
      const start = state.startPoint;
      let { x: x2, y: y2 } = pt;
      if (state.isShiftPressed) {
        const dx = x2 - start.x;
        const dy = y2 - start.y;
        const angle = Math.atan2(dy, dx);
        const len = Math.sqrt(dx * dx + dy * dy);
        const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        x2 = start.x + len * Math.cos(snapped);
        y2 = start.y + len * Math.sin(snapped);
      }
      const hasSize = state.tool === "line" && (Math.abs(x2 - start.x) > 1 || Math.abs(y2 - start.y) > 1) || state.tool === "rect" && (Math.abs(x2 - start.x) > 1 || Math.abs(y2 - start.y) > 1) || state.tool === "circle" && (Math.abs(x2 - start.x) > 1 || Math.abs(y2 - start.y) > 1);
      if (hasSize) {
        const fillVal = getFillValue(state.currentPreview, style);
        state.currentPreview.setAttribute("fill", fillVal);
        drawingLayer.appendChild(state.currentPreview);
      } else {
        previewLayer.innerHTML = "";
      }
    }
    previewLayer.innerHTML = "";
    state.currentPreview = null;
  }
  state.startPoint = null;
  saveSnapshot();
}
function buildExportClone() {
  const clone = canvas.cloneNode(true);
  const clonePreview = clone.querySelector("#previewLayer");
  if (clonePreview)
    clonePreview.innerHTML = "";
  const includeBg = $("exportIncludeBg").checked;
  if (!includeBg) {
    const bgRect = clone.querySelector(".canvas-bg");
    if (bgRect)
      bgRect.remove();
  }
  const cropX = parseInt($("cropX").value, 10) || 0;
  const cropY = parseInt($("cropY").value, 10) || 0;
  const cropW = parseInt($("cropW").value, 10) || 1;
  const cropH = parseInt($("cropH").value, 10) || 1;
  clone.setAttribute("viewBox", `${cropX} ${cropY} ${cropW} ${cropH}`);
  clone.setAttribute("width", String(cropW));
  clone.setAttribute("height", String(cropH));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  return clone;
}
function exportSVG() {
  const clone = buildExportClone();
  const serializer = new XMLSerializer;
  let svgString = serializer.serializeToString(clone);
  svgString = `<?xml version="1.0" encoding="UTF-8"?>
` + svgString;
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, "svg");
  closeExportDialog();
}
function exportPNG() {
  const clone = buildExportClone();
  const serializer = new XMLSerializer;
  const svgString = serializer.serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const cropW = parseInt($("cropW").value, 10) || 1000;
  const cropH = parseInt($("cropH").value, 10) || 700;
  const img = new Image;
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = cropW;
    c.height = cropH;
    const ctx = c.getContext("2d");
    const includeBg = $("exportIncludeBg").checked;
    if (includeBg) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.drawImage(img, 0, 0);
    c.toBlob((blob) => {
      if (!blob)
        return;
      downloadBlob(blob, "png");
      URL.revokeObjectURL(url);
    }, "image/png");
  };
  img.onerror = () => {
    alert("PNG 导出失败，可能是浏览器安全策略导致。请使用 SVG 导出。");
    URL.revokeObjectURL(url);
  };
  img.src = url;
  closeExportDialog();
}
function downloadBlob(blob, ext) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, "-");
  link.download = `drawing-${timestamp}.${ext}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
var cropOverlayRect = null;
function openExportDialog() {
  const vb = canvas.viewBox.baseVal;
  $("cropX").value = "0";
  $("cropY").value = "0";
  $("cropW").value = String(vb.width);
  $("cropH").value = String(vb.height);
  updateExportInfo();
  $("exportModal").classList.add("active");
  removeCropOverlay();
  $("showCropPreview").checked = false;
}
function closeExportDialog() {
  $("exportModal").classList.remove("active");
  removeCropOverlay();
  exitCropSelectMode();
}
function updateExportInfo() {
  const w = parseInt($("cropW").value, 10) || 0;
  const h = parseInt($("cropH").value, 10) || 0;
  $("exportInfo").textContent = `导出尺寸: ${w} × ${h}`;
}
function resetCrop() {
  $("cropX").value = "0";
  $("cropY").value = "0";
  const vb = canvas.viewBox.baseVal;
  $("cropW").value = String(vb.width);
  $("cropH").value = String(vb.height);
  updateExportInfo();
}
function toggleCropOverlay(show) {
  removeCropOverlay();
  if (!show)
    return;
  const x = parseInt($("cropX").value, 10) || 0;
  const y = parseInt($("cropY").value, 10) || 0;
  const w = parseInt($("cropW").value, 10) || 0;
  const h = parseInt($("cropH").value, 10) || 0;
  if (w <= 0 || h <= 0)
    return;
  cropOverlayRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  cropOverlayRect.setAttribute("class", "crop-overlay");
  cropOverlayRect.setAttribute("x", String(x));
  cropOverlayRect.setAttribute("y", String(y));
  cropOverlayRect.setAttribute("width", String(w));
  cropOverlayRect.setAttribute("height", String(h));
  canvas.insertBefore(cropOverlayRect, previewLayer);
}
function removeCropOverlay() {
  if (cropOverlayRect && cropOverlayRect.parentNode) {
    cropOverlayRect.parentNode.removeChild(cropOverlayRect);
  }
  cropOverlayRect = null;
}
var lastCropField = null;
function clearCanvas() {
  if (state.elementCount === 0)
    return;
  if (!confirm("确定要清空画布吗？"))
    return;
  drawingLayer.innerHTML = "";
  previewLayer.innerHTML = "";
  state.history = [];
  state.historyIndex = -1;
  saveSnapshot();
  updateElementCount();
}
function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tool") === tool);
  });
  canvas.classList.toggle("drawing-eraser", tool === "eraser");
}
function init() {
  document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tool = btn.getAttribute("data-tool");
      if (tool)
        setTool(tool);
    });
  });
  const strokeColorInput = $("strokeColor");
  strokeColorInput.addEventListener("input", () => {
    state.strokeColor = strokeColorInput.value;
  });
  const fillColorInput = $("fillColor");
  fillColorInput.addEventListener("input", () => {
    state.fillColor = fillColorInput.value;
  });
  document.querySelectorAll(".brush-btn[data-brush]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const brush = btn.getAttribute("data-brush");
      if (brush) {
        state.brushStyle = brush;
        document.querySelectorAll(".brush-btn").forEach((b) => {
          b.classList.toggle("active", b.getAttribute("data-brush") === brush);
        });
      }
    });
  });
  const strokeWidthInput = $("strokeWidth");
  const strokeWidthValue = $("strokeWidthValue");
  strokeWidthInput.addEventListener("input", () => {
    state.strokeWidth = parseInt(strokeWidthInput.value, 10);
    strokeWidthValue.textContent = String(state.strokeWidth);
  });
  const fillToggle = $("fillToggle");
  fillToggle.addEventListener("change", () => {
    state.fillEnabled = fillToggle.checked;
  });
  canvas.addEventListener("mousedown", onPointerDown);
  canvas.addEventListener("mousemove", onPointerMove);
  canvas.addEventListener("mouseup", onPointerUp);
  canvas.addEventListener("mouseleave", (e) => {
    if (state.isDrawing && (state.tool === "line" || state.tool === "rect" || state.tool === "circle")) {
      previewLayer.innerHTML = "";
      state.isDrawing = false;
      state.currentPreview = null;
      state.startPoint = null;
    } else if (state.isDrawing) {
      onPointerUp(e);
    }
  });
  document.addEventListener("keydown", (e) => {
    state.isCtrlPressed = e.ctrlKey || e.metaKey;
    state.isShiftPressed = e.shiftKey;
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
      e.preventDefault();
      redo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "Z") {
      e.preventDefault();
      redo();
    } else if (e.key === "Escape") {
      if (state.isCropSelecting) {
        exitCropSelectMode();
      }
      if ($("exportModal").classList.contains("active")) {
        closeExportDialog();
      } else if (state.isDrawing) {
        previewLayer.innerHTML = "";
        state.isDrawing = false;
        state.currentPreview = null;
        state.startPoint = null;
      }
    }
  });
  document.addEventListener("keyup", (e) => {
    state.isCtrlPressed = e.ctrlKey || e.metaKey;
    state.isShiftPressed = e.shiftKey;
  });
  window.addEventListener("blur", () => {
    state.isShiftPressed = false;
    state.isCtrlPressed = false;
  });
  $("undoBtn").addEventListener("click", undo);
  $("redoBtn").addEventListener("click", redo);
  $("clearBtn").addEventListener("click", clearCanvas);
  $("exportDialogBtn").addEventListener("click", openExportDialog);
  $("modalCloseBtn").addEventListener("click", closeExportDialog);
  $("exportSvgBtn").addEventListener("click", exportSVG);
  $("exportPngBtn").addEventListener("click", exportPNG);
  $("resetCropBtn").addEventListener("click", resetCrop);
  const modalOverlay = $("exportModal");
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay)
      closeExportDialog();
  });
  const cropInputs = ["cropX", "cropY", "cropW", "cropH"];
  cropInputs.forEach((id) => {
    const el = $(id);
    el.addEventListener("input", () => {
      updateExportInfo();
      if ($("showCropPreview").checked) {
        toggleCropOverlay(true);
      }
    });
  });
  const cropW = $("cropW");
  const cropH = $("cropH");
  cropW.addEventListener("focus", () => {
    lastCropField = "w";
  });
  cropH.addEventListener("focus", () => {
    lastCropField = "h";
  });
  const lockAspect = $("cropLockAspect");
  cropW.addEventListener("input", () => {
    if (lockAspect.checked && lastCropField === "w") {
      const w = parseInt(cropW.value, 10) || 1;
      const vb = canvas.viewBox.baseVal;
      const ratio = vb.height / vb.width;
      cropH.value = String(Math.round(w * ratio));
      updateExportInfo();
    }
  });
  cropH.addEventListener("input", () => {
    if (lockAspect.checked && lastCropField === "h") {
      const h = parseInt(cropH.value, 10) || 1;
      const vb = canvas.viewBox.baseVal;
      const ratio = vb.width / vb.height;
      cropW.value = String(Math.round(h * ratio));
      updateExportInfo();
    }
  });
  $("showCropPreview").addEventListener("change", (e) => {
    const checked = e.target.checked;
    toggleCropOverlay(checked);
  });
  const cropSelectBtn = $("cropSelectBtn");
  cropSelectBtn.addEventListener("click", () => {
    if (state.isCropSelecting) {
      exitCropSelectMode();
    } else {
      enterCropSelectMode();
    }
  });
  saveSnapshot();
  setTool("pen");
}
document.addEventListener("DOMContentLoaded", init);
