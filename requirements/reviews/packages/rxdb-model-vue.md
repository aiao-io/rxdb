# rxdb-model-vue 深度评审

评审日期：2026-10-28。源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。范围：`packages/rxdb-model-vue`。

## 结论

🟡 凑合。发现 1 条 P1、1 条 P2。三端 EntityDetail 共享“切换目标时保存旧实例”问题族；本文件登记本包独立实现的修复点。共享核心问题以链接引用，不重复计数。

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

## 共享问题与 API 对照

Vue 的 props/emits、DialogPortal 注入上下文、defineExpose 对应另外两端组件面。查询构建器及 EntityTable/QueryTable 均有公开入口。Vue maxDepth 动态调用 setMaxNestingLevel；这与另外两端的构造期捕获有现有差异。

本包的表格快捷键与批量事件使用核心 [MOD-20261028-01](rxdb-model.md)，列级只读绕过问题只在核心报告计数；框架层应在同一修复中执行交互回归。已知限制，非新增发现：EntityDetail 在 setup 执行 `const rxdb = useRxDBOptional()` 只保存快照；其 entityCls 与创建草稿 watch 不会因 provider Ref 后到而重新获得数据库。因此 Promise/Ref source 首帧未就绪时，edit 加载与 create 草稿补建缺失。当前源码与 2026-10-27 清理记录一致；应消费响应式 useRxDBRef/injectRxDBRef。该条不再计入本次新增 P 级统计。

## 保存目标与异步源边界

entityInstance watch 的 cleanup 只撤销旧订阅，不撤销已存的 A；EntityForm 的保存动作没有 loading/身份保护，因此有效 B 尚未发射时的 P1 可达。`useRxDBOptional()` setup 快照的既有缺口保留在已知限制中，没有重新计作新增。字段列表清空 guard 与核心 validation$ 不通知也不是同一修复位置。

## 验证与边界

重点核对 [`entity-detail/entity-detail.real.spec.ts`](../../../packages/rxdb-model-vue/src/__tests__/entity-detail/entity-detail.real.spec.ts) 的现有 create/edit、保存失败、草稿取消、固定字段与关系 tab 覆盖；现有目标加载测试以单个已就绪记录为主，不能证明有效 id 切换的加载窗口安全。

本次 `rxdb-model-vue:test`：338 passed (338)；本地缓存命中，未重新执行此目标。命令及整体边界见[总索引](README.md)。

边界：没有完成真实浏览器、真实 VTable canvas、路由复用和数据库适配器组合的端到端验收。组件测试中 VTable 仍为 fake，不能据此宣布表格引擎的 DOM/可访问性行为全部通过。
