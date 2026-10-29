# utils 深度评审

包：`@aiao/utils`。日期：2026-10-29。基线：`f62f77c19d55c73d8335df026778422282c2fed4`。

结论：**🟡凑合**。确认 1 条 P2、1 条 P3。异步队列和稳定键已有针对性边界防护；普通对象复制和路径扁平化仍有可复现的数据形状问题。2026-10-29 更新轮复核：自基线起本包无源码变更，两条问题均仍有效，本更新轮未发现新的确定问题。

## 评审范围

阅读 [`AsyncQueueExecutor`](../../../packages/utils/src/async/AsyncQueueExecutor.ts)、[`LifecycleScope`](../../../packages/utils/src/lifecycle/lifecycle-scope.ts)、[`createStableKey()`](../../../packages/utils/src/object/createStableKey.ts)、[`isEqual()`](../../../packages/utils/src/object/isEqual.ts)、[`PersistedStateRegistry`](../../../packages/utils/src/@browser/persisted-state.ts)、[`OpfsRouteSync`](../../../packages/utils/src/@browser/opfs-route-sync.ts)，并检查 debounce / throttle / once、数组展开、对象路径安全、zipObject、查询字符串、随机字符串与下述对象转换函数及其现有测试。

## UTILS-001 · P2：toPlainObject 把 **proto** 数据键写成结果的原型

**证据**：[`toPlainObject()`](../../../packages/utils/src/object/toPlainObject.ts) 用 `result[key] = Reflect.get(source, key)` 向 `{}` 赋值。这会触发继承的 `Object.prototype.__proto__` setter，与「只包含自有可枚举属性的普通对象浅拷贝」的合同不符。同包 [`zipObject()`](../../../packages/utils/src/object/zipObject.ts) 已改用定义自有属性的方式，但此函数仍有旧写法。

**复现**：`const result = toPlainObject(JSON.parse('{"__proto__":{"unexpected":true},"safe":1}'))`。实际 `Object.hasOwn(result, '__proto__') === false`、`Object.getPrototypeOf(result) !== Object.prototype`、`result.unexpected === true`。预期保留名为 `__proto__` 的自有属性，结果原型仍为普通对象原型。

**影响**：接收 JSON / 外部字典后调用此公开工具，数据键丢失，结果多出调用方没有声明的继承属性。这里改变的是结果对象的原型，**没有证据表明全局 Object.prototype 被污染**。

**验证**：Node 调用本基线构建产物，三项断言均通过，观测输出为 `{"ownProto":false,"changedPrototype":true,"inheritedUnexpected":true}`。

**改进**：用 `Object.fromEntries` 或显式定义自有属性完成复制；回归覆盖 JSON 自有 `__proto__` 键，并断言原型、属性描述符和原始值均正确。

**2026-10-29 复核：**仍有效。HEAD `f62f77c19d55c73d8335df026778422282c2fed4` 相对基线本包无源码变更：`toPlainObject()` 仍以 `result[key] = Reflect.get(source, key)` 向普通对象赋值；同包 `zipObject()` 的注释已写明 `acc[key] = value` 对 `__proto__` 键会走原型 setter，本函数未跟进同一防护。

## UTILS-002 · P3：扁平化会静默丢弃仅含空洞或尾部空洞的数组

**证据**：[`plainObjectToFlattenPathObject()` / `flattenValue()`](../../../packages/utils/src/object/plainObjectToFlattenPathObject.ts) 仅把 `length === 0` 当空数组，其余数组用 `forEach()` 遍历；`forEach()` 跳过空洞，没有输出任何长度信息。对应 [`flattenPathObjectToPlainObject()`](../../../packages/utils/src/object/flattenPathObjectToPlainObject.ts) 无法重建未被编码的字段或尾部长度。

**复现**：`plainObjectToFlattenPathObject({ items: new Array(2) })` 实际返回 `{}`，反扁平化后 `items` 整个消失。`{ items: [1, ,] }` 则会把数组长度从 2 缩成 1。输入满足函数文档中「根为普通对象、键不含路径分隔符」的还原前提。

**影响**：使用稀疏数组的配置、表单或字典在转换往返后改变形状。仓库当前业务调用是否传入稀疏数组未证实，因此定为 P3，不宣称生产数据普遍受损。

**验证**：Node 调用本基线构建产物，输出 `{"beforeLength":2,"flattened":{},"roundtrip":{}}`。现有测试覆盖空数组和普通密集数组；`isEqual` / `createStableKey` 自身对空洞的保护不能修复此转换路径。

**改进**：为稀疏数组定义可往返表示，或在公开边界明确拒绝而不静默丢弃。回归至少覆盖全空洞、尾部空洞、显式 `undefined` 与密集数组四类。

**2026-10-29 复核：**仍有效。HEAD 相对基线本包无源码变更：`flattenValue()` 已把 `length === 0` 的空容器写作叶子（UTL-012 已修），但非空数组仍走 `forEach()`，`new Array(2)` 与 `[1, ,]` 两类稀疏输入的行为与报告一致，反扁平化仍无法重建。

## 测试与边界

首轮（2026-10-28）`utils:test` 通过：121 个文件、982 个用例；目标实际执行。其输出覆盖率为 statements 96.15%、branches 93.24%、functions 97%、lines 97.69%，仅代表该目标已配置的采集范围。未单独执行浏览器目标；跨标签页、OPFS 和 Web Locks 的真实环境不在上述 Node 诊断的证明范围。
