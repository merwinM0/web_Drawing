# 区域绑定接口参考

## 当前实现边界

已实现：稳定区域 ID、`binding` 数据字段、导出文档数据，以及离线 HTML 的区域激活事件桥接。

**尚未实现：** 编辑器绑定配置面板、业务动作执行器、链接/表单组件、绑定预览与导入。当前创建的区域均为 `binding: null`，视觉完全由框内笔画决定，不自动生成按钮外观。

## 身份和绑定契约

绑定目标必须是 `region.id`。移动、重命名、绘画、擦除、层级调整不会改变 ID。删除区域意味着同时删除绑定，撤销删除会恢复原 ID 及其数据。本地绘画库保存和重新打开时也保留 ID 与绑定，当前页面的选择和移动不执行业务动作。

不能使用区域名称、数组下标、显示层号或某条 SVG 路径作为绑定键。

```ts
type RegionBinding = {
  event: "activate";
  action: string;
  payload: Record<string, unknown>;
};
```

示例为未来应用约定，不是当前编辑器已经提供的功能：

```json
{
  "id": "稳定的区域 UUID",
  "binding": {
    "event": "activate",
    "action": "open-details",
    "payload": { "itemId": "item-42" }
  }
}
```

当前字段只描述动作，不包含可执行代码。外部应用需要自行维护允许的动作及参数规则。

## JSON 导出

顶层结构为：

```json
{
  "version": 2,
  "width": 1200,
  "height": 760,
  "regions": [
    {
      "id": "区域 UUID",
      "name": "区域 1",
      "rect": { "x": 60, "y": 60, "width": 300, "height": 180 },
      "marks": [],
      "binding": null
    }
  ]
}
```

数组从底到顶排列。版本 2 在笔画中增加可选预设、透明度、平滑度、压力模式，以及采样点压力，不改变区域 ID 和绑定契约。笔画点是相对 `rect.x/y` 的局部坐标，可能包含越界采样，显示时必须保留区域裁剪。完整笔画结构见[架构文档](ARCHITECTURE.md)。

## 导出 HTML 的运行时接口

每个区域生成：

- `g[data-region-id]`：稳定区域标识。
- `data-region-name`：展示名称。
- `data-binding`：经过属性转义的绑定 JSON，当前通常为字符串 `null`。
- 可聚焦的区域分组，支持点击、`Enter` 和空格激活。
- 覆盖整个框的透明命中面；重叠处由最上层框接收事件。

页面内 `script#drawing-document[type="application/json"]` 包含完整导出项目。

激活时在对应 SVG 分组派发可冒泡事件：

```ts
new CustomEvent("webdrawing:region-activate", {
  bubbles: true,
  detail: {
    regionId: region.id,
    binding: region.binding,
  },
});
```

这只是集成通知：`binding` 为 `null` 时也会派发。纯 SVG 文件不包含 JavaScript 事件桥接；编辑器中的点击仍用于选择和绘画，不执行业务动作。

## 外部应用接入示例

将下面代码加入导出 HTML 的业务脚本，或将其作为接入方式参考。宿主应用负责实现业务动作：

```js
const allowedActions = new Map([
  ["open-details", payload => {
    if (typeof payload.itemId !== "string") return;
    // 调用宿主应用的业务接口，不使用 eval 或动态脚本。
    console.log("展示详情", payload.itemId);
  }],
]);

document.addEventListener("webdrawing:region-activate", event => {
  const { regionId, binding } = event.detail;
  if (!binding || binding.event !== "activate") return;
  const action = allowedActions.get(binding.action);
  if (!action) {
    console.warn("区域绑定了未支持的动作", regionId);
    return;
  }
  if (!binding.payload || typeof binding.payload !== "object") return;
  action(binding.payload);
});
```

当前示例不会把绑定写回编辑器，也不代表业务动作已内置。

## 后续实现必须遵守

1. 采用动作白名单；禁止 `eval`、`new Function` 和未经校验的脚本/URL。
2. 按动作校验参数，不信任导入 JSON 或 DOM 属性。
3. 若增加导航，限制可用协议并明确外部链接策略。
4. 编辑模式不触发动作，交互预览与编辑状态分离。
5. 为按钮、链接等真实业务语义设置相应角色和名称，不能仅因存在区域就声明为按钮。
6. 绑定面板的修改应纳入撤销、导入导出与持久化。
7. 新增事件或变更字段时制定 `version` 兼容/迁移规则。
