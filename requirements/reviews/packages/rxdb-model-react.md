# rxdb-model-react 深度评审

评审日期：2026-10-28。源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。范围：`packages/rxdb-model-react`。

## 结论

🟡 凑合。发现 1 条 P1、1 条 P2。三端 EntityDetail 共享“切换目标时保存旧实例”问题族；本文件登记本包独立实现的修复点。共享核心问题以链接引用，不重复计数。

## 检查范围与证据

- 阅读[实际 index.ts](../../../packages/rxdb-model-react/src/index.ts)、[`EntityDetail 的 prevLoad / entityInstance / handleFormSubmitted`](../../../packages/rxdb-model-react/src/entity-detail/entity-detail.tsx)、[表格事件与生命周期](../../../packages/rxdb-model-react/src/entity-table/entity-table.tsx)、[查询构建器](../../../packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx)，对照同族 Angular/React/Vue 实现。
- 追踪详情 create/edit 两种状态、metadata 与路由输入优先级、草稿创建触发源、关系 tab 的固定条件、表单解析到保存的调用链。
- 追踪三端表格剪贴板/键盘事件到 EntityList 批量入口、行拖动及只读行约束，并抽查真实组件测试对草稿与错误面板的断言。
- 本次是风险路径深读；未声称穷尽全部样式、编辑器视觉和所有查询控件交互组合。

## 确定发现

### MDR-20261028-01 [P1] 切换详情目标时保存旧实例

问题族：`EntityDetail 切换目标时保存旧实例`；独立修复位置：rxdb-model-react。

证据：[`EntityDetail 的 prevLoad / entityInstance / handleFormSubmitted`](../../../packages/rxdb-model-react/src/entity-detail/entity-detail.tsx)。`prevLoad` 发现 cls/id 改变时，仅在 `!loadCls || !entityId` 分支清空 entityInstance；A、B 都是有效 id 时不会清空。新的 effect 只在 next 时替换实例。

`handleFormSubmitted` 捕获当前保留的 entityInstance，直接 Object.assign 并 save；没有将实例标记为只属于 A，也没有 B 待加载时的保存屏障。

最小触发：先打开并加载记录 A；复用同一个详情组件，把 entityId 改成 B，让 B 的仓库查询延迟且暂不发射；此时修改表单并保存。预期 B 就绪前无法提交到任何旧记录；实际保存对象仍是 A，B 的页面输入可能改写 A。切换实体类型时也需要同一身份屏障，不能只在目标不存在时清空。

复验：本次已做 React 真实 EntityDetail 的接缝运行复验：保留组件全部生命周期和保存代码，只用轻量仓库使 A 同步发射、B 保持挂起，表单子组件仅触发真实提交回调；在请求 B 的状态点击保存，输出 `requested entity B while B is pending; actual save target: ["A"]`。本包对应的代码链也已逐项核对。

影响：复用详情路由/组件并遇到慢查询时，保存到错误记录；属于数据正确性问题。取消旧订阅能防止 A 的后续 emission，却不会撤回已经留在 state/signal/ref 的 A。

修复建议：保存实例携带加载目标身份，只允许与当前 cls/id 一致的实例提交；新目标开始加载时复位旧实例并暴露加载状态，loading/error 时禁用内部保存。不能仅清空值却让“无实例”路径把提交当作 delegate 成功。

建议回归：A 已加载→B 挂起期间保存为零写入；B 到达后只写 B；A→B→C 反序到达、切换实体类型、B error/empty complete、取消/卸载后迟到回调。三端用同一场景矩阵分别验证。

### MDR-20261028-02 [P2] 字段列表清空没有同步给 QueryBuilder 服务

问题族：`QueryBuilder 空 schema 同步缺失`；独立修复位置：rxdb-model-react。

证据：[`QueryBuilder 的字段同步 effect`](../../../packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx) 用以下条件过滤更新：

```ts
if (service && fieldsComputed.length > 0) service.setFields(fieldsComputed);
```

最小触发：先传入 title 字段并建立 `title = 'ok'` 的合法规则；随后将 fields 改成空列表且不提供 schema；再改变规则的值触发重新校验。预期 title 已不在当前字段集合，产生 fieldExists 错误；实际服务仍持有旧字段 Map，继续认为 title 合法，而字段选择器已经没有该字段。

验证方式：逐项比较当前包装层条件与核心 [`QueryBuilderService.setFields`](../../../packages/rxdb-model/src/query-builder/services/query-builder.service.ts) 与 [`ValidationService.validateGroup`](../../../packages/rxdb-model/src/query-builder/services/validation.service.ts) 的 Map 更新与校验路径。此处即使修复 [MOD-20261028-02](rxdb-model.md) 的校验通知缺失仍然存在，因为包装层根本没有执行 setFields([])。

影响：切换实体/schema 或异步字段被撤下时，UI 的可选字段和实际校验集合不一致，允许输出当前 schema 已不可用的条件。没有据此声称能绕过数据库权限。

修复建议：不以 length>0 决定是否同步 schema；把每次有效计算得到的字段集合，包括空列表，交给服务。字段变化后的实时重新校验由核心 MOD-20261028-02 一并解决。

建议回归：保持同一组件，fields 从非空切空、schema 从有值切 undefined、再恢复字段，断言现有规则的 validationChange 与字段选择器一致；同一用例同时覆盖后续修改规则再校验，避免只验证上游是否重算。

## 共享问题与 API 对照

React 使用 props/callback 与 DialogContext；表格句柄由 useImperativeHandle 提供，复用核心 EntityTableHandle/QueryTableHandle。已查看实际公开入口以及查询构建器入口，未将 Angular inject 与 React hook 名字差别误报为缺失。

本包的表格快捷键与批量事件使用核心 [MOD-20261028-01](rxdb-model.md)，列级只读绕过问题只在核心报告计数；框架层应在同一修复中执行交互回归。React EntityDetail 对异步 source 后到的 create 草稿补建已存在，且有专门用例；未重复登记旧问题。EntityTable 的 Activity hide/show tableReady 复位也已在源码与回归中实现。QueryBuilder 重建服务时能恢复 initialQuery，但没有为未回写到 props 的用户查询另存快照；该边界未做运行复现，不计确定缺陷。

## 验证与边界

重点核对 [`entity-detail/entity-detail.real.spec.tsx`](../../../packages/rxdb-model-react/src/__tests__/entity-detail/entity-detail.real.spec.tsx) 的现有 create/edit、保存失败、草稿取消、固定字段与关系 tab 覆盖；现有目标加载测试以单个已就绪记录为主，不能证明有效 id 切换的加载窗口安全。

本次 `rxdb-model-react:test`：302 passed (302)；本地缓存命中，未重新执行此目标。命令及整体边界见[总索引](README.md)。

边界：没有完成真实浏览器、真实 VTable canvas、路由复用和数据库适配器组合的端到端验收。组件测试中 VTable 仍为 fake，不能据此宣布表格引擎的 DOM/可访问性行为全部通过。
