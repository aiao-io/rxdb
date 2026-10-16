# Review：@aiao/utils 评审

## 结论

🔴 二次评审对全部 158 个源文件做第二轮走读后确认 6 条 P2（金额大写、urlJoin、稀疏数组相等、`__proto__` 原型污染、路径对象往返、大小写转换吞字符），均有执行复现；首轮「未发现 P0-P2」结论被推翻。

## 检查范围

检查 `@browser`、array/async/crypto/cron/date/indexing/lifecycle/object/random/string/types 全部源码与 spec；核对顶层 index exports、package/project 配置和浏览器/Node 条件。二次评审对 string/object/array/binary/crypto/lifecycle/@browser/file/tools/platform/types 等分桶逐文件走读，并对可疑算法用构建产物直接执行复现。

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

### 已知弱项（未定级，均有具体触发，仅记录备查）

`numberStep` 浮点 ceil 越步（`0.1+0.2` 按 0.1 步进得 0.4）；`orderBy/sortBy` 混合类型比较器不可传递、NaN 与一切相等；`getWords` 已定义且测试但未从 `string/index.ts` 导出（`src/index.ts:168` 却声明导出）；`stringToArrayBuffer` 静默截断 >0xFF 码点；`toInt(null) === 0` 与其 JSDoc 矛盾；`isISODateString` 拒绝 0000-0099 年（Date.UTC 1900 重映射）；`canBeDate(Symbol())` 抛错而非 false；跨 realm `cloneDeep` 出空壳；`deepFreeze` 会调用 getter；`createStableKey` 对 Invalid Date 抛 RangeError。

## 风险/未覆盖

未覆盖 Safari/旧浏览器 Web Crypto、localStorage 配额/多标签同步、OPFS 和极大 Uint8Array 性能；需在浏览器矩阵和 Node 26+ 分别验证。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
