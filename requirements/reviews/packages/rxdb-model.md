# rxdb-model 深度评审

评审日期：2026-10-29（更新轮；首轮 2026-10-28）。源码基线：`f62f77c19d55c73d8335df026778422282c2fed4`。范围：`packages/rxdb-model`。首轮基线 `7bb16a9014095d4003bd059244722013b36867c1` 至本基线本包无源码变更。

## 结论

🟡 凑合。发现 2 条 P2（2026-10-29 复核均仍有效）：列级只读未贯穿快捷键/批量入口；字段 schema 更新后，已有校验订阅不重新计算。本更新轮沿原评审重点抽查未发现新的确定问题。

## 检查范围与证据

- 阅读[入口](../../../packages/rxdb-model/src/index.ts)、[表单数据转换](../../../packages/rxdb-model/src/entity-form/form-data.ts)、[表单校验](../../../packages/rxdb-model/src/entity-form/form-validation.ts)、[`buildPropertyColumn`](../../../packages/rxdb-model/src/entity-table/columns/column-utils.ts)、[枚举编辑器](../../../packages/rxdb-model/src/entity-table/editors/enum-editor.ts)、[剪贴板](../../../packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts)、[键盘桥接](../../../packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts)、[表格更新/排序](../../../packages/rxdb-model/src/entity-table/vtable/table-operations.ts)、[行移动](../../../packages/rxdb-model/src/entity-table/vtable/table-row-move.ts)。
- 阅读手动排序域判定、列表视图排序与分组、QueryConverter、ValidationService、字段提取和 QueryBuilderService 的初始化/字段更新路径。
- 本次重新核对枚举“不在选项里的值”，当前实现保留原值，不重复登记已修历史项。

## 确定发现

### MOD-20261028-01 [P2] 快捷键与批量写入绕过列级只读

证据：[`buildPropertyColumn`](../../../packages/rxdb-model/src/entity-table/columns/column-utils.ts) 对 readonly 字段通过不设置 editor，或布尔列 `disable: true` 表示只读；但 [`applyClipboard` / `applySystemText` / `collectDeleteWrites`](../../../packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts) 只检查行级只读与部分清空回调，没有同一套列级可写判据。列只读信息在这些入口没有被读取。

[`toggleCellValue`](../../../packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts) 只判行级只读，未读布尔列的 `disable`。选中只读布尔字段，按 Enter/Space 仍执行：

```ts
setCellSwitchState(table, sel.col, sel.row, newValue);
ctx.onCellChange(sel.col, sel.row, newValue);
```

最小触发：一条可编辑行包含 `readonly: true` 的普通字符串/布尔属性；列由 buildPropertyColumn 正常生成；在字符串列 Ctrl+V/Delete，或在布尔列按 Enter。预期不产生变更；实际批量列表包含该字段，布尔入口刷新状态并发出变更。

复验：把当前两个源文件通过 Node `stripTypeScriptTypes` 加载为内存模块，仅替换外部表格辅助函数为轻量接缝；给 `editor: undefined` 的只读文本列与 `disable: true` 的 switch 列。原函数输出如下：

```text
readonly paste: [{ value: 'changed', field: 'locked', ... }]
readonly delete: { writes: [{ value: '', field: 'locked', ... }], ... }
switchState true
disabled column emitted true
```

影响：三端 EntityTable/EntityList 共用此入口，批量与单元格处理随后会修改实体内存并通知宿主。核心 [`normalizeUpdateEntity`](../../../packages/rxdb/src/entity/entity.utils.ts) 会过滤 readonly 持久化字段，因此本报告不声称只读值必然写入数据库。已确定的是只读列产生了 PendingWrite、布尔视觉切换与变更回调，并进入前端写入队列；入口已违背字段只读合同。下游 [`EntityList.flushPending`](../../../packages/rxdb-model-react/src/entity-list/entity-list.tsx) 会在 mutations reject 后用 prevMap 回滚实例，正常数据库回执也可能回填旧值；最终内存是否恢复取决于对应保存路径，本次局部复现没有证明永久内存漂移。

修复建议：列定义保留明确的可写标记，由共享谓词统一约束鼠标编辑、布尔切换、粘贴和清空；同时排除系统/选择/操作字段，不能仅把禁用 editor 当作所有输入入口的保护。

