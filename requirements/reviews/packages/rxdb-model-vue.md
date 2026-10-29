# rxdb-model-vue 深度评审

评审日期：2026-10-29。源码基线：`f62f77c19d55c73d8335df026778422282c2fed4`。范围：`packages/rxdb-model-vue`。

## 结论

🟡 凑合。原 1 条 P1（切换详情目标时保存旧实例）已被 #169 修复，本轮从计数剔除；现存 1 条 P2（QueryBuilder 空 schema 同步缺失）。本更新轮未发现新的确定问题。三端 EntityDetail“切换目标时保存旧实例”问题族在本包已闭环，Angular/React 同族状态见对应报告。

## 检查范围与证据

- 阅读[实际 index.ts](../../../packages/rxdb-model-vue/src/index.ts)、[`EntityDetail 的 entityInstance watch / onFormSubmitted`](../../../packages/rxdb-model-vue/src/entity-detail/EntityDetail.vue)、[表格事件与生命周期](../../../packages/rxdb-model-vue/src/entity-table/EntityTable.vue)、[查询构建器](../../../packages/rxdb-model-vue/src/query-builder/query-builder/QueryBuilder.vue)，对照同族 Angular/React/Vue 实现。
- 追踪详情 create/edit 两种状态、metadata 与路由输入优先级、草稿创建触发源、关系 tab 的固定条件、表单解析到保存的调用链。
- 追踪三端表格剪贴板/键盘事件到 EntityList 批量入口、行拖动及只读行约束，并抽查真实组件测试对草稿与错误面板的断言。
- 本次是风险路径深读；未声称穷尽全部样式、编辑器视觉和所有查询控件交互组合。

## 确定发现

### MDV-20261028-01 [P1] 切换详情目标时保存旧实例

问题族：`EntityDetail 切换目标时保存旧实例`；独立修复位置：rxdb-model-vue。

证据：[`EntityDetail 的 entityInstance watch / onFormSubmitted`](../../../packages/rxdb-model-vue/src/entity-detail/EntityDetail.vue)。watch 在 id/cls 改变时取消旧订阅，却只在 `!cls || !id || !rxdb` 时清空 entityInstance；合法 A→B 时继续保留 A。error 回调只交给 handleError，也不清空原实例。

`onFormSubmitted` 直接取得 `entityInstance.value`，Object.assign 变更后 save；没有验证实例是否属于当前 entityId。

最小触发：先打开并加载记录 A；复用同一个详情组件，把 entityId 改成 B，让 B 的仓库查询延迟且暂不发射；此时修改表单并保存。预期 B 就绪前无法提交到任何旧记录；实际保存对象仍是 A，B 的页面输入可能改写 A。切换实体类型时也需要同一身份屏障，不能只在目标不存在时清空。

复验：本条证据为当前源码的订阅/状态与保存调用链；React 同族实现另有真实组件接缝运行复现。没有声称本包已用真实存储后端完成同一交互验收。

影响：复用详情路由/组件并遇到慢查询时，保存到错误记录；属于数据正确性问题。取消旧订阅能防止 A 的后续 emission，却不会撤回已经留在 state/signal/ref 的 A。

修复建议：保存实例携带加载目标身份，只允许与当前 cls/id 一致的实例提交；新目标开始加载时复位旧实例并暴露加载状态，loading/error 时禁用内部保存。不能仅清空值却让“无实例”路径把提交当作 delegate 成功。

建议回归：A 已加载→B 挂起期间保存为零写入；B 到达后只写 B；A→B→C 反序到达、切换实体类型、B error/empty complete、取消/卸载后迟到回调。三端用同一场景矩阵分别验证。

**2026-10-29 复核：已修复。** a808f770（#169「修复 Vue 实体详情的异步数据库就绪」）重写了[`EntityDetail.vue`](../../../packages/rxdb-model-vue/src/entity-detail/EntityDetail.vue) 的加载与保存链：`entityInstance` watch 依赖改为 `[rxdb.value, entityCls, entityId, formMode]`，目标变化时立即置空旧实例并取消旧订阅；`onFormSubmitted` 先经 `isEditPending` 守卫（数据库或实体查询未就绪时拦截提交，表单内部提交按钮同时隐藏），保存完成后经 `editGeneration` 代次与实例身份守卫（`isCurrent`）判定是否关闭对话框、发事件或写错误面板。新增 [entity-detail.async.spec.ts](../../../packages/rxdb-model-vue/src/__tests__/entity-detail/entity-detail.async.spec.ts)（777 行）覆盖「实体查询等待期间加载前不提交、加载后实际保存」「A→B→A 切换后旧保存迟到成功/失败不影响当前视图」「换库后旧保存不影响新草稿」等用例。原触发链（A 已加载→B 挂起→保存改写 A）已不可达。不再计入新增问题计数。

### MDV-20261028-02 [P2] 字段列表清空没有同步给 QueryBuilder 服务

问题族：`QueryBuilder 空 schema 同步缺失`；独立修复位置：rxdb-model-vue。

证据：[`QueryBuilder 的 fieldsComputed watch`](../../../packages/rxdb-model-vue/src/query-builder/query-builder/QueryBuilder.vue) 用以下条件过滤更新：

