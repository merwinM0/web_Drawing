# 第三方开源声明

## perfect-freehand 1.2.3

- 上游：https://github.com/steveruizok/perfect-freehand
- npm：https://www.npmjs.com/package/perfect-freehand
- 用途：生成平滑、压感自由手绘轮廓和稳定中心线。
- 接入方式：通过锁定版本的 npm 依赖使用公开 API，未复制或修改上游源码。
- 发布：构建时打包进编辑器 JavaScript；本声明同时复制到 `dist/`。导出的成品 HTML/SVG 只含生成的矢量结果，不加载该库。

以下为该版本随包提供的原始许可声明：

```text
MIT License

Copyright (c) 2021 Stephen Ruiz Ltd

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

TypeScript、Playwright、axe-core 等为开发/测试依赖，不随编辑器构建发布；各自许可随依赖包提供。
