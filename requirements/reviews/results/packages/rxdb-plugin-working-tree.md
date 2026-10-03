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

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

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
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.log)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.log) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.log)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.log)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

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
