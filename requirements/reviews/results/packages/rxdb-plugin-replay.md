---
kind: review-execution
object: rxdb-plugin-replay
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-replay：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

显式启动的 rrweb 会话录制、独立录制库、回放时间轴及 working-tree commit 恢复联动。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-replay/src/manager.ts`](../../../../packages/rxdb-plugin-replay/src/manager.ts)
- [`packages/rxdb-plugin-replay/src/recorder.ts`](../../../../packages/rxdb-plugin-replay/src/recorder.ts)
- [`packages/rxdb-plugin-replay/src/store.ts`](../../../../packages/rxdb-plugin-replay/src/store.ts)
- [`packages/rxdb-plugin-replay/src/restore.ts`](../../../../packages/rxdb-plugin-replay/src/restore.ts)
- [`packages/rxdb-plugin-replay/src/resume.ts`](../../../../packages/rxdb-plugin-replay/src/resume.ts)
- [`packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts`](../../../../packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts)
- [`packages/rxdb-plugin-replay/package.json`](../../../../packages/rxdb-plugin-replay/package.json)
- [`packages/rxdb-plugin-replay/project.json`](../../../../packages/rxdb-plugin-replay/project.json)
- [`packages/rxdb-plugin-replay/src/index.ts`](../../../../packages/rxdb-plugin-replay/src/index.ts)

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

- [x] C1 录制同意与隐私（包级契约，应用授权不适用边界见本批）：核查默认不录、显式开始/停止、脱敏配置与持久化内容，确认不是仅 UI 隐藏记录。
- [ ] C2 录制库隔离与配额：追踪独立库、写队列、chunk/时间戳、清理与限额；不能污染业务 DB。
- [ ] C3 时间轴与 commit marker：审查 marker 的分支/commit 身份和回放顺序，不把时间近似当作同一提交。
- [ ] C4 恢复 / resume 状态机：追踪回放点击到 working-tree restore 的拒绝/成功，确保不偷偷移动 HEAD。
- [ ] C5 动态 rrweb 与卸载：检查精确版本资源、懒加载、mount/unmount、错误恢复与三端 parity suite。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

四指标合并后已通过 80% 门禁，见 [合并门禁](../../evidence/2026-10-03/full-run/merged-coverage-gate.txt)；不代表全部 C 项完成。

## 2026-10-04：第二批实际深审

### C1：包级默认录制、同意与脱敏契约核销

🟢 **限定本包提供的契约**：首次无 stash 安装默认不录；start 是显式入口，合法 recording stash 的恢复是延续此前会话；stop 停 rrweb 并冲刷；默认 maskAllInputs=true、强制 blockSelector 与显式 selector 透传。人工检查 options / plugin / manager / recorder / store / resume 的调用与持久化链路。

- options / manager / recorder 三文件 **45 passed**：[日志](../../evidence/2026-10-04/replay-consent-lifecycle-controls.txt)。门面与录制库用真实 PGlite memory，Node 的 rrweb 为测试替身，用于无 DOM/默认不录/start-stop/失败/并发等状态对照。
- 真实 Chromium / rrweb 的 masking 四例＋新增两例 **6 passed**：[最终日志](../../evidence/2026-10-04/replay-consent-final.txt)。新增 [真实持久化 spec](../../../../packages/rxdb-plugin-replay/src/__tests__/review-persisted-consent.browser.spec.ts) 实际读取 PGlite 的 ReplayEventRecord.data，不只断言 UI/假 sink：默认输入原文不在记录中，stop 后新输入不增加事件；显式关闭 maskAllInputs 的反证能在同一数据库链路看到原文。
- 新引入 PGlite browser 依赖首次发现触发 Vite reload、0 tests；记录没有删除。补浏览器测试专用 optimizeDeps include 后，用独立新缓存目录从冷状态验证 **6 passed**，没有 reloaded 诊断：[冷缓存状态](../../evidence/2026-10-04/replay-consent-cold-cache-status.json)。只修改测试配置，不改变生产 API；临时配置/缓存已删除，未删除既有缓存。

**C1 的“未授权页面”子场景对包本身不适用：**公开选项没有页面身份/角色授权输入，是否允许调用 start 必须由应用控制。对应应用授权/同意 UI 仍需要 apps 独立补证，不能由此宣布通过。maskAllInputs 也不承诺任意正文/URL 自动脱敏；内容屏蔽依赖明确的 block/mask selectors，允许显式 maskAllInputs:false 不算默认策略失败。

C1 按现有包级契约/上述不适用边界核销；C2 配额与全录制库隔离、C3 marker、C4 恢复、C5 全卸载/三端矩阵未整体完成。本轮没有验证永久磁盘恢复或重开录像。
