---
kind: review-execution
object: rxdb-model-vue
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-model-vue：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Vue：metadata 驱动的表单、详情、列表、表格、弹窗与查询构造 UI 封装。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-model-vue/src/entity-form/EntityForm.vue`](../../../../packages/rxdb-model-vue/src/entity-form/EntityForm.vue)
- [`packages/rxdb-model-vue/src/entity-list/EntityList.vue`](../../../../packages/rxdb-model-vue/src/entity-list/EntityList.vue)
- [`packages/rxdb-model-vue/src/entity-table/EntityTable.vue`](../../../../packages/rxdb-model-vue/src/entity-table/EntityTable.vue)
- [`packages/rxdb-model-vue/src/entity-dialog/EntityDialog.vue`](../../../../packages/rxdb-model-vue/src/entity-dialog/EntityDialog.vue)
- [`packages/rxdb-model-vue/package.json`](../../../../packages/rxdb-model-vue/package.json)
- [`packages/rxdb-model-vue/project.json`](../../../../packages/rxdb-model-vue/project.json)
- [`packages/rxdb-model-vue/src/index.ts`](../../../../packages/rxdb-model-vue/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 失败，已留原日志              | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 表单/详情与字段契约：按 shared model 的所有字段/关系/readonly/format 规则核对三端 UI，检查 defaults、NEW/UPDATE、验证和显示。
- [ ] C2 列表/表格的真实写入口：追踪行删除、批量写、单元格编辑、筛选排序和游标；实例 remove 与 mutations 不能只审一条。
- [ ] C3 弹窗、portal 与可访问性：检查 EntityDialog/QueryBuilder/editor 的焦点、键盘、aria、portal cleanup 和不可信文本渲染。
- [ ] C4 Vue 生命周期与响应式来源：核查 ref/computed/getter 输入解包、watch 依赖、onScopeDispose/onUnmounted 与 provider scope，避免把首次取值变成永久快照。
- [ ] C5 Vue 类型与 SFC 消费：核查泛型 composable、SFC props/emits 与声明输出；响应式代理不能改变实体身份或隐藏错误。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。
