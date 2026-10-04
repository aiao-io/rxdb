---
kind: review-execution
object: rxdb-plugin-tree
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-tree：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

树实体、repository、增量查询与生成器；浏览器运行套件单独配置。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-tree/src/entity/tree-entity-base.ts`](../../../../packages/rxdb-plugin-tree/src/entity/tree-entity-base.ts)
- [`packages/rxdb-plugin-tree/src/repository/TreeRepository.ts`](../../../../packages/rxdb-plugin-tree/src/repository/TreeRepository.ts)
- [`packages/rxdb-plugin-tree/src/query/merge-update-tree.ts`](../../../../packages/rxdb-plugin-tree/src/query/merge-update-tree.ts)
- [`packages/rxdb-plugin-tree/src/query/tree-helper.ts`](../../../../packages/rxdb-plugin-tree/src/query/tree-helper.ts)
- [`packages/rxdb-plugin-tree/src/generator/TreeRepositoryGenerator.ts`](../../../../packages/rxdb-plugin-tree/src/generator/TreeRepositoryGenerator.ts)
- [`packages/rxdb-plugin-tree/package.json`](../../../../packages/rxdb-plugin-tree/package.json)
- [`packages/rxdb-plugin-tree/project.json`](../../../../packages/rxdb-plugin-tree/project.json)
- [`packages/rxdb-plugin-tree/src/index.ts`](../../../../packages/rxdb-plugin-tree/src/index.ts)

| target         | 当前证据                      | 日志                                                            |
| -------------- | ----------------------------- | --------------------------------------------------------------- |
| `lint`         | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)         |
| `typecheck`    | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt)    |
| `test`         | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)         |
| `build`        | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)        |
| `test-browser` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test-browser.txt) |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 树结构不变量：核查根、父子关系、层级与移动/删除的原子性，追踪 numeric/string id 路径。
- [ ] C2 树查询与增量：逐项比较 ancestors/descendants、懒加载与 merge-create/update/remove 同全量查询的结果。
- [ ] C3 能力限制与插件依赖：核查必须插件、querycache-ban、SQLite/PGlite backend 能力，明确不支持的组合。
- [ ] C4 生成类型与三框架：对照 TreeRepositoryGenerator、公开泛型及三端 use-tree，不能让树 API 被宽化为 any。
- [ ] C5 浏览器真实证据：区分普通 test 与 test-browser；不能只跑 generator 单测就宣称树运行时通过。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

四指标合并后已通过 80% 门禁，见 [合并门禁](../../evidence/2026-10-03/full-run/merged-coverage-gate.txt)；不代表全部 C 项完成。