建议回归：对同一 readonly 字符串/布尔字段分别执行鼠标、Enter/Space、内部/系统剪贴板和 Delete，断言零 PendingWrite、零事件、零实体内存变化；再以可写列为正向对照。

**2026-10-29 复核：**仍有效。[`applyClipboard` / `applySystemText` / `collectDeleteWrites`](../../../packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts) 仍只调用 `isReadonlyOrAddRow` 行级判断；[`toggleCellValue`](../../../packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts) 仍只判 `isReadonly(record)`，不读布尔列的 `disable`；[`buildPropertyColumn`](../../../packages/rxdb-model/src/entity-table/columns/column-utils.ts) 对 readonly 布尔列仍以 `disable: true` 表示（本包自首轮基线无源码变更）。

### MOD-20261028-02 [P2] setFields 修改校验依赖却不通知 validation$ 订阅

证据：[`QueryBuilderService.setFields`](../../../packages/rxdb-model/src/query-builder/services/query-builder.service.ts) 仅清空和重新填充 `fieldsMap`，不向任何响应式源发出变更；同一类的 `validation$` 仅由 `state$` 驱动，然后读取这个普通 Map。

最小触发：创建含字符串字段 title 的服务，加入合法 `title = 'ok'` 规则并订阅 validation$；调用 `setFields([])` 移除字段。预期已订阅校验立即变为 fieldExists 错误；实际没有新 emission，旧的 valid:true 持续保留，直到用户再次修改查询状态。

复验：当前真实 QueryBuilderService 及其依赖源码在内存中转译执行，未 mock 校验器或 Observable；输出：

```text
after setFields([]), emitted validity: [true] direct validate: false
```

影响：字段类型、枚举候选或实体 schema 在运行中变化时，三端 UI 的验证标记和宿主 validationChange 继续声明旧规则合法。同一时刻直接 `validate()` 与订阅者看到不同结论。

修复建议：字段 schema 纳入明确的响应式状态，或 setFields 触发专用重新校验通知；避免为重算校验而错误触发无变化的查询输出。框架包装层还需允许把空字段列表传入，见各 model 框架报告的第二条，这是另一处独立修复点。

建议回归：保持一个 validation$ 订阅，分别更新字段为空、变更字段类型、收窄 enum，断言立即得到当前结论；同时检查 query$ 不出现不必要的业务查询。

**2026-10-29 复核：**仍有效。[`setFields`](../../../packages/rxdb-model/src/query-builder/services/query-builder.service.ts) 仍仅清空/填充普通 `fieldsMap`，`validation$` 仍只由 `state$` 驱动后读取该 Map（本包自首轮基线无源码变更）。

## 公开 API 与三端对照

本包是三端共享模型与表格内核；共享错误只在这里登记一次。各框架报告链接本条，不重复把同一核心修复计算成三个独立缺陷。表单转换已跳过 readonly，表格批量入口缺少等价约束。

## 下游反证与缺陷归属

列级只读的鼠标 editor/disable 保护没有传到共享键盘/剪贴板谓词，三端包装的 handleCellChange 也只判行级只读；确定入口绕过仍成立。保存失败回滚与后端回执回填已经纳入影响限定，不再用此局部复现推断最终内存或磁盘必然保持错误值。`setFields` 的普通 Map 与只由 state$ 驱动的 validation$ 是另一条独立依赖遗漏。

## 验证与边界

执行上述原函数接缝复现，并核对 [`column-utils.spec.ts`](../../../packages/rxdb-model/src/__tests__/entity-table/columns/column-utils.spec.ts)、[`table-clipboard.spec.ts`](../../../packages/rxdb-model/src/__tests__/entity-table/vtable/table-clipboard.spec.ts)、[`table-keyboard.spec.ts`](../../../packages/rxdb-model/src/__tests__/entity-table/vtable/table-keyboard.spec.ts) 的现有范围：已有列只读渲染、行只读和选择 checkbox 覆盖，没有贯穿列只读与快捷键/批量入口。

首轮（2026-10-28）`rxdb-model:test`：1034 passed (1034)；目标实际执行。命令及整体边界见[总索引](README.md)。

边界：未逐一执行所有编辑器在真实 VTable/canvas 中的交互；异长剪贴板行在隔离函数中可触发 TypeError，但未证明正常 UI 会产出该形状，故没有将它登记为产品缺陷。
