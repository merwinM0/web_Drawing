# 🎨 SVG 绘图工具

一个基于 **纯 SVG**（不使用 HTML Canvas）的矢量绘图 Web 应用。用 TypeScript 编写，支持绘画、多种画笔样式、形状工具、橡皮擦、不透明度控制、撤销/重做、导出等功能。

---

## 🚀 快速开始

```bash
# 安装依赖（仅 bun 开发工具）
bun install

# 构建 TypeScript → JavaScript
bun run build

# 启动开发服务器（构建 + 启动）
bun run dev

# 或者用 Python 的简易 HTTP 服务器
cd src && python3 -m http.server 3000
```

然后在浏览器打开 `http://localhost:3000`。

---

## 📦 使用的库与组件

| 名称 | 用途 | 说明 |
|---|---|---|
| **无外部 UI 库** | — | 全部使用原生 HTML + CSS + TypeScript，零外部依赖 |
| **TypeScript** | 类型安全 | 使用 `bun build` 编译为浏览器可执行的 JavaScript |
| **Bun** | 构建工具 | 使用 `bun build src/app.ts --outdir=src --target=browser` 编译 |

所有绘图、交互、导出功能均使用 **标准 Web API**（DOM、SVG、XMLSerializer、Blob、URL.createObjectURL）实现，无任何第三方绘图库。

---

## 🧠 实现原理

### 1. 整体架构

```
HTML (index.html) → CSS (style.css) → TS/JS (app.ts → app.js)
                        ↓
                  <svg id="drawingCanvas">
                    ├── <rect class="canvas-bg">      // 白色背景
                    ├── <g id="previewLayer">          // 形状拖拽预览
                    └── <g id="drawingLayer">          // 已完成的绘图元素
```

所有绘图操作直接在 SVG DOM 上进行，每个工具绘制的元素都是独立的 SVG 节点。

### 2. 绘图工具实现

#### ✏️ 画笔 (Pen / Freehand)
- **mousedown**: 创建 `<path>` 元素并添加到 `drawingLayer`，记录起始点
- **mousemove**: 将每个采样点加入路径数组，使用 **二次贝塞尔插值（Quadratic Bezier）** 在相邻点的中点间生成平滑曲线
- **mouseup**: 完成路径，保存历史快照
- 路径表达式示例: `M x0,y0 Q x1,y1 (x1+x2)/2,(y1+y2)/2 Q x2,y2 ...`
- 支持所有画笔样式（实线、虚线、点线、点划线、马克笔、双线笔）

#### 📏 直线 / 矩形 / 椭圆
- **mousedown**: 记录起始点，在 `previewLayer` 创建临时元素
- **mousemove**: 实时更新临时元素的坐标/尺寸，实现拖拽预览
- **Shift 约束**:
  - 直线: **四舍五入到 45° 的倍数**，实现水平/垂直/45° 直线
  - 矩形: 强制正方形（宽高相等）
  - 椭圆: 强制正圆（`rx === ry`，取最大值）
- **mouseup**: 将预览元素移动到 `drawingLayer`，清空预览层

#### 🧽 橡皮擦
- 原理：绘制**白色**（`#ffffff`）的粗路径，视觉上覆盖已有内容
- 自动将最小笔触宽度设为 10px，确保擦除效果明显

### 3. 画笔样式系统

| 样式 | 描述 | SVG 实现 |
|---|---|---|
| 实线 (solid) | 默认实线 | `stroke-dasharray: 无` |
| 虚线 (dashed) | 标准虚线 | `stroke-dasharray: 8,5` |
| 点线 (dotted) | 均匀点状 | `stroke-dasharray: 2,4` |
| 点划线 (dashdot) | 线-点交替 | `stroke-dasharray: 8,5,2,5` |
| 🆕 马克笔 (marker) | 半透明粗线效果 | 自动限制 `stroke-opacity ≤ 0.5` |
| 🆕 双线笔 (double) | 外粗内细双线 | 主路径 + 伴生内层路径，`stroke-opacity: 0.5` |

#### 不透明度控制
- 工具栏提供 **透明滑块**（0.1 ~ 1.0）
- 实时应用到所有工具的 `stroke-opacity`
- 马克笔模式自动叠加半透明限制

