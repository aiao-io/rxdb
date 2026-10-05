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

## 2026-10-04：树查询与 DevTools 第三批深审

🔴 C2 确认 RV-046（已修复，见 README 2026-10-05 清理记录）：where 截断了 SQL 遍历的中间祖先，JS merge 更新却把未知祖先当成可达，叶子只出现在增量中。真实 SQLite/RxDB 实体 save＋observable 与同库 SQL 比较 **1 failed /1 passed**：[日志](../../evidence/2026-10-04/tree-devtools/tree-filter-incremental-sqlite-linked.txt)。

Node 默认 target 只跑生成器，**4 passed**；实际浏览器 target **17 files /250 passed**：[运行时日志](../../evidence/2026-10-04/tree-devtools/tree-browser-baseline.txt)。这些既有 runtime 多为模型/合并接缝，不能替代真实 SQL 对照；新漂移不被 250 个绿掩盖。PGlite 初始查询又被 RV-045 阻断，未把该增量场景冒充两端均复现。

人工检查 entity/TreeRepository/TreeHelper/merge_update、where/level 的规范化和递归 SQL。CTE 现有 1000 层保护不是无限递归，未把未测循环/深树风险直接报告成缺陷。C1 完整合法树/移动/失败原子性、其余 C2 组合与三框架仍待逐项核查；全对象不完成。

## 2026-10-05：plugins 并行源码深审与逐 C 交付

**执行状态：partial；评审完成不等于无缺陷，但必要证据缺失不能核销。** 本组不执行 Nx build/test/e2e/coverage/server，动态证据来自主控串行队列。下面覆盖原计划全部 C 编号，不修改原验收口径。

本轮只读了实际登记的源码/测试行区间与若干测试入口；不是全受控文件已经读完。九包 scope 共 **554** 个文件；本组读取范围见 `requirements/reviews/evidence/2026-10-05/parallel/plugins/file-inspection.json`，指纹盘点与阅读分开。当前源判断优先于已删除 RV 的历史状态。

当前 Node：**7 passed /0 failed /0 skip（仅 Node generator/静态面）**。日志：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt`；报告按 `rxdb-plugin-tree` 分目录保存。主控 69 项 strict lint/typecheck 已过，但不是全部 spec 类型或后来修订/晚到 probe 已过的证明。

当前 fresh **Node** 四指标（S/B/F/L）：**100% / 100% / 100% / 100%**。来源：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-plugin-tree/coverage-summary.json`。tree 的 100% 只涉及 Node 面；browser 合并/宿主 skip 另审。覆盖率达标不自动核销 C。

### 实际逐 C 核销矩阵

| C   | 核销状态       | 当前真实源码锚点（相对本包 src；注明联审者除外）                                                     | 不变量、正向与反证                                                                                                                                               | 已有/本轮测试证据                                                                                                                                            | 必要缺口或核销边界                                                                                                |
| --- | -------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| C1  | partial / 待证 | entity/tree-entity-base.ts:46–100；repository/tree-level.utils.ts:10–14；query/tree-helper.ts:94–198 | parentId 保持 Id 泛型，level 是非负安全整数；增量 helper visited 防环/缺父停止。读遍历终止不等于写入禁止自父或保证移动/删除整棵原子。                            | entity/tree-entity-numeric-id.browser.spec.ts、tree-helper.browser.spec.ts、merge-tree browser 入口已定位；当前 Node 仅 7/7。                                | 原自父/祖先移到子孙/孤儿/重复路径/深树/批写失败的真实 SQL 写入与回滚证据尚缺，不能拿 generator 的 Node 七例代替。 |
| C2  | partial / 待证 | query/merge-update-tree.ts:273–376、397–558；repository/TreeRepository.ts:65–119                     | where 翻转/改父会失去可达性信息，ancestors 与 counts 交 SQL refresh；纯字段变化才本地 applyExternalEntityUpdate。当前 RV-046 修法不是继续错误的局部 +1/-1 计数。 | query/review-query-tree.regression.browser.spec.ts、merge-update-tree.handlers.browser.spec.ts、numeric-id-tree-merge.browser.spec.ts；当前 browser 待主控。 | 边界移动、父删、未载节点、相同排序与全量 SQLite/PGlite 结果逐场景对照未完整核销。                                 |
| C3  | partial / 待证 | plugin.ts:48–64；repository/TreeRepository.ts:65–119                                                 | registry 按 SyncType.QueryCache 明确禁止，原因是 where 局部缓存不保证祖先链；四 API 走注册的 primary，不为缺插件补扁平查询。                                     | contracts/missing-plugin-error.browser.spec.ts、querycache-ban.browser.spec.ts；Node 不包含这两项，browser 排队。                                            | 缺插件/不支持 backend 的实际公开调用与当前 browser 拒绝结果未收齐。                                               |
| C4  | partial / 待证 | generator/TreeRepositoryGenerator.ts:69–151；entity/tree-entity-base.ts:46–98                        | children 规则收窄，RuleGroup 与 numeric/string Id 贯通；find 包含自身/count 不包含自身，声明返回 Observable，未宽化成 any。                                      | generator 及 contracts/public-type-compatibility、tree-query-type-parity browser 入口；当前 Node 7/7，主控 lib typecheck 通过。                              | 真实生成消费与三个框架相同输入返回状态/错误未独立映射到本 C；框架整体门禁不可自动替代三端用户链路。               |
| C5  | partial / 待证 | vite 配置/已解析 target 将 Node 与 browser 分开；repository/TreeRepository.ts:65–119                 | 当前 Node fresh summary 仅 20 lines/21 statements，是 generator 测量面，100% 绝不代表树运行时。已核对 browser 入口不是当前 Node include。                        | 主控 Node 7/7、coverage 100/100/100/100（仅 Node 面）；5 包 browser 由主控统一续跑。                                                                         | 完整 browser 与真实 SQLite/PGlite conformance 合并四指标、skip/宿主范围尚未收齐，原 C5 不核销。                   |

### 本组改动与复验责任

仅改本对象计划/执行记录，以及本组 evidence；没有修改业务、依赖或已有测试，没有 Git 暂存/提交/重置，没有嵌套 agent。新增独立 probes 只在 search/replay/storage 自己的 sourceRoot，后续执行均归主控。

最小请求保存在 `requirements/reviews/evidence/2026-10-05/parallel/plugins/validation-requests.json`；候选在同目录 `findings.pending.md`。RV-060/061 不重复登记；RV-059 是其它对象公开接缝，不在本组扩 scope。
