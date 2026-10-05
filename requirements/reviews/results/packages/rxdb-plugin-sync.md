---
kind: review-execution
object: rxdb-plugin-sync
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-sync：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

push/pull、分支同步、冲突处理、依赖排序与 QueryCache outbox orchestration。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-sync/src/SyncManager.ts`](../../../../packages/rxdb-plugin-sync/src/SyncManager.ts)
- [`packages/rxdb-plugin-sync/src/pull-round.ts`](../../../../packages/rxdb-plugin-sync/src/pull-round.ts)
- [`packages/rxdb-plugin-sync/src/push-repository.ts`](../../../../packages/rxdb-plugin-sync/src/push-repository.ts)
- [`packages/rxdb-plugin-sync/src/sync-branches.ts`](../../../../packages/rxdb-plugin-sync/src/sync-branches.ts)
- [`packages/rxdb-plugin-sync/src/branch-materialization-source.ts`](../../../../packages/rxdb-plugin-sync/src/branch-materialization-source.ts)
- [`packages/rxdb-plugin-sync/src/query-cache-outbox.ts`](../../../../packages/rxdb-plugin-sync/src/query-cache-outbox.ts)
- [`packages/rxdb-plugin-sync/package.json`](../../../../packages/rxdb-plugin-sync/package.json)
- [`packages/rxdb-plugin-sync/project.json`](../../../../packages/rxdb-plugin-sync/project.json)
- [`packages/rxdb-plugin-sync/src/index.ts`](../../../../packages/rxdb-plugin-sync/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

全范围启动批当时尚无新增确认问题；不表示下述续评无问题，也不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 同步状态与重入：画 orchestration 状态机，核查监听、并发启动、取消和网络恢复，不以最后异常为空代表已同步。
- [ ] C2 重试、幂等与冲突：追踪 change id/watermark、push 确认、pull conflict 与重复批次处理。
- [ ] C3 拓扑与级联阻塞：核查 dependency graph、topological sort、祖先拉取和 cascade blocking。
- [ ] C4 分支物化与原子性：核查分页 staging、分支 identity、激活/CAS 屏障和同步 skip reason。
- [ ] C5 QueryCache outbox：核查 count/flush/pending ids 的身份隔离、部分失败和清理条件。
- [ ] C6 保留与清理：追踪 cleanup-expired 对未确认变更、历史和分支引用的保护，并对照现有限制。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-04：恢复编排与 outbox 深审

基线 `8b29b549ac5758b2e31a6148b98b8c394754e918`，详见 [本批台账](../../execution-2026-10-04-sync-querycache.md)。当前仍为**部分执行**，不作全包完成评级。

确认意见：RV-052：自动恢复忽略结构化 failures（已修复，见 README 2026-10-05 清理记录）（P2）。原 outbox 与原监听器/SyncStateHub 实际运行，REST 403/网络失败后水位仍被保护，但错误被清空且宣布成功。不是待推写已经丢失。

| 专项                 | 本轮结论与证据                                                                    | 剩余边界                                                |
| -------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| C1 同步状态与重入    | **部分执行，确认 RV-052**；ready/wakeup、exhaustMap、异常与返回值失败的分流已追踪 | sync/push/pull 重入、关闭中任务、重连与进程重开         |
| C2 重试、幂等与冲突  | **部分执行**；outbox compact/LWW、失败水位路径已读，原测试实际通过                | 丢响应、重复/乱序、多端竞争与生产后端幂等               |
| C3 拓扑与级联阻塞    | **部分执行**；graph/环检测、DELETE 反向排序与 cascade blocker 已读                | 跨批关系、缺父与并行/删除竞争                           |
| C4 分支物化与原子性  | **部分执行**；冻结范围/血缘/过滤、水位分页 resume 与 drift/settle 入口已读        | CAS 落败、真实 staging/crash、分支重建                  |
| C5 QueryCache outbox | **部分执行，确认 RV-052**；真实返回 failures 与恢复成功聚合不一致                 | partial success/repair、新写竞争、branch 切换与身份隔离 |
| C6 保留与清理        | **部分执行**；cleanup 非 dryRun 的候选/未推保护/merge 同事务，未报无条件清理      | 跨分支/水位策略、清理与 push/写竞争的真实后端矩阵       |

原基线 **449 passed、无 skip**；最终整包 **450 passed /2 failed、无 skip**，两个红用例均属于 RV-052：[完整日志](../../evidence/2026-10-04/sync-querycache/final-all-tests.txt) / [JUnit](../../evidence/2026-10-04/sync-querycache/rxdb-plugin-sync-final-junit.xml)。原 449 条仍通过。严格 lint /typecheck 通过，coverage 关闭，没有核销任何完整 C 专项。

[复验 spec](../../../../packages/rxdb-plugin-sync/src/__tests__/review-resume-outbox-result.spec.ts) 不 mock flush；系统仓储与 REST/宿主事件是明确接缝，不代表 SQLite/HTTP/Supabase 服务已实测。业务实现未改，问题仍 Open。

## 2026-10-04：真实 HTTP /文件 SQLite 第六批联审

本轮补真实 metadata 401 的 RV-052；新增 RV-055（已修复，见 README 2026-10-05 清理记录）：旧 KEEP_REMOTE repair 覆盖快照后 B，native SQLite 和公开查询均为 R，B 的日志及 pending=1 仍保留。C1/C5 **部分执行，有确认缺陷**，不将水位正确等同投影正确。restore/drop、多实体、branch 及重试继续。

[本轮实际链路与取证限制](../../execution-2026-10-04-sync-http-sqlite.md) · [完整日志](../../evidence/2026-10-04/sync-http-sqlite/final-full-app-tests.txt) · [提交/wire/队列观测](../../evidence/2026-10-04/sync-http-sqlite/final-observations.json)。六对象严格 lint 通过，新增 app/spec typecheck 通过；coverage 关闭，全部 C 专项和全对象完成度保持未核销。

## 2026-10-05：plugins 并行源码深审与逐 C 交付

**执行状态：partial；评审完成不等于无缺陷，但必要证据缺失不能核销。** 本组不执行 Nx build/test/e2e/coverage/server，动态证据来自主控串行队列。下面覆盖原计划全部 C 编号，不修改原验收口径。

本轮只读了实际登记的源码/测试行区间与若干测试入口；不是全受控文件已经读完。九包 scope 共 **554** 个文件；本组读取范围见 `requirements/reviews/evidence/2026-10-05/parallel/plugins/file-inspection.json`，指纹盘点与阅读分开。当前源判断优先于已删除 RV 的历史状态。

当前 Node：**452 passed /0 failed /0 skip**。日志：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt`；报告按 `rxdb-plugin-sync` 分目录保存。主控 69 项 strict lint/typecheck 已过，但不是全部 spec 类型或后来修订/晚到 probe 已过的证明。