### 4. 坐标系统

- 使用 **`createSVGPoint()` + `getScreenCTM()`** 原生 SVG API 进行坐标转换
- 鼠标的 `clientX/clientY` → SVG 视图坐标系
- 正确处理 CSS 缩放、`preserveAspectRatio` 留白、容器边框等场景
- 实时在状态栏显示鼠标位置（SVG 坐标系）
- 元素计数遍历 `drawingLayer` 子节点，排除背景矩形

### 5. 撤销 / 重做 (Undo / Redo)

- 每个操作完成后，**序列化 `drawingLayer.innerHTML`** 作为历史快照存入数组
- 撤销：`historyIndex--`，用对应快照的 HTML 覆盖 `drawingLayer`
- 重做：`historyIndex++`，同样恢复快照
- 最多保留 **100 步** 历史
- 快捷键: `Ctrl+Z` 撤销，`Ctrl+Shift+Z` 重做

### 6. 导出功能

#### SVG 导出
1. 克隆当前 `<svg>` 节点（避免干扰实时画布）
2. 移除 `#previewLayer` 内容
3. 根据用户选择**决定是否包含背景** `<rect>`
4. 使用 `XMLSerializer` 序列化为 XML 字符串
5. 添加 `<?xml?>` 声明头
6. 通过 `Blob` + `URL.createObjectURL` 触发下载

#### PNG 导出
1. 按相同方式构建 SVG 克隆
2. 序列化为字符串，生成 `Blob URL`
3. 创建 `Image` 对象加载该 SVG
4. 渲染到 `<canvas>` 上
5. 用 `canvas.toBlob()` 输出 PNG 文件

---

## 🎮 操作流程

### 基本绘画

```
1. 选择工具 ──→ 2. 调颜色/粗细/透明度 ──→ 3. 选画笔样式 ──→ 4. 在画布上拖拽 ──→ 5. 完成
                                                                              ↓
                                                                    自动保存到历史 (可撤销)
```

### 各工具操作

| 工具 | 操作方式 | 技巧 |
|---|---|---|
| 画笔 | 点击并拖拽 | 缓慢移动可获得更平滑的线条 |
| 直线 | 从起点拖拽到终点 | 按住 Shift 可锁定水平/垂直/45° |
| 矩形 | 从一角拖拽到对角 | 按住 Shift 画出正方形 |
| 椭圆 | 从一角拖拽到对角 | 按住 Shift 画出正圆 |
| 橡皮擦 | 在要擦除的区域拖拽 | 白色笔触覆盖，可调粗细 |

### 导出流程

```
点击「导出」按钮
       ↓
  弹出导出设置弹窗
  ├── ☑ 包含白色背景
  └── [导出 PNG] 或 [导出 SVG]
       ↓
  下载 drawing-时间戳.svg / .png
```

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl+Z` | 撤销 |
| `Ctrl+Shift+Z` | 重做 |
| `Shift + 拖拽` | 约束直线角度/画正方形/正圆 |
| `Escape` | 取消当前绘制 / 关闭弹窗 |

---

## 📁 项目结构

```
svg_draw/
├── src/
│   ├── index.html     # 主页面 + 导出弹窗
│   ├── style.css      # 全部样式（含弹窗、裁剪覆盖层）
│   ├── app.ts         # TypeScript 源码
│   └── app.js         # 编译后的 JavaScript
├── package.json       # bun 构建脚本
├── tsconfig.json      # TypeScript 配置
└── README.md
```

---

## 🧪 浏览器兼容性

使用标准 Web API，兼容所有现代浏览器（Chrome、Firefox、Safari、Edge）。

| API | 兼容性 |
|---|---|
| SVG DOM | ✅ 所有浏览器 |
| SVG `createSVGPoint` + `getScreenCTM` | ✅ 所有浏览器 |
| XMLSerializer | ✅ 所有浏览器 |
| Blob / URL.createObjectURL | ✅ 所有浏览器 |
| Canvas (PNG 导出) | ✅ 所有浏览器 |

> PNG 导出依赖 Canvas，在某些严格 CSP 限制下可能不可用，建议优先使用 SVG 导出以获得最佳矢量质量。

---

## 📜 License

MIT
