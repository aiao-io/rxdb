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

确认意见：[RV-052：自动恢复忽略结构化 failures](../../RV-052-sync-resume-ignores-outbox-failures.md)（P2）。原 outbox 与原监听器/SyncStateHub 实际运行，REST 403/网络失败后水位仍被保护，但错误被清空且宣布成功。不是待推写已经丢失。

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

本轮补真实 metadata 401 的 RV-052；新增 [RV-055](../../RV-055-outbox-late-repair-overwrites-new-offline-write.md)：旧 KEEP_REMOTE repair 覆盖快照后 B，native SQLite 和公开查询均为 R，B 的日志及 pending=1 仍保留。C1/C5 **部分执行，有确认缺陷**，不将水位正确等同投影正确。restore/drop、多实体、branch 及重试继续。

[本轮实际链路与取证限制](../../execution-2026-10-04-sync-http-sqlite.md) · [完整日志](../../evidence/2026-10-04/sync-http-sqlite/final-full-app-tests.txt) · [提交/wire/队列观测](../../evidence/2026-10-04/sync-http-sqlite/final-observations.json)。六对象严格 lint 通过，新增 app/spec typecheck 通过；coverage 关闭，全部 C 专项和全对象完成度保持未核销。
