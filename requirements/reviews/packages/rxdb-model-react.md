# rxdb-model-react 深度评审

评审日期：2026-10-28。源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。范围：`packages/rxdb-model-react`。

## 结论

🟡 凑合。发现 1 条 P1、2 条 P2。三端 EntityDetail 共享“切换目标时保存旧实例”问题族；本文件登记本包独立实现的修复点。共享核心问题以链接引用，不重复计数。

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


### MDR-20261028-03 [P2] Activity 重显把用户查询重置为空并发出 queryChange

证据：[`QueryBuilder` 的服务生命周期 effect](../../../packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx) 每次接通创建一个新的 QueryBuilderService，立即订阅其 rootGroup$；订阅会覆盖保留的 React rootGroup state 并调用 onQueryChange。清理会销毁服务，仅清空 lastAppliedInitialQueryRef，没有保存用户当前查询。重显后的 initialQuery effect 只能恢复宿主传入的 initialQuery，无法恢复用户内部编辑而未回写 props 的查询。

最小触发：`<Activity><QueryBuilder fields={[title]} /></Activity>`，通过组件“添加第一个条件”按钮建立条件，然后隐藏并重显同一个 Activity；不需要换 key、卸载组件或传入非法查询。预期保留尚在编辑的条件；实际条件消失，onQueryChange 收到空根组。宿主若根据该事件应用列表筛选，筛选也会被清空。

复验：真实 QueryBuilder、真实 QueryBuilderService/校验器/转换器，经 esbuild 在内存中转译，在 ReactDOM 19.3.1 + happy-dom 中运行；仅 QueryGroup 展示子组件与拖放桥做轻量替身。实际点击的是主组件的首个条件按钮，服务订阅、状态与 queryChange 都保留原实现。记录为：

```text
before: {"combinator":"and","rules":[{"field":"title","operator":"=","value":""}]}
after hide/show: {"combinator":"and","rules":[]}
```

影响与限定：Activity 保留状态的页签/面板会丢失未回写到 initialQuery 的用户查询。宿主每次都将最新条件回写为 initialQuery 时可恢复最终条件，但新服务的初始空组订阅仍先发出空查询；本条没有验证真实 VTable 或业务列表执行结果，不推断数据库数据被修改。

修复建议：把当前查询快照随组件状态保留，重接时先从该快照建服务，再建立向外通知的订阅；区分宿主主动替换 initialQuery 和内部编辑快照，防止恢复过程先发布一个临时空查询。

建议回归：无 initialQuery、稳定 initialQuery 后用户修改、宿主回写当前查询三种配置；隐藏期间更新 initialQuery、反复显示及 StrictMode；同时断言界面规则和 queryChange 序列，不只等所有 effect 跑完看最终 DOM。

## 共享问题与 API 对照

React 使用 props/callback 与 DialogContext；表格句柄由 useImperativeHandle 提供，复用核心 EntityTableHandle/QueryTableHandle。已查看实际公开入口以及查询构建器入口，未将 Angular inject 与 React hook 名字差别误报为缺失。

本包的表格快捷键与批量事件使用核心 [MOD-20261028-01](rxdb-model.md)，列级只读绕过问题只在核心报告计数；框架层应在同一修复中执行交互回归。React EntityDetail 对异步 source 后到的 create 草稿补建已存在，且有专门用例；未重复登记旧问题。EntityTable 的 Activity hide/show tableReady 复位也已在源码与回归中实现。QueryBuilder 重建服务时恢复 initialQuery 的能力仅覆盖宿主当前 prop，内部编辑快照与重接事件序列见 MDR-20261028-03。

## 保存身份与 Activity 边界

有效 A→B 时 prevLoad 更新身份但不清旧实例，handleFormSubmitted 不检查加载结果是否属于当前 cls/id；EntityForm 没有 loading 保护，核心保存也不会读取路由目标。EntityTable 清理中已释放表格并 setTableReady(false)，不重复登记过去的 Activity tableReady 缺陷；本包新增的 Activity 问题发生在 QueryBuilder 查询服务快照。

## 验证与边界

重点核对 [`entity-detail/entity-detail.real.spec.tsx`](../../../packages/rxdb-model-react/src/__tests__/entity-detail/entity-detail.real.spec.tsx) 的现有 create/edit、保存失败、草稿取消、固定字段与关系 tab 覆盖；现有目标加载测试以单个已就绪记录为主，不能证明有效 id 切换的加载窗口安全。

本次 `rxdb-model-react:test`：302 passed (302)；本地缓存命中，未重新执行此目标。命令及整体边界见[总索引](README.md)。

边界：没有完成真实浏览器、真实 VTable canvas、路由复用和数据库适配器组合的端到端验收。组件测试中 VTable 仍为 fake，不能据此宣布表格引擎的 DOM/可访问性行为全部通过。
