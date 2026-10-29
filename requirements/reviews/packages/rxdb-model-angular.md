# rxdb-model-angular 深度评审

评审日期：2026-10-29（更新轮；首轮 2026-10-28）。源码基线：`f62f77c19d55c73d8335df026778422282c2fed4`。范围：`packages/rxdb-model-angular`。首轮基线 `7bb16a9014095d4003bd059244722013b36867c1` 至本基线本包无源码变更。

## 结论

🟡 凑合。发现 1 条 P1、1 条 P2（2026-10-29 复核均仍有效）。三端 EntityDetail 共享“切换目标时保存旧实例”问题族；本文件登记本包独立实现的修复点。共享核心问题以链接引用，不重复计数。本更新轮沿原评审重点抽查未发现新的确定问题。

## 检查范围与证据

- 阅读[实际 index.ts](../../../packages/rxdb-model-angular/src/index.ts)、[`EntityDetailComponent.#entityInstance / onFormSubmitted`](../../../packages/rxdb-model-angular/src/entity-detail/entity-detail.ts)、[表格事件与生命周期](../../../packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts)、[查询构建器](../../../packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts)，对照同族 Angular/React/Vue 实现。
- 追踪详情 create/edit 两种状态、metadata 与路由输入优先级、草稿创建触发源、关系 tab 的固定条件、表单解析到保存的调用链。
- 追踪三端表格剪贴板/键盘事件到 EntityList 批量入口、行拖动及只读行约束，并抽查真实组件测试对草稿与错误面板的断言。
- 本次是风险路径深读；未声称穷尽全部样式、编辑器视觉和所有查询控件交互组合。

## 确定发现

### MDA-20261028-01 [P1] 切换详情目标时保存旧实例

问题族：`EntityDetail 切换目标时保存旧实例`；独立修复位置：rxdb-model-angular。

证据：[`EntityDetailComponent.#entityInstance / onFormSubmitted`](../../../packages/rxdb-model-angular/src/entity-detail/entity-detail.ts)。`#entityInstance` 是 `toObservable(...).pipe(switchMap(...))` 转成的 signal；合法 A→B 切换时，新的 inner Observable 没有 `startWith(null)`，signal 继续保留 A，直到 B 首次 next。

`onFormSubmitted` 直接取得 `this.#entityInstance()`，将变更 `Object.assign` 到该实例并调用 save。

最小触发：先打开并加载记录 A；复用同一个详情组件，把 entityId 改成 B，让 B 的仓库查询延迟且暂不发射；此时修改表单并保存。预期 B 就绪前无法提交到任何旧记录；实际保存对象仍是 A，B 的页面输入可能改写 A。切换实体类型时也需要同一身份屏障，不能只在目标不存在时清空。

复验：本条证据为当前源码的订阅/状态与保存调用链；React 同族实现另有真实组件接缝运行复现。没有声称本包已用真实存储后端完成同一交互验收。

影响：复用详情路由/组件并遇到慢查询时，保存到错误记录；属于数据正确性问题。取消旧订阅能防止 A 的后续 emission，却不会撤回已经留在 state/signal/ref 的 A。

修复建议：保存实例携带加载目标身份，只允许与当前 cls/id 一致的实例提交；新目标开始加载时复位旧实例并暴露加载状态，loading/error 时禁用内部保存。不能仅清空值却让“无实例”路径把提交当作 delegate 成功。

建议回归：A 已加载→B 挂起期间保存为零写入；B 到达后只写 B；A→B→C 反序到达、切换实体类型、B error/empty complete、取消/卸载后迟到回调。三端用同一场景矩阵分别验证。

**2026-10-29 复核：**仍有效。[`#entityInstance` / `onFormSubmitted`](../../../packages/rxdb-model-angular/src/entity-detail/entity-detail.ts) 的 switchMap 分支没有 `startWith(null)`，signal 在 B 首次发射前保留 A；`onFormSubmitted` 直接 `Object.assign` 当前 signal 值并调用 save，无加载身份校验，均与首轮记录一致（本包自首轮基线无源码变更）。

