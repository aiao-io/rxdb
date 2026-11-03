# PR #183 Headless 实体 API 评审结论（2026-11-03）

- **评审对象**：`codex/us-403-headless` @ `fbc1ba9f` vs `main` @ `4b348eb`（PR [#183](https://github.com/aiao-io/rxdb/pull/183)，117 文件，+10618 / −192）
- **范围**：核心 `rxdb-model` 的 6 个 headless 控制器与工具、三框架绑定与默认 entity-form 重构、包入口与构建配置、审计脚本、需求文档、三端 demo 与 e2e、文档
- **CI 状态**：PR 全绿（lint/typecheck/build/test/coverage/e2e/gate/CodeQL），mergeable；sourcery-ai 27 条意见已逐条对照当前代码核实

## 总体结论

实现质量高，可以合并后跟进修复。核心控制器职责清晰（不触碰 DOM/VTable）、快照经 `cloneStructured` 深克隆隔离（Date/Uint8Array/循环引用有专项测试）、异步竞态防护完备（`requestId` / `viewEpoch` / `session` / 按 ID 串行队列）、三框架绑定对称（同一 `syncInput` 差分语义）、文档与 story 状态如实。上轮评审（2026-11-02，`pr183-deep-review-2026-11-02.md`，1 P1 + 6 P2）的修复全部在代码与回归测试中确认。发现 3 个 P2、1 个 P3 建议修复；sourcery 27 条中仅 3 条有部分价值（其中 2 条已由 story 跟踪或降级为轻微语义问题），其余为对旧提交的误报或已被代码处理。

## 需要修复的问题

### P2-1 `EntityListController.create` 满页时丢弃新建记录

[packages/rxdb-model/src/entity-list/headless.ts:297](../packages/rxdb-model/src/entity-list/headless.ts#L297)

```ts
this.#records = [...this.#records, created].slice(0, this.#pageSize);
```

append 后从头部截断：当 records 已达 `pageSize`（默认 25）时，长度变为 pageSize+1，`slice(0, pageSize)` 丢弃的是最后一项——刚创建的记录。此时 `created` 事件照常发布，但快照中不含该记录。

触发条件：无 `load`、非约束视图（query 缺省、sorts 空、page 0）、记录数恰好满页。demo 均带 load（refresh 会纠正），故未暴露；现有测试的 create 用例或带 load 或未满页，无覆盖。

修法：与「最新在前」语义对齐改为 `[created, ...this.#records].slice(0, this.#pageSize)`，或 append 后 `slice(-this.#pageSize)`；补无 load 满页 create 的回归用例。

### P2-2 React `useEntityDialog` 的 data 同步无结构守卫（sourcery #21 的成立子集）

[packages/rxdb-model-react/src/headless.ts:139](../packages/rxdb-model-react/src/headless.ts#L139)

```ts
if (options.data !== undefined) controller.setData(options.data);
```

`EntityDialogController.setData` 不做等值判断、每次发布新快照。宿主每次 render 内联构造 data 对象（未 memoize）时形成环：新引用 → `useCallback` 新函数 → effect 重跑 → `setData` → publish → `useSyncExternalStore` 快照新引用 → 重渲染 → 循环。

修法：在核心 `EntityDialogController.setData` 加 `structuralEqual` 守卫（与 form/list 的 setter 一致，三端同时受益），或 React 绑定侧比较后再同步。补「连续传入内容相同的新对象不再发布事件」的回归用例。Angular（signal 语义）与 Vue（deep watch）触发风险低，但守卫放核心侧一并覆盖。

### P2-3 `verify:headless-consumer` 未进 CI

`project.json` 新增了 `@aiao/source:headless-consumer`（工作区外真实构建产物验证 exports 目标、.d.ts 死链与无 VTable 导入），但 [.github/workflows/ci-template.yml:381](../.github/workflows/ci-template.yml#L381) 的 extras 采集清单只有 check-doc-code / api-docs / audit-secrets / audit-lazy-backend / ai-example / release-consumers 六项，不含 headless-consumer。该门禁在 CI 从未运行——PR #183 的 extras job 实际只跑了 release-consumers。未来 headless 入口回归（exports 目标缺失、意外引入 VTable 导入）CI 拦不住。

修法：在 ci-template.yml 增加 `HEADLESS_CONSUMER_JSON=$(projects_json headless-consumer)` 并入 EXTRAS union 与 summary 输出；并建议给 headless-consumer target 显式声明 inputs（`scripts/audit/headless-consumer.mjs` 与四个包 manifest），保证 affected 判定准确。

### P3-1 `setField` 解析失败时事件 result 只含单字段错误（sourcery #19 的残余）

[packages/rxdb-model/src/entity-form/headless.ts](../packages/rxdb-model/src/entity-form/headless.ts) 的 `setField` 失败路径 emit 的 `result.errors` 只含本次字段的错误；快照 `errors` 是全量（`validateForm` + 未修正解析错误合并）。若消费方只读事件不读快照，会看不到其他字段的既有错误。属事件语义设计（事件描述本次变更），但与 `validate()` 的 `validationChanged`（全量）不一致。

建议：文档注明「事件只描述本次变更，全量错误读 `snapshot.errors`」，或在 result 中补充全量错误字段。

## sourcery-ai 27 条意见逐条核实

| #   | 位置                                                   | 意见                                                                                                                                                                                                            | 核实结论 |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | entity-list/headless.ts:217 批量删除部分成功时行仍可见 | 不成立。`remove()` 用 `Promise.allSettled` 收敛成功项后更新 records/selectedIds，失败以 `AggregateError` 报告；「部分删除失败仍移除成功记录和选择」回归用例覆盖                                                 |
| 2   | entity-list/headless.ts:206 更新后实体丢原型方法       | 不成立。`replacement ?? record` 保留原实例；「void 更新保留实体原型和实例」用例覆盖                                                                                                                             |
| 3   | entity-detail/headless.ts:53 迟到的保存覆盖新会话      | 不成立。`#savePromise` 拒绝重入 + `#session` 守卫（`saveSuperseded`）；「阻止重入保存」「取消或关闭并重开后不接收旧保存结果」用例覆盖                                                                           |
| 4   | entity-detail/headless.ts:60 销毁后保存成功误报失败    | 不成立。成功路径先查 `#disposed` 再 `form.setData`；「持久化成功后销毁不应变成失败」用例覆盖                                                                                                                    |
| 5   | rxdb-model-vue entity-form 挂载后不改 data             | 不成立。`watch([data, entity], …, { deep: true, immediate: true })`                                                                                                                                             |
| 6   | entity-form/headless.ts:82 嵌套值浅克隆别名            | 不成立。`cloneStructured` 递归深克隆（Date/Uint8Array/循环引用）；「互不别名」用例覆盖                                                                                                                          |
| 7   | entity-dialog setData 发 opened 事件                   | 不成立。`setData` 发 `dataChanged`；「关闭弹窗的数据更新只发 dataChanged」用例覆盖                                                                                                                              |
| 8   | query-builder readonly 仍可绕过变更                    | 不成立。`#service` 私有，快照 cloneStructured；「readonly 不暴露可绕过权限的 service」用例覆盖                                                                                                                  |
| 9   | 未校验时无效表单报 valid                               | 不成立。`#buildSnapshot` 每次都实时跑 `validateForm`，构造即校验；「宿主替换为非法数据后立即提供错误」用例覆盖                                                                                                  |
| 10  | validate 成功后不发事件                                | 不成立。`#publishValidation` 成功失败都 emit `validationChanged`                                                                                                                                                |
| 11  | 旧 refresh 覆盖 setRecords/CRUD 结果                   | 不成立。`requestId` + `viewEpoch` 双失效；「外部数据更新后忽略旧刷新」「CRUD 期间旧刷新失效」用例覆盖                                                                                                           |
| 12  | 改查询后旧行仍显示                                     | 不成立。`setQuery`/`setSorts`/`setPage` 经 `#invalidatePending(true)` 清空 records/total/selectedIds；「切换查询后立即清空旧结果」用例覆盖                                                                      |
| 13  | create/update 破坏分页                                 | 不成立（基本）。`#isConstrainedView` 分支处理，有 load 时 refresh 纠正（期间短暂 transient 可接受）；「成功后按 loader 重算筛选、排序和分页」用例覆盖                                                           |
| 14  | 重叠更新丢字段                                         | 不成立。`#updateQueues` 按 ID 串行，run 内取最新 record；「重叠更新按同一 id 串行」「首个更新后的自动刷新不跳过第二个排队写入」用例覆盖                                                                         |
| 15  | 只读字段 displayValue 不格式化                         | 不成立。`#displayValue` 已处理 enum/stringArray/关系 label；「关系 provider、枚举和多选标签可刷新」用例覆盖                                                                                                     |
| 16  | React StrictMode 留下 disposed 控制器                  | 不成立。`useControllerStore` 刻意不调用 `dispose()`（StrictMode 回放 / `<Activity>` 隐藏 / Fast Refresh 与卸载无从区分），控制器随 state 保留；代价（卸载不中止查询）已写入文档                                 |
| 17  | 快照暴露可变状态                                       | 不成立。form/query-builder 快照 getter 均 `cloneStructured` 深克隆                                                                                                                                              |
| 18  | 刷新失败清空列表                                       | 不成立。`refresh` 不清 records，失败保留旧页；「同一查询刷新失败保留记录、总数和选择」用例覆盖                                                                                                                  |
| 19  | 字段错误互相抹掉                                       | 部分成立，见 **P3-1**。快照全量正确，仅事件 result 只含单字段                                                                                                                                                   |
| 20  | 默认表单独立状态逻辑                                   | 部分成立。三框架默认 entity-form 已全部改为消费控制器（该意见的 React 部分已修复）；QueryBuilder/EntityList/EntityDetail/EntityDialog 默认组件迁移是 story AC#9/#14 已跟踪的未完成范围（状态 ⚠️），非本次需修项 |
| 21  | React hooks 无限重渲染                                 | 部分成立，见 **P2-2**。`setData`/`setFields`/`syncInput` 等均有 structuralEqual 守卫，仅 dialog 的 data 同步无守卫                                                                                              |
| 22  | Vue 字段元数据原地改不同步                             | 不成立。`watch(…, { deep: true, immediate: true })`                                                                                                                                                             |
| 23  | headless-entry.spec 只查 toBeDefined                   | 不成立。spec 第 3、4 用例断言 exports 的 types/import/default 目标与 Angular secondary entry 配置；另有 `headless-consumer` 在工作区外验证真实构建产物（但该门禁未进 CI，见 **P2-3**）                          |
| 24  | Angular 表单状态落后于 React/Vue                       | 不成立。Angular `bindController` 用 `effect()` 全量同步 fields/mode/provider/data/entity，且带结构比较——三端中同步最全                                                                                          |
| 25  | 公开 API 缺 TSDoc                                      | 不成立（大部分）。控制器、工厂、绑定、公共类型均有中文 JSDoc；个别类型注释简略但不缺                                                                                                                            |
| 26  | capabilities 变化不到达列表动作                        | 不成立。三端 `syncInput` 均含 capabilities 差分；「宿主原地修改查询、排序或能力后同步」用例覆盖                                                                                                                 |
| 27  | React 详情字段变更丢草稿                               | 不成立。data/entity 走独立 effect + structuralEqual，fields/mode/provider 走不重置草稿的 setter                                                                                                                 |

**sourcery 中正确要改的**：#21 的 dialog 子集（→ P2-2）、#19 的残余语义（→ P3-1）、#20 的其余默认组件迁移（story 已如实跟踪，不需在 PR 内修）。

## 上轮评审修复确认（2026-11-02 深度评审，1 P1 + 6 P2）

README 记录的修复逐条复核属实：

- React hook 不再在 effect 清理时 `dispose()` 控制器（`useControllerStore` 注释与文档均说明，回归测试覆盖 StrictMode 语义）
- 表单解析错误保留到修正，新增 `discardInput()`，三端默认表单保持已发布提交语义（`core-headless-regression.spec.ts` 第 35/45/57 行用例）
- 列表/查询表格宿主输入同步收进核心 `syncInput()`，三端绑定共用一份差分与应用次序（`headless-contracts.spec.ts` 第 93/117 行用例）

## 其他观察（不要求修改）

- Angular secondary entry 构建配置有效：实测 tinyglobby（ng-packagr 22.2.5 的发现机制）能发现包根 `headless/ng-package.json`，发布产物 exports 由 ng-packagr 生成
- 核心主入口 `src/index.ts` 同时导出 headless 模块，不破坏子路径隔离（`src/headless.ts` 聚合图不含 VTable）；headless 入口目标干净
- US-403 story 文档状态如实：21 条 AC 中仅 AC#17（Node 环境）✅，其余 ⚠️ 并写明未完成项（默认组件迁移、历史/手动排序接线、无管线独立示例、仓外安装验证）
- `website/docs/entity-model/headless.md` 文档完整：三框架接入、生命周期代价（React 不 dispose）、`syncInput` 次序、批量删除部分成功语义均有说明
- `headless-consumer.mjs` 的 probe 里 `assert.equal(typeof document, 'undefined')` 在 Node 环境恒真，无意义但无害
- `entity-form` 的 `#buildSnapshot` 每次全量重跑 `validateForm` + 双层克隆，当前规模可接受，若后续字段数大再考虑增量
