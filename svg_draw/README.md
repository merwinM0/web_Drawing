# 🎨 SVG 绘图工具

一个基于 **纯 SVG**（不使用 HTML Canvas）的矢量绘图 Web 应用。用 TypeScript 编写，支持绘画、形状、橡皮擦、撤销/重做、裁剪导出等功能。

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

#### 📏 直线 / 矩形 / 椭圆
- **mousedown**: 记录起始点，在 `previewLayer` 创建临时元素
- **mousemove**: 实时更新临时元素的坐标/尺寸，实现拖拽预览
- **Shift 约束**: 按 Shift 时计算拖拽方向角度，**四舍五入到 45° 的倍数**，实现水平/垂直/45° 直线、正方形、正圆
- **mouseup**: 将预览元素移动到 `drawingLayer`，清空预览层

#### 🧽 橡皮擦
- 原理：绘制**白色**（`#ffffff`）的粗路径，视觉上覆盖已有内容
- 自动将最小笔触宽度设为 10px，确保擦除效果明显

### 3. 撤销 / 重做 (Undo / Redo)

- 每个操作完成后，**序列化 `drawingLayer.innerHTML`** 作为历史快照存入数组
- 撤销：`historyIndex--`，用对应快照的 HTML 覆盖 `drawingLayer`
- 重做：`historyIndex++`，同样恢复快照
- 最多保留 **100 步** 历史
- 快捷键: `Ctrl+Z` 撤销，`Ctrl+Shift+Z` 重做

### 4. 导出功能

#### SVG 导出
1. 克隆当前 `<svg>` 节点（避免干扰实时画布）
2. 移除 `#previewLayer` 内容
3. 根据用户选择**决定是否包含背景** `<rect>`
4. 根据用户输入的裁剪参数**修改 viewBox** 和 width/height
5. 使用 `XMLSerializer` 序列化为 XML 字符串
6. 添加 `<?xml?>` 声明头
7. 通过 `Blob` + `URL.createObjectURL` 触发下载

#### PNG 导出
1. 按相同方式构建 SVG 克隆
2. 序列化为字符串，生成 `Blob URL`
3. 创建 `Image` 对象加载该 SVG
4. 渲染到 `<canvas>` 上
5. 用 `canvas.toBlob()` 输出 PNG 文件

### 5. 裁剪导出

- 在导出弹窗中，用户可设置 **viewBox 的 x, y, width, height**
- **锁定宽高比**: 修改宽度时按原始比例自动计算高度，反之亦然
- **画布预览**: 勾选后会在画布上显示一个蓝色虚线矩形，标明裁剪范围
- 重置按钮一键恢复为全画布

### 6. 坐标与元素计数

- 鼠标移动时通过 `getBoundingClientRect()` + viewBox 比例换算得到 SVG 坐标系下的坐标
- 实时在状态栏显示鼠标位置
- 元素计数遍历 `drawingLayer` 子节点，排除背景矩形

---

## 🎮 操作流程

### 基本绘画

```
1. 选择工具 ──→ 2. 调颜色/粗细 ──→ 3. 在画布上拖拽 ──→ 4. 完成
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
  ├── 裁剪区域: X, Y, 宽度, 高度
  │   ├── ☐ 锁定宽高比
  │   └── ☐ 在画布上显示裁剪区域
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
| XMLSerializer | ✅ 所有浏览器 |
| Blob / URL.createObjectURL | ✅ 所有浏览器 |
| Canvas (PNG 导出) | ✅ 所有浏览器 |

> PNG 导出依赖 Canvas，在某些严格 CSP 限制下可能不可用，建议优先使用 SVG 导出以获得最佳矢量质量。

---

## 📜 License

MIT
