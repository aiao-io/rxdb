---
kind: review-execution
object: rxdb-plugin-working-tree
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-working-tree：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

数据库级写捕获、未提交变更、commit 图、CAS、分支物化与恢复会话。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 本轮内容指纹清单。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-working-tree/src/plugin.ts`](../../../../packages/rxdb-plugin-working-tree/src/plugin.ts)
- [`packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts`](../../../../packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts)
- [`packages/rxdb-plugin-working-tree/src/commit/write-commit.ts`](../../../../packages/rxdb-plugin-working-tree/src/commit/write-commit.ts)
- [`packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts`](../../../../packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts)
- [`packages/rxdb-plugin-working-tree/src/working-tree/activation-cas.ts`](../../../../packages/rxdb-plugin-working-tree/src/working-tree/activation-cas.ts)
- [`packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts`](../../../../packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts)
- [`packages/rxdb-plugin-working-tree/src/working-tree/capture-install.ts`](../../../../packages/rxdb-plugin-working-tree/src/working-tree/capture-install.ts)
- [`packages/rxdb-plugin-working-tree/package.json`](../../../../packages/rxdb-plugin-working-tree/package.json)
- [`packages/rxdb-plugin-working-tree/project.json`](../../../../packages/rxdb-plugin-working-tree/project.json)
- [`packages/rxdb-plugin-working-tree/src/index.ts`](../../../../packages/rxdb-plugin-working-tree/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `typecheck` | 本轮通过（限定当前配置/平台） | 执行日志 |
| `test`      | 本轮通过（限定当前配置/平台） | 执行日志      |
| `build`     | 本轮通过（限定当前配置/平台） | 执行日志     |

当前确认意见：RV-041（已修复，记录已删除）；仅对已取证专题下结论，不代表全对象审完。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 启用与迁移水位：追踪 enable、能力持久化、系统迁移及未装插件的客户端连接拒绝；v1 不凭空添加 disable。
- [ ] C2 写捕获闭合：逐入口核对实例/批量/raw SQL/远端应用与 trusted write，内部簿记不能进入用户工作树。
- [ ] C3 commit 与 CAS 幂等：检查全工作树提交、HEAD/activation revision、幂等 token 与 commit/change-set/ref 的原子性。
- [ ] C4 分支物化与 ABA：审查 staging 页、page fingerprint、激活屏障与分支删除/重建的身份关联。
- [ ] C5 discard / restore 语义：核查 restore/restoreSession 写成新未提交变更，HEAD 不移动；区分 switchBranch 的异常前置。
- [ ] C6 加密与敏感历史：逐项扫描工作树、提交、恢复会话、staging、错误与摘要的持久化字节和日志边界。
- [ ] C7 提交图与资源成本：检查 graph guard、codec、reachability、GC 和批量 diff/status 的复杂度。
- [ ] C8 真实后端与三端入口：对照 conformance、三个 use-working-tree 与应用交互，必须区分 mock/orchestration 与实际 transaction。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 续执行：2026-10-03 边界取证

### C3：内部 CAS 对照通过，但公开幂等重试失败

🟢 RV-041（已修复，记录已删除）：公开 commit 原请求重试被过期凭据挡住。人工沿 WorkingTreeManager.commit→runEnabled transaction→runCommitWorkingTree→writeCommit→finishCommit 阅读：CAS 使用 generation + headRevision + status；提交图、条目删除与 state 推进仍在同一事务，事件在 transaction 返回后发。但门面的 findCommitConflict 先于 operationId 查重。

原 53 条真实后端共享 conformance 在 SQLite/PGlite 均通过。新增“同一原请求、不重建条目、不刷新凭据”的公共 API 断言后，两端均 **1 failed / 53 passed**：SQLite / PGlite。保留 [共享断言](../../../../packages/rxdb-plugin-working-tree/src/working-tree/testing/commit.suite.ts)，没有在各后端复制不同的判据。

SQLite testing 子入口先 重建 后实际收集 54 条；首次仍只有 53 条的绿记录不是新 probe 证据。C3 仅部分核查，不勾完成：更多复用 token / 新草稿 / 分支 ABA 组合与六个真实宿主仍待补证。C2 捕获闭合、C6 加密全表扫描等没有因本专题通过而核销。

## 2026-10-05：plugins 并行源码深审与逐 C 交付

**执行状态：partial；评审完成不等于无缺陷，但必要证据缺失不能核销。** 本组不执行 Nx build/test/e2e/coverage/server，动态证据来自主控串行队列。下面覆盖原计划全部 C 编号，不修改原验收口径。

本轮只读了实际登记的源码/测试行区间与若干测试入口；不是全受控文件已经读完。九包 scope 共 **554** 个文件；本组读取范围见 `requirements/reviews/evidence/2026-10-05/parallel/plugins/file-inspection.json`，指纹盘点与阅读分开。当前源判断优先于已删除 RV 的历史状态。

当前 Node：**当前 Node 通过；计数不凭其它报告推算，无当前副本 JUnit**。日志：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt`；报告按 `rxdb-plugin-working-tree` 分目录保存。主控 69 项 strict lint/typecheck 已过，但不是全部 spec 类型或后来修订/晚到 probe 已过的证明。

