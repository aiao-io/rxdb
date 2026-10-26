---
package: rxdb-model
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb-model 增量代码评审

## 结论

🔴 待处理：1 条 P1、1 条 P2、3 条 P3。上轮问题继续保留；本提交区间未提供关闭证据。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 6 文件、测试/测试工具 4 文件、配置/文档/版本 2 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`b109ba33 feat(aiao): 重构 worktree 功能 (#122)`；`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：只读能力判定、editable columns、VTable 控件焦点标签、history barrier 文案与导出；旧编辑器/日期/数字解析实现无修复增量。
- 实现锚点：`src/entity-capabilities.ts`、`src/entity-list/history-barrier.ts`、`src/entity-table/columns/build-editable-columns.ts`、`src/entity-table/vtable/focus-control-label.ts`、`src/entity-table/vtable/table-factory.ts`、`src/index.ts`。

## 发现

### P3：缩写标题仍把 `2FAuth` 拆成 `2 F Auth`

- 证据：`src/query-builder/services/schema-parser.service.ts:89-94` 的数字-大写分词规则仍为 `([a-z\d])([A-Z])`；`2FAuth` 得到 `2 F Auth`。
- 已过时部分：旧报告将 `IPv4Address` 也列在此处，但上轮正文已记它随 PR #126 解决；本轮从未处理描述中移除该子情形。此条仅保留数字嵌入缩写的残留，不新增计数。
- 影响：字段标题的标签瑕疵，不影响数据。
- 建议：明确数字嵌入缩写的分词规则，补 `2FAuth` 回归。

### P1：枚举编辑器对「值不在选项列表」的单元格静默改写为第一项，Escape/点击外部不恢复

- 证据：`src/entity-table/editors/enum-editor.ts:76-84` 的 `onStart` 在当前值不在列表时自动选中 `realItems[0].value`；基类 Escape/外部点击路径（`editors/global-overlay-editor.ts:119-125`）只调 `close()` → `endEdit()`，无恢复逻辑；VTable 经 `getValue()` 把第一项经 cellChanged 写回。类文档（第 30 行）承诺「Escape：取消，恢复原始值」。同目录已废弃的 `IconListEditor`（`54-65`）对同一场景保留原值是正确范本。
- 触发：枚举单元格持有过期值（枚举声明删了选项、或导入历史数据）；用户双击进入编辑（`table-factory.ts:81` 的 `editCellTrigger`）后按 Escape 或点击外部而未选择 → 存储值被静默改成第一项。
- 建议：`onStart` 记录 `#originalValue`，`close()` 覆盖为恢复原值（虚分发有效——基类处理器调 `this.close()`）。

### P2：日期字段永不判「未变更」，每次保存都重写日期字段

- 证据：`src/entity-form/form-data.ts:33-53` 的 `formDataToEntityChanges` 中 `parsed` 是归一化 ISO 串（`toISOString()`）、`orig` 是实体上的 `Date` 实例；守卫 `typeof parsed !== 'object' && typeof orig !== 'object'` 不命中，`structuralEqual('2026-…Z', Date)` 因类型不等恒 false（`structural-equal.ts:19-21`）。
- 触发：`rxdb-model-angular` 的 entity-detail 保存路径（`entity-detail.ts:331` 对 `entityToFormData`（`258`）产出的数据调 `formDataToEntityChanges`）——打开含日期字段的编辑表单、不动它直接保存 → update patch 包含该日期字段 → 虚假 UPDATE（updatedAt 抖动、working-tree 脏单元、sync 推送未变更字段）。
- 建议：两侧归一——`orig` 先经 `parseEntityFieldValue(field.type, orig)` 再比较，或按 epoch 毫秒比较 Date/字符串。

### P3：`parseNumberArray` 把空段解析成 0，违背「无法转换的项被丢弃」文档

- 证据：`src/entity-value.utils.ts:42-57`，`Number('') === 0`。
- 触发：`'1,,3'` / `'1,2,'` 经 `parseEntityFieldValue('numberArray', …)`（`formDataToEntityChanges` 正是这条路径）静默存成 `[1,0,3]` / `[1,2,0]`；严格变体拒绝 `''`（`166-176`）但保存路径是非严格。
- 建议：空段先跳过再 `Number(...)`（镜像 `parseStringArray`）。

### P3：整数解析截断而非拒绝数值输入，严格模式也放行 `12.9`

- 证据：`src/entity-value.utils.ts:126-133、198-201`，`parseInt(String(12.9), 10)` → `12`；严格模式的预检只查字符串（`163-165`），其 `Number.isInteger` 检查（`201`）看到的是已截断的 `12` 而通过。非严格路径 `parseInt('12abc')` → `12`。
- 触发：数字控件/程序化表单 patch 给 integer 字段喂 `12.9` → 严格校验通过、`12` 被静默持久化（小数输入被截断而非拒绝）。
- 建议：在原始输入上校验（`Number.isInteger(Number(raw))`）后再解析，或 `Math.trunc` + 相等检查。

## 验证与限制

本轮对本包执行静态增量检查，未单独运行其 lint/typecheck/test/build；不沿用旧报告的测试通过结论。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
