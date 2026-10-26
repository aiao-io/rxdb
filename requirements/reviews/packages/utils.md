---
package: utils
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# utils 增量代码评审

## 结论

🟡 待处理：6 条 P2。上轮问题继续保留；本提交区间未提供关闭证据。本包实现源码未变，结论限于元数据/配置/文档增量及旧发现的变更核对；不代表依赖升级已完成行为回归。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 0 文件、测试/测试工具 0 文件、配置/文档/版本 1 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：核对版本/依赖声明、构建配置与说明文档；实现源码无增量，旧问题保留原证据。

## 发现

### P2：`rmbUppercase` 金额大写因浮点噪声出错

- 证据：`src/string/rmb.ts:29-40`。`Math.round(frac * 1000) / 1000` 重新引入浮点误差；进位（`Math.round(frac*1000) === 1000`）在 `num = Math.floor(num)` 之前计算并被丢弃。
- 触发（已执行复现）：`rmbUppercase(0.59)` → `伍角捌分`（应为伍角玖分）；`rmbUppercase(0.09)` → `玖分玖厘`（凭空多出厘）；`rmbUppercase(0.47)` → `肆角陆分玖厘`；`rmbUppercase(0.9999)` → `零元整`（应为壹元整）。
- 建议：分数保持整数 `Math.round(frac * 1000)`，把 1000 的进位传入整数部分。

### P2：`urlJoin` 任一非末位段的查询串会吞掉后续路径段

- 证据：`src/string/urlJoin.ts:127-135`。`?` 处理在整串拼好之后按第一个 `?` 切分、余部用 `&` 拼接。
- 触发（已执行复现）：`urlJoin('http://x.com/a?x=1', 'b')` → `http://x.com/a?x=1/b`（段 `b` 被并入查询值）；`urlJoin('?a=1', 'b')` → `a=1/b?`。
- 建议：先归一/追加路径段，再合并查询串。

### P2：`isEqual` 对稀疏数组判等失真且不对称

- 证据：`src/object/isEqual.ts:65-67` 用 `Array.prototype.every` 遍历，跳过空洞位。
- 触发（已执行复现）：`isEqual([,], ['x'])` → `true`，反向 `isEqual(['x'], [,])` → `false`；`isEqual([,], [undefined])` → `true`。本包 `cloneDeep`/`createStableKey` 把空洞当数据，相等契约违背会在缓存/变更检测产生假阳性。
- 建议：按 `for (let i = 0; i < length; i++)` 逐位读两侧。

### P2：`zipObject`/`pick` 对自有 `__proto__` 键触发原型 setter——原型污染

- 证据：`src/object/zipObject.ts:44`、`src/object/pick.ts:28` 以 `result[key] = value` 直接赋值；`set.ts` 已显式屏蔽 `__proto__/prototype/constructor`（`set.ts:1,8-13`），这两个文件口径不一致。键常由调用方数据（查询参数、列名）控制。
- 触发（已执行复现）：`zipObject(['__proto__'], [{polluted: true}])` → `Object.keys()` 为空、`Object.getPrototypeOf(result).polluted === true`；`pick(JSON.parse('{"__proto__":{"p":1},"a":2}'), ...)` 同形。
- 建议：在 `Object.create(null)` 上累积或经 `Object.defineProperty` 写入。

### P2：`set`/`flattenPathObjectToPlainObject` 的路径→容器推断静默丢数据、违背文档往返契约

- 证据：`src/object/set.ts:43`、`src/object/flattenPathObjectToPlainObject.ts:13-16`。
- 触发（已执行复现）：(a) 根数组不往返——`plainObjectToFlattenPathObject([1,2])` → `{'[0]':1,'[1]':2}`，flatten 回来是 `{0:1,1:2}`（普通对象，非数组），违背 `plainObjectToFlattenPathObject.ts:49` 的 TSDoc；(b) 混合路径 `{'a[0]':1, 'a.b':2}` → `{a:[1]}`，`2` 写成数组的隐藏非索引属性，`JSON.stringify` 与再 flatten 都看不见；(c) 零填充索引 `set({}, 'a[01]', 5)` → 长度 0 数组带隐藏 `'01'` 属性。
- 建议：校验路径冲突与规范索引（`'01'` 或数组/对象混用直接抛），或从完整路径形状创建根容器。

### P2：`getWords` 分词静默丢弃组合标记与 emoji，大小写/命名转换吞字符

- 证据：`src/string/getWords.ts:11` 的 `CASE_SPLIT_PATTERN` 只含 `\p{Lu}/\p{Ll}/\p{N}/\p{Lo}/\p{Lm}`。
- 触发（已执行复现）：NFD 归一化的 `camelCase('café')` → `cafe`（重音被静默删除，越南文等 NFD 输入中招）；`camelCase('😀x')` → `x`；`getWords('é')` → `['e']`。
- 建议：`\p{M}` 并入 Lo/Lm 分支、`\p{So}` 透传。

## 验证与限制

本轮对本包执行静态增量检查，未单独运行其 lint/typecheck/test/build；不沿用旧报告的测试通过结论。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
