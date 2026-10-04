---
kind: review-execution
object: rxdb-plugin-graph
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-graph：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

图实体、边表、遍历/路径查询、响应式增量与 repository 生成器。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-graph/src/GraphRepository.ts`](../../../../packages/rxdb-plugin-graph/src/GraphRepository.ts)
- [`packages/rxdb-plugin-graph/src/graph-edge-entity.factory.ts`](../../../../packages/rxdb-plugin-graph/src/graph-edge-entity.factory.ts)
- [`packages/rxdb-plugin-graph/src/query/touches_edge_table.ts`](../../../../packages/rxdb-plugin-graph/src/query/touches_edge_table.ts)
- [`packages/rxdb-plugin-graph/src/sqlite/query_graph_sql.ts`](../../../../packages/rxdb-plugin-graph/src/sqlite/query_graph_sql.ts)
- [`packages/rxdb-plugin-graph/src/generator/GraphRepositoryGenerator.ts`](../../../../packages/rxdb-plugin-graph/src/generator/GraphRepositoryGenerator.ts)
- [`packages/rxdb-plugin-graph/package.json`](../../../../packages/rxdb-plugin-graph/package.json)
- [`packages/rxdb-plugin-graph/project.json`](../../../../packages/rxdb-plugin-graph/project.json)
- [`packages/rxdb-plugin-graph/src/index.ts`](../../../../packages/rxdb-plugin-graph/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 节点与边不变量：核查有向/无向、加权/无权、重复边、自环和移除节点的边处理。
- [ ] C2 遍历复杂度与限界：审查递归 SQL、路径去重、深度/数量约束与权重处理，防止小输入触发无限遍历。
- [ ] C3 响应式依赖追踪：检查边表变化是否正确触发查询，尤其 touches_edge_table 与全量/增量边界。
- [ ] C4 能力声明与后端：对照 SQLite graph repository、plugin feature guard 与其他后端能力，不按类名假设全后端支持。
- [ ] C5 生成器与公共类型：检查 edge filter、GraphRepositoryGenerator 的泛型、返回结构和导出。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-04：生成器、图与小程序第四批深审

🔴 C2 确认 [RV-050](../../RV-050-graph-nan-depth-silent-empty-result.md)：NaN 穿过深度 clamp，真实 wa-sqlite 图的三个 API 返回成功空结果，隐藏非法数值。**3 failed /2 真实可达性对照 passed**：[日志](../../evidence/2026-10-04/generator-graph-miniprogram/graph-nan-depth-repaired.txt)，不是 SQL 结果假对象。

整包基线 **17 files /184 passed**：[日志](../../evidence/2026-10-04/generator-graph-miniprogram/rxdb-plugin-graph-baseline.txt)。人工检查 directed/undirected 边 upsert/remove、两向写的单事务、neighbors/path 规范化、CTE cycle/expansion、路径回填与 reactive task 依赖。undirected 两条语句已经在一个事务里、neighbors 层级上限 100、paths 上限 100000 expansions；没有把仅凭关键词想到的“无限递归/半边写”包装成缺陷。

既有负值/超上限规范化是文档化行为，不擅自改；其它数字形态、完整边属性/类型与所有并发/后端组合仍未全部深审。C1/C2 全对象结论保持未完成。