当前 fresh **Node** 四指标（S/B/F/L）：**93.07% / 86.08% / 94.88% / 94.06%**。来源：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-plugin-sync/coverage-summary.json`。tree 的 100% 只涉及 Node 面；browser 合并/宿主 skip 另审。覆盖率达标不自动核销 C。

### 实际逐 C 核销矩阵

| C   | 核销状态       | 当前真实源码锚点（相对本包 src；注明联审者除外）                                              | 不变量、正向与反证                                                                                                                                                                                                              | 已有/本轮测试证据                                                                                                | 必要缺口或核销边界                                                                                             |
| --- | -------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| C1  | partial / 待证 | plugin.ts:55–99；SyncManager.ts:78–94、154–211；sync-listeners.ts:113–145、185–272            | 监听、slot、reachability、outbox bridge 属同一 scope；自动恢复 exhaustMap 抑制同一订阅重入。结构化 failures 逐条 reportError，失败布尔向上聚合，不再把未 throw 当成功（原 RV-052）。卸载摘 listener 不等于在途 Promise 已取消。 | review-resume-outbox-result.spec.ts、SyncManager.orchestration.spec.ts、plugin.spec.ts；当前 452/452 通过。      | push/pull/sync 多入口重入、旧纪元任务迟到、断连/重开与 hub 结算归属仍需实际时序探针。                          |
| C2  | partial / 待证 | push-repository.ts:675–826；pull-batch.ts:162–299；query-cache-outbox.ts:273–354、696–842     | 按 branch 与 repository 水位筛选、compact 后投递；push 抓取 in-flight 上界；pull 聚合后在 local transaction 应用。outbox 对 DELETE/INSERT/UPDATE 有显式 remote 状态分流，失败不无条件推进最大水位。                             | push-protocol、push-pull-protocol.integration、pull-conflict-resolution、query-cache-outbox 入口；当前全套通过。 | 真实服务已写但响应丢失、重复/乱序批次与两端竞争的幂等副作用证明尚缺；不能只用 mock ack 核销。                  |
| C3  | partial / 待证 | topological-sort.ts:33–59、82–130、212–245；cascade-blocking.ts:46–61；pull-batch.ts:223–231  | INSERT/UPDATE 父先，DELETE 反向；tempMarked 显式报环，自依赖跳过；子图只保留候选内边。失败沿依赖方向阻塞，不声称只有最后一个错误为空就能继续。                                                                                  | dependency-graph.spec.ts、topological-sort.spec.ts、pull/bulk-sync 套件；当前全套通过。                          | 跨批缺父、拉取/删除竞争及真实 FK backend 的完整异常回滚矩阵未证明。                                            |
| C4  | partial / 待证 | branch-materialization-source.ts:212–227、254–348；working-tree/materialize-branch.ts:305–392 | 冻结 lineage/syncScope/filter/cutoff；续页按 repository 与 lastId，丢弃 cutoff 之外变化；激活前同 executor 校验漂移、投影并 settle，prepare 缺失显式错误。不能把抓完页等同激活已原子成功。                                      | branch-materialization-source.spec.ts、branch-sync-atomicity.spec.ts；当前全套通过；工作树当前测量面另列。       | 真实续页 crash/CAS 落败/schema 漂移、删除重建同 id 的 ABA 与多宿主激活 barrier 仍待联合验证。                  |
| C5  | partial / 待证 | query-cache-outbox.ts:233–257、295–354、651–692、903–928；sync-listeners.ts:113–145           | 单 rxdb+namespace/entity 合并在途 flush；部分失败水位停在最低未结算 minChangeId 之前；repair 保护快照后新写，确认与本地投影正确性分开。原 RV-052/055 修复路径可见。                                                             | query-cache-outbox.spec.ts、review-resume-outbox-result.spec.ts 及既有 repair 回归；当前全套通过。               | branch 切换/断连跨纪元的 in-flight key 所有权、多实体 repair 与响应丢失后的重新连接未全证；不复报 RV-060/061。 |
| C6  | partial / 待证 | cleanup-expired.ts:148–175、191–219、228–280；push-repository.ts:804–811                      | 真实删除与候选/未推保护在同 transaction；namespace/entity/entityId 识别未确认行，声明 trusted remote_sync 避免用户历史污染；不能反转的 operator 显式拒绝。dryRun 与执行事务区分。                                               | cleanup-expired.spec.ts、既有水位与 push 探针；当前全套通过。                                                    | 跨 branch 保留策略、正在 push/并发新写与清理的真实竞争矩阵未完整跑通，不给保留安全全绿。                       |

### 本组改动与复验责任

仅改本对象计划/执行记录，以及本组 evidence；没有修改业务、依赖或已有测试，没有 Git 暂存/提交/重置，没有嵌套 agent。新增独立 probes 只在 search/replay/storage 自己的 sourceRoot，后续执行均归主控。

最小请求保存在 `requirements/reviews/evidence/2026-10-05/parallel/plugins/validation-requests.json`；候选在同目录 `findings.pending.md`。RV-060/061 不重复登记；RV-059 是其它对象公开接缝，不在本组扩 scope。
