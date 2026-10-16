# Review：@aiao/rxdb-model 评审

## 结论

🔴 首轮 P2 已修复并经二次评审复核；二次评审深扫 query-builder 之外的 form/list/table/vtable/editors 后新确认 1 条 P1、2 条 P2、2 条 P3。

## 检查范围

检查 entity metadata/value 工具、form/list/table/vtable、query-builder models/services/utils 与全部 spec；核对 package/project/vite 配置、公开 index exports、README 和 VTable peer 版本。二次评审深扫了 entity-value/entity-field/structural-equal 工具、entity-detail/form/list 与 entity-table 的 columns/editors/vtable 目录。

## 发现

### P2（已修复，二次评审复核）：默认显示名把连续大写缩写拆成单字母

- 修复：`src/query-builder/services/schema-parser.service.ts:86-90` 改为两步分词 `([A-Z]+)([A-Z][a-z])` + `([a-z\d])([A-Z])`。文档示例 `URLValue → URL Value`、`IDCard → ID Card`、`createdAt → Created At`、纯缩写 `ABC` 均与文档一致（二次评审已执行验证）。回归：`schema-parser.service.spec.ts` 补缩写用例；Node 26.7 下本包全量测试 **996/996 通过**。原条目证据与影响见首轮记录（`git show 17368950:requirements/reviews/packages/rxdb-model.md`）。

### P3（二次评审新确认）：缩写分词对「缩写 + 数字 + 大写」形态仍有边界

- 证据：`schema-parser.service.ts:88-89` 的两步正则对 `IPv4Address` 得到 `I Pv4 Address`（第一步贪婪 `[A-Z]+` 从 `IP` 回退到 `I`+`Pv`）、对 `2FAuth` 得到 `2 F Auth`（第二步按 `[a-z\d])([A-Z]` 切开了前置 token 内的数字-大写边界），均已执行复现。
- 影响：仅影响含此类形态的字段名标题（可感知的标签瑕疵），不涉及数据正确性。
- 建议：数字-大写边界只在后随小写时才切（`([a-z\d])([A-Z](?=[a-z]))`），或对数字嵌入 token 做预处理。

### P1（二次评审新确认）：枚举编辑器对「值不在选项列表」的单元格静默改写为第一项，Escape/点击外部不恢复

- 证据：`src/entity-table/editors/enum-editor.ts:76-84` 的 `onStart` 在当前值不在列表时自动选中 `realItems[0].value`；基类 Escape/外部点击路径（`editors/global-overlay-editor.ts:119-125`）只调 `close()` → `endEdit()`，无恢复逻辑；VTable 经 `getValue()` 把第一项经 cellChanged 写回。类文档（第 30 行）承诺「Escape：取消，恢复原始值」。同目录已废弃的 `IconListEditor`（`54-65`）对同一场景保留原值是正确范本。
- 触发：枚举单元格持有过期值（枚举声明删了选项、或导入历史数据）；用户双击进入编辑（`table-factory.ts:80` 的 `editCellTrigger`）后按 Escape 或点击外部而未选择 → 存储值被静默改成第一项。
- 建议：`onStart` 记录 `#originalValue`，`close()` 覆盖为恢复原值（虚分发有效——基类处理器调 `this.close()`）。

### P2（二次评审新确认）：日期字段永不判「未变更」，每次保存都重写日期字段

- 证据：`src/entity-form/form-data.ts:33-53` 的 `formDataToEntityChanges` 中 `parsed` 是归一化 ISO 串（`toISOString()`）、`orig` 是实体上的 `Date` 实例；守卫 `typeof parsed !== 'object' && typeof orig !== 'object'` 不命中，`structuralEqual('2026-…Z', Date)` 因类型不等恒 false（`structural-equal.ts:19-21`）。
- 触发：`rxdb-model-angular` 的 entity-detail 保存路径（`entity-detail.ts:331` 对 `entityToFormData`（`258`）产出的数据调 `formDataToEntityChanges`）——打开含日期字段的编辑表单、不动它直接保存 → update patch 包含该日期字段 → 虚假 UPDATE（updatedAt 抖动、working-tree 脏单元、sync 推送未变更字段）。
- 建议：两侧归一——`orig` 先经 `parseEntityFieldValue(field.type, orig)` 再比较，或按 epoch 毫秒比较 Date/字符串。

### P3（二次评审新确认）：`parseNumberArray` 把空段解析成 0，违背「无法转换的项被丢弃」文档

- 证据：`src/entity-value.utils.ts:42-57`，`Number('') === 0`。
- 触发：`'1,,3'` / `'1,2,'` 经 `parseEntityFieldValue('numberArray', …)`（`formDataToEntityChanges` 正是这条路径）静默存成 `[1,0,3]` / `[1,2,0]`；严格变体拒绝 `''`（`166-176`）但保存路径是非严格。
- 建议：空段先跳过再 `Number(...)`（镜像 `parseStringArray`）。

### P3（二次评审新确认）：整数解析截断而非拒绝数值输入，严格模式也放行 `12.9`

- 证据：`src/entity-value.utils.ts:126-133、198-201`，`parseInt(String(12.9), 10)` → `12`；严格模式的预检只查字符串（`163-165`），其 `Number.isInteger` 检查（`201`）看到的是已截断的 `12` 而通过。非严格路径 `parseInt('12abc')` → `12`。
- 触发：数字控件/程序化表单 patch 给 integer 字段喂 `12.9` → 严格校验通过、`12` 被静默持久化（小数输入被截断而非拒绝）。
- 建议：在原始输入上校验（`Number.isInteger(Number(raw))`）后再解析，或 `Math.trunc` + 相等检查。

## 风险/未覆盖

VTable 的真实 DOM/Canvas 渲染、浏览器剪贴板、Angular/React/Vue 组件集成未在本包静态环境复现；模型测试本身覆盖较广。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