```ts
if (fields.length > 0) service.setFields(fields);
```

最小触发：先传入 title 字段并建立 `title = 'ok'` 的合法规则；随后将 fields 改成空列表且不提供 schema；再改变规则的值触发重新校验。预期 title 已不在当前字段集合，产生 fieldExists 错误；实际服务仍持有旧字段 Map，继续认为 title 合法，而字段选择器已经没有该字段。

验证方式：逐项比较当前包装层条件与核心 [`QueryBuilderService.setFields`](../../../packages/rxdb-model/src/query-builder/services/query-builder.service.ts) 与 [`ValidationService.validateGroup`](../../../packages/rxdb-model/src/query-builder/services/validation.service.ts) 的 Map 更新与校验路径。此处即使修复 [MOD-20261028-02](rxdb-model.md) 的校验通知缺失仍然存在，因为包装层根本没有执行 setFields([])。

影响：切换实体/schema 或异步字段被撤下时，UI 的可选字段和实际校验集合不一致，允许输出当前 schema 已不可用的条件。没有据此声称能绕过数据库权限。

修复建议：不以 length>0 决定是否同步 schema；把每次有效计算得到的字段集合，包括空列表，交给服务。字段变化后的实时重新校验由核心 MOD-20261028-02 一并解决。

建议回归：保持同一组件，fields 从非空切空、schema 从有值切 undefined、再恢复字段，断言现有规则的 validationChange 与字段选择器一致；同一用例同时覆盖后续修改规则再校验，避免只验证上游是否重算。

**2026-10-29 复核：仍有效。** [`QueryBuilder.vue`](../../../packages/rxdb-model-vue/src/query-builder/query-builder/QueryBuilder.vue) 本轮无变更（变更面仅 EntityDetail.vue 与新增 async spec），`fields.length > 0` 过滤条件仍在 fieldsComputed watch 中；核心 [`QueryBuilderService.setFields`](../../../packages/rxdb-model/src/query-builder/services/query-builder.service.ts) 与 [`ValidationService.validateGroup`](../../../packages/rxdb-model/src/query-builder/services/validation.service.ts) 的 Map 更新与校验路径亦未变化。

## 共享问题与 API 对照

Vue 的 props/emits、DialogPortal 注入上下文、defineExpose 对应另外两端组件面。查询构建器及 EntityTable/QueryTable 均有公开入口。Vue maxDepth 动态调用 setMaxNestingLevel；这与另外两端的构造期捕获有现有差异。

本包的表格快捷键与批量事件使用核心 [MOD-20261028-01](rxdb-model.md)，列级只读绕过问题只在核心报告计数；框架层应在同一修复中执行交互回归。已知限制（更新）：EntityDetail 已改用 [`injectRxDBRef(true)`](../../../packages/rxdb-vue/src/rxdb-vue.ts) 响应式等待异步数据库（#169），Promise/Ref/异步工厂 source 首帧未就绪时的 edit 加载与 create 草稿补建（metadata 路径）均已覆盖，setup 快照缺口不再成立。剩余边界：create 草稿 watch 仍只认 `props.metadata`（`entityClsFromDialog`），纯路由输入（namespace/name 无 metadata）在 create 模式下不建草稿、`onSave` 走 emit 透传路径零落库——与基线行为一致（基线同样要求 meta），未恶化，不计入新增 P 级统计。

## 保存目标与异步源边界

新实现以 `editGeneration` 代次 + 实例身份双守卫收紧保存链：目标/数据库/formMode 任一变化都推进代次并复位 `entityInstance`；`isEditPending` 在数据库或实体查询未就绪期间拦截提交；迟到保存成功/失败都经 `isCurrent` 判定后静默丢弃。等待期间的字段输入进 `editFormChanges`，目标就绪后合入显示并随下一次提交落库（保存期间再输入的新值经 `settleEditChanges` 保留到下次提交）。`useRxDBOptional()` setup 快照的既有缺口已被 `injectRxDBRef(true)` 取代，不再成立。字段列表清空 guard 与核心 validation$ 不通知仍不是同一修复位置。

## 验证与边界

重点核对 [`entity-detail/entity-detail.real.spec.ts`](../../../packages/rxdb-model-vue/src/__tests__/entity-detail/entity-detail.real.spec.ts) 的现有 create/edit、保存失败、草稿取消、固定字段与关系 tab 覆盖；新增 [entity-detail/entity-detail.async.spec.ts](../../../packages/rxdb-model-vue/src/__tests__/entity-detail/entity-detail.async.spec.ts)（777 行、16 个用例）为本轮变更直接配套：三种 source（Promise/异步工厂/Ref）迟到就绪、等待期间输入保留与提交拦截、卸载后迟到回调、换库与 A→B→A 迟到保存、独立表单保存期间继续编辑等。本轮评审只做静态推导与证据链核对，未重新运行测试目标。

首轮（2026-10-28）`rxdb-model-vue:test`：338 passed (338)；本地缓存命中，未重新执行此目标。命令及整体边界见[总索引](README.md)。

边界：没有完成真实浏览器、真实 VTable canvas、路由复用和数据库适配器组合的端到端验收。组件测试中 VTable 仍为 fake，不能据此宣布表格引擎的 DOM/可访问性行为全部通过。