### MDA-20261028-02 [P2] 字段列表清空没有同步给 QueryBuilder 服务

问题族：`QueryBuilder 空 schema 同步缺失`；独立修复位置：rxdb-model-angular。

证据：[`QueryBuilderComponent 的字段同步 effect`](../../../packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts) 用以下条件过滤更新：

```ts
if (fields.length > 0) this.service.setFields(fields);
```

最小触发：先传入 title 字段并建立 `title = 'ok'` 的合法规则；随后将 fields 改成空列表且不提供 schema；再改变规则的值触发重新校验。预期 title 已不在当前字段集合，产生 fieldExists 错误；实际服务仍持有旧字段 Map，继续认为 title 合法，而字段选择器已经没有该字段。

验证方式：逐项比较当前包装层条件与核心 [`QueryBuilderService.setFields`](../../../packages/rxdb-model/src/query-builder/services/query-builder.service.ts) 与 [`ValidationService.validateGroup`](../../../packages/rxdb-model/src/query-builder/services/validation.service.ts) 的 Map 更新与校验路径。此处即使修复 [MOD-20261028-02](rxdb-model.md) 的校验通知缺失仍然存在，因为包装层根本没有执行 setFields([])。

影响：切换实体/schema 或异步字段被撤下时，UI 的可选字段和实际校验集合不一致，允许输出当前 schema 已不可用的条件。没有据此声称能绕过数据库权限。

修复建议：不以 length>0 决定是否同步 schema；把每次有效计算得到的字段集合，包括空列表，交给服务。字段变化后的实时重新校验由核心 MOD-20261028-02 一并解决。

建议回归：保持同一组件，fields 从非空切空、schema 从有值切 undefined、再恢复字段，断言现有规则的 validationChange 与字段选择器一致；同一用例同时覆盖后续修改规则再校验，避免只验证上游是否重算。

**2026-10-29 复核：**仍有效。[字段同步 effect](../../../packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts) 的 `if (fields.length > 0)` 守卫与核心 `setFields` 仅改普通 Map 的路径均与首轮一致（本包自首轮基线无源码变更）。

## 共享问题与 API 对照

Angular 经 input/output 与 CDK DialogRef/DIALOG_DATA 对接；creationChain/editChain 采用别名 input，保留原有效值成员。EntityTableHandle/QueryTableHandle 复用核心合同。

本包的表格快捷键与批量事件使用核心 [MOD-20261028-01](rxdb-model.md)，列级只读绕过问题只在核心报告计数；框架层应在同一修复中执行交互回归。根级 provideRxDB 在 bootstrap 前等待 source，不适用 Vue 的异步 setup 快照缺口。QueryBuilder 的 maxDepth 在构造时捕获、Vue 端动态同步，是需要明确的现有配置行为差异；本报告未把未经交互复验的深度约束推断列为确定问题。

## 保存目标与包装边界

模板没有按加载目标禁用 EntityForm 的动作，`formDataToEntityChanges` 只处理字段类型/readonly，核心 `EntityManager.save(this)` 只知道实例身份；没有上游会把旧 A 自动校正为当前 entityId=B。合法 A→B 等待窗口的 P1 保留。字段清空时即使随后修改规则触发核心重算，包装层未传入的空 schema 仍使旧字段 Map 生效，P2 与核心通知缺失分别成立。

## 验证与边界

重点核对 [`entity-detail/entity-detail.real.spec.ts`](../../../packages/rxdb-model-angular/src/__tests__/entity-detail/entity-detail.real.spec.ts) 的现有 create/edit、保存失败、草稿取消、固定字段与关系 tab 覆盖；现有目标加载测试以单个已就绪记录为主，不能证明有效 id 切换的加载窗口安全。

首轮（2026-10-28）`rxdb-model-angular:test`：344 passed (344)；本地缓存命中，未重新执行此目标。命令及整体边界见[总索引](README.md)。

边界：没有完成真实浏览器、真实 VTable canvas、路由复用和数据库适配器组合的端到端验收。组件测试中 VTable 仍为 fake，不能据此宣布表格引擎的 DOM/可访问性行为全部通过。