当前 fresh **Node** 四指标（S/B/F/L）：**97.09% / 90.54% / 97.87% / 98.01%**。来源：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-plugin-working-tree/coverage-summary.json`。tree 的 100% 只涉及 Node 面；browser 合并/宿主 skip 另审。覆盖率达标不自动核销 C。

### 实际逐 C 核销矩阵

| C   | 核销状态       | 当前真实源码锚点（相对本包 src；注明联审者除外）                                                                                       | 不变量、正向与反证                                                                                                                                                                                                   | 已有/本轮测试证据                                                                                                                             | 必要缺口或核销边界                                                                                                  |
| --- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| C1  | partial / 待证 | commit/commit-capability.ts:118–153、177–236；plugin.ts:103–130；commit/enable-migration.ts:145–165                                    | 能力 singleton 缺行不是 disabled；protocol/schema/codec 分别拒绝；enable 是 enabled=false 条件 CAS，落败重读，不凭空增加 disable。bootstrapExisting 已启用时检查单 active 分支并安装捕获。                           | capability-enable、enable-migration、legacy-compat、bootstrap-existing、working-tree-commits-migration 入口；主控当前 Node fresh 四指标达标。 | 并发 enable/旧库水位/缺插件连接拒绝及失败回滚的真实 SQLite/PGlite 全矩阵仍未逐例审证。                              |
| C2  | partial / 待证 | working-tree/capture-install.ts:35–39；capture-hook.ts:259–274、371–425；capture-mount-points.ts:16–23                                 | 入口挂到 adapter hook；事务先抓日志水位，排除 nested 已 consumed change ids；mergeChanges 声明入口并同 executor 捕获，防内部 trusted 写被重复计入。不能把 hook 名单当所有宿主都实际挂载。                            | working-tree capture/write-entry/raw/bulk conformance 测试入口与当前 Node 门禁；本轮只深读部分捕获核心。                                      | raw-write-judgment/bulk/external-notify 全入口代码、安装中事务及各真实 adapter 漏捕/重复捕获探针尚未完整读取/对照。 |
| C3  | partial / 待证 | working-tree/commit-command.ts:215–242、289–339；commit/write-commit.ts:369–424；commit-idempotency.ts:74–107                          | 三类 revision 凭据先验；operationId 混 branchGeneration，重试不重复通知；HEAD CAS 排在 saveMany 前，rowsAffected=0 返回 conflict，不再按原 RV-041 旧 throw 判缺陷；成功后才清全工作树/推进会话。                     | commit-cas-idempotency、commit-empty-and-baseline、commit-graph 及当前 Node 全测量面。                                                        | 多个真实提交者竞争、保存中抛错的完整 rollback、幂等同内容/不同内容公开链路未全部取证，不借当前覆盖率自动核销。      |
| C4  | partial / 待证 | working-tree/branch-materialization.ts:362–506；materialize-branch.ts:267–392；activation-cas.ts:87–106、151–158                       | page 内容复算 fingerprint、唯一页冲突显式报错、seal 验密集序列；source failure 留 staging 以续页；materialize 与 settle 依赖 adapter prepare 同 transaction；activation 单例命中必须恰一行。                         | materialization-barrier、materialize-branch-takeover、metadata-only-branch-switch、switch-branch-options 入口；当前 Node 测量面通过。         | stage→激活的后半全部代码及删除重建 generation ABA、多 active、真实 crash/CAS 联合矩阵未完整闭合。                   |
| C5  | partial / 待证 | working-tree/restore-command.ts:1–34、379–429；replay/restore.ts:41–56；materialize-branch.ts:305–392                                  | restore 重放目标 commit 内容为新未提交单元，不是 checkout/删除后续实体；HEAD/history 不动；dirty/CAS/兼容/可达性有独立拒绝。switchBranch 前置异常与 restore 结构化返回不能混同。                                     | 原 restore 单元/conformance；本组 review-parallel-restore.spec.ts 走真实 PGlite，但首轮两红是本组契约误用，已修订待 late probe。              | 修订 spec 尚未复跑；CAS 竞争、恢复中断/重试与 switchBranch 完整前置矩阵仍缺。首轮红不登记产品问题。                 |
| C6  | partial / 待证 | commit/commit-codec.ts:178–204；commit/write-commit.ts:374–377；working-tree-patch-codec.ts:121–154；branch-materialization.ts:426–431 | commit 写前校验 encryptedPropertyMap 对应 patch/inversePatch 的 envelope；diagnostic 只含身份/列/枚举，不回显值；工作树 patch 经 metadata codec。staging 直接承载 payload，不能由 commit guard 推断 staging 已加密。 | commit-codec、commit-encryption、commit-encrypted-at-rest-wiring 入口；当前 Node 四指标达标。                                                 | 所有版本 envelope/tamper、工作树/提交/会话/staging 的实际落盘字节和日志全扫描未完成；不声称永久历史可删。           |
| C7  | partial / 待证 | commit/commit-graph-guard.ts:119–128、172–212、250–263；commit/write-commit.ts:291–329                                                 | 按 frontier 成批读 commit/change-set，seen 控遍历，缺 commit/数量/fingerprint 不符显式损坏；commit 序列与克隆内容进入 fingerprint。防无限环与资源成本是两回事。                                                      | corruption-guard、commit-graph、change-unit 入口和当前 Node 测量面。                                                                          | 深历史/大批 diff/status 的端到端成本、GC/不可达引用全部路径未读取/测量，不能把层批查询当复杂度已验收。              |
| C8  | partial / 待证 | plugin.ts:103–130；capture-install.ts:35–39；replay/restore.ts:41–56                                                                   | 公开 facade 与 adapter transaction 接缝已对照，明确本轮 PGlite 新 probe 与 mock orchestration 区别；不按 conformance 文件存在就称真实 backend 已过。                                                                 | 当前 working-tree fresh Node 四指标 97.09/90.54/97.87/98.01；本组 replay 实际 PGlite probe 待修订后复跑。                                     | SQLite/PGlite CAS/rollback/restore 与三 use-working-tree 相同 UI 状态矩阵尚未逐项联审；全对象 152 文件未全部深读。  |

### 本组改动与复验责任

仅改本对象计划/执行记录，以及本组 evidence；没有修改业务、依赖或已有测试，没有 Git 暂存/提交/重置，没有嵌套 agent。新增独立 probes 只在 search/replay/storage 自己的 sourceRoot，后续执行均归主控。

最小请求保存在 `requirements/reviews/evidence/2026-10-05/parallel/plugins/validation-requests.json`；候选在同目录 `findings.pending.md`。RV-060/061 不重复登记；RV-059 是其它对象公开接缝，不在本组扩 scope。
