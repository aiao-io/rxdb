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

🔴 C2 确认 RV-050（已修复，见 README 2026-10-05 清理记录）：NaN 穿过深度 clamp，真实 wa-sqlite 图的三个 API 返回成功空结果，隐藏非法数值。**3 failed /2 真实可达性对照 passed**：[日志](../../evidence/2026-10-04/generator-graph-miniprogram/graph-nan-depth-repaired.txt)，不是 SQL 结果假对象。

整包基线 **17 files /184 passed**：[日志](../../evidence/2026-10-04/generator-graph-miniprogram/rxdb-plugin-graph-baseline.txt)。人工检查 directed/undirected 边 upsert/remove、两向写的单事务、neighbors/path 规范化、CTE cycle/expansion、路径回填与 reactive task 依赖。undirected 两条语句已经在一个事务里、neighbors 层级上限 100、paths 上限 100000 expansions；没有把仅凭关键词想到的“无限递归/半边写”包装成缺陷。

既有负值/超上限规范化是文档化行为，不擅自改；其它数字形态、完整边属性/类型与所有并发/后端组合仍未全部深审。C1/C2 全对象结论保持未完成。

## 2026-10-05：plugins 并行源码深审与逐 C 交付

**执行状态：partial；评审完成不等于无缺陷，但必要证据缺失不能核销。** 本组不执行 Nx build/test/e2e/coverage/server，动态证据来自主控串行队列。下面覆盖原计划全部 C 编号，不修改原验收口径。

本轮只读了实际登记的源码/测试行区间与若干测试入口；不是全受控文件已经读完。九包 scope 共 **554** 个文件；本组读取范围见 `requirements/reviews/evidence/2026-10-05/parallel/plugins/file-inspection.json`，指纹盘点与阅读分开。当前源判断优先于已删除 RV 的历史状态。

当前 Node：**189 passed /0 failed /0 skip**。日志：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt`；报告按 `rxdb-plugin-graph` 分目录保存。主控 69 项 strict lint/typecheck 已过，但不是全部 spec 类型或后来修订/晚到 probe 已过的证明。

当前 fresh **Node** 四指标（S/B/F/L）：**97.48% / 93.63% / 100% / 97.91%**。来源：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-plugin-graph/coverage-summary.json`。tree 的 100% 只涉及 Node 面；browser 合并/宿主 skip 另审。覆盖率达标不自动核销 C。

### 实际逐 C 核销矩阵

| C   | 核销状态       | 当前真实源码锚点（相对本包 src；注明联审者除外）                                                           | 不变量、正向与反证                                                                                                                                                                                 | 已有/本轮测试证据                                                                                                          | 必要缺口或核销边界                                                                                                    |
| --- | -------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| C1  | partial / 待证 | graph_edge_entity.ts:15–44；sqlite/SqliteGraphRepository.ts:310–420                                        | 边身份为 sourceId/targetId 唯一键，双端 CASCADE；有向/无向路径分开，重复添加走 upsert。已追到元数据→边表 SQL，不把孤立索引声明当真实删除原子性。                                                   | directed/undirected-{weighted,unweighted}.spec.ts、add-edge-feature-guard.spec.ts；当前 Node 189/189 通过。                | 批写中途失败、真实删除节点与边同步、跨宿主 FK/CASCADE 的全验收矩阵尚缺。                                              |
| C2  | partial / 待证 | utils.ts:23–67；sqlite/query_graph_sql.ts:475–577；sqlite/SqliteGraphRepository.ts:194–249                 | NaN 在 clamp 前明确 RangeError，当前源不再按 RV-050 的旧行为判断；递归 cycle 标志、深度、扩展条数和结果 limit+1 各有边界，路径与节点回填在同一 transaction。不能把 result limit 当遍历工作量上限。 | review-query-nan-depth.spec.ts、graph-resource-limits.spec.ts、find-paths-backfill.spec.ts；当前 Node 全套通过，非旧基线。 | 高分支/深环/不可达、异常权重与超大节点回填的真实 SQL 资源成本未全面量化；RV-050 修复不等于完整 C2 核销。              |
| C3  | partial / 待证 | GraphRepository.ts:183–200；query/touches_edge_table.ts:20–43；query/merge_{create,update,remove}.ts:21–36 | 查询登记边实体依赖；namespace 与 entity 同时匹配，边变更强制 refresh，节点 plain-object where 同样重查；truncated 纳入 fingerprint，避免相同数组却漏掉截断状态。                                   | graph-reactive-api.spec.ts、merge-query.spec.ts、GraphRepository.unit.spec.ts；当前 Node 全套通过。                        | 真实边-only 更新/删节点、断连重连、范围外事件与全量 SQL 对照未完整闭合；不能由 merge 的 mock 调用次数替代结果正确性。 |
| C4  | partial / 待证 | plugin.ts:20–30；sqlite/SqliteGraphRepository.ts:48–77；sqlite/query_graph_sql.ts:123–127                  | repository 注册随 scope 撤销；缺内部列、非法边 id/direction/level 主动拒绝；未声明 weight/properties 的 edgeWhere 不降级为空过滤。SQLite 能力不扩写成所有后端支持。                                | repository-registry-contract.spec.ts、neighbor-row-guard.spec.ts、add-edge-feature-guard.spec.ts；当前 Node 全套通过。     | 未装插件/错误 metadata/不支持 backend 的 production-path 与消费端拒绝矩阵未逐一验证，保留 partial。                   |
| C5  | partial / 待证 | generator/GraphRepositoryGenerator.ts:176–290；GraphRepository.ts:33–48、74–156                            | 生成类型按 weight/properties 四组合分型，静态方法与 instance 方法区分 Observable/Promise；addEdge 未启用 weight 时保留参数位置而不伪称支持。                                                       | generator/GraphRepositoryGenerator.spec.ts、edge-filter-types.spec.ts；当前 Node 全套通过，主控 lib typecheck 通过。       | 真实生成客户端在发布入口上的运行/编译负向消费未复验；仓库内 ts-morph 测试不等于打包消费证明。                         |

### 本组改动与复验责任

仅改本对象计划/执行记录，以及本组 evidence；没有修改业务、依赖或已有测试，没有 Git 暂存/提交/重置，没有嵌套 agent。新增独立 probes 只在 search/replay/storage 自己的 sourceRoot，后续执行均归主控。

最小请求保存在 `requirements/reviews/evidence/2026-10-05/parallel/plugins/validation-requests.json`；候选在同目录 `findings.pending.md`。RV-060/061 不重复登记；RV-059 是其它对象公开接缝，不在本组扩 scope。
