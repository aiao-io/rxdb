---
kind: review-execution
object: rxdb-plugin-workspace
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-workspace：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

未入库 NEW 实体草稿的内存/IndexedDB 恢复与同源广播；不是 working tree。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts`](../../../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts)
- [`packages/rxdb-plugin-workspace/src/workspace-entry.ts`](../../../../packages/rxdb-plugin-workspace/src/workspace-entry.ts)
- [`packages/rxdb-plugin-workspace/src/workspace-store.ts`](../../../../packages/rxdb-plugin-workspace/src/workspace-store.ts)
- [`packages/rxdb-plugin-workspace/src/index.ts`](../../../../packages/rxdb-plugin-workspace/src/index.ts)
- [`packages/rxdb-plugin-workspace/package.json`](../../../../packages/rxdb-plugin-workspace/package.json)
- [`packages/rxdb-plugin-workspace/project.json`](../../../../packages/rxdb-plugin-workspace/project.json)

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

- [ ] C1 NEW 草稿边界：对照 README 与事件监听，核查仅 NEW 草稿、不承诺 UPDATE buffer/DELETE 撤销的语义。
- [ ] C2 install / ready 状态机：检查 IndexedDB 首次载入、未注册实体恢复、失败后的显式重试。
- [x] C3 flush 写屏障（本批限定测量面核销）：审查待写/待删集合、失败后恢复与 WorkspaceFlushError 点名。
- [ ] C4 快照与跨标签页：核查 structuredClone、BroadcastChannel 身份、重复/乱序与同步错误清理。
- [ ] C5 生命周期与持久化证明：检查 listener/IDB/broadcast 销毁与 package 子入口，不用内存测试代替重开恢复。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 续执行：2026-10-03 边界取证

### C3：flush 写屏障核查完成（限定本轮测量面）

🟢 本专题未发现新增缺陷。人工核查 pending/待写/待删快照、逐条 structuredClone 隔离、setMany→delMany 两阶段、失败恢复时较新队列优先、store 身份检查与 flush waiter 结算：源码锚点 [RxDBPluginWorkspace.ts](../../../../packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts) 第 295–308、493–524、805–938 行。

补入 [两个删除阶段失败/并发新值回归](../../../../packages/rxdb-plugin-workspace/src/__tests__/RxDBPluginWorkspace.spec.ts)，确认 setMany 已成功而 delMany 失败时不丢合法草稿，显式重试能完成删除，旧批次不会覆盖新排队值。

- 单元项目 **96 passed**：[日志](../../evidence/2026-10-03/follow-up/workspace-unit.txt)，IDB 故障注入使用测试替身。
- 真实 Chromium / IndexedDB 项目 **20 passed**：[日志](../../evidence/2026-10-03/follow-up/workspace-browser.txt)，覆盖刷新/重开、不可克隆隔离、失败字段修复、关闭中的 flush 和 IDB versionchange。

C3 的规定边界本批已核销；不等于 C2 install 失败/重装竞态、C4 所有跨页乱序、C5 全平台生命周期均已审完。未测所有浏览器、长时间故障或整个对象覆盖率，本轮 coverage 显式关闭。

## 2026-10-04：第二批实际深审

### C2：确认旧安装结算跨纪元污染

🟢 RV-042（已修复，记录已删除）：install catch/finally、releaseEpochState 与 restoreEntries 身份检查不一致——缓存回填有 store guard，结算回调却不检查自己是否属于当前安装；新恢复的删除意图可被旧 finally 清掉，旧 catch 又可把成功的新安装标成失败。修法：`install()` 在调用 `#restoreEntries()` 前捕获当次纪元的 `#indexedDBStore` 引用，catch/finally 结算时先比对该引用与当前 `#indexedDBStore`，不属于当前纪元则只让旧 Promise 按自己的结果结算给旧调用方，不再写 `#installFailed` / `#restoring` / `#restore_delete_intents`。

[现有单元套件追加四种顺序复验](../../../../packages/rxdb-plugin-workspace/src/__tests__/RxDBPluginWorkspace.spec.ts)：修复后 82 passed（新增 4 例全绿）。

上轮 C3 flush 的限定通过与本次 C2 修复一并成立；C4 全部跨页乱序、C5 全平台生命周期、真实 IDB / connect 同场景复验仍待补证，本对象仍未审完。
