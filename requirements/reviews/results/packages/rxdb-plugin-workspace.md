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
- [x] C2 install / ready 状态机（2026-10-05 核销，见当轮矩阵）：检查 IndexedDB 首次载入、未注册实体恢复、失败后的显式重试。
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

## 2026-10-05：plugins 并行源码深审与逐 C 交付

**执行状态：partial；评审完成不等于无缺陷，但必要证据缺失不能核销。** 本组不执行 Nx build/test/e2e/coverage/server，动态证据来自主控串行队列。下面覆盖原计划全部 C 编号，不修改原验收口径。

本轮只读了实际登记的源码/测试行区间与若干测试入口；不是全受控文件已经读完。九包 scope 共 **554** 个文件；本组读取范围见 `requirements/reviews/evidence/2026-10-05/parallel/plugins/file-inspection.json`，指纹盘点与阅读分开。当前源判断优先于已删除 RV 的历史状态。

当前 Node：**100 passed /0 failed /0 skip**。日志：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt`；报告按 `rxdb-plugin-workspace` 分目录保存。主控 69 项 strict lint/typecheck 已过，但不是全部 spec 类型或后来修订/晚到 probe 已过的证明。

当前 fresh **Node** 四指标（S/B/F/L）：**90.92% / 83.26% / 95.45% / 94.64%**。来源：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-plugin-workspace/coverage-summary.json`。tree 的 100% 只涉及 Node 面；browser 合并/宿主 skip 另审。覆盖率达标不自动核销 C。

### 实际逐 C 核销矩阵

| C   | 核销状态            | 当前真实源码锚点（相对本包 src；注明联审者除外）                                                          | 不变量、正向与反证                                                                                                                                                                                                            | 已有/本轮测试证据                                                                                                                                                                             | 必要缺口或核销边界                                                                                                              |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| C1  | partial / 待证      | RxDBPluginWorkspace.ts:49、633–685、751–775；workspace-entry.ts:54–100                                    | 只监听 NEW/CREATE/REMOVE；NEW 与 patches$ 维护活草稿，CREATE 只在无更新的草稿上清理，REMOVE/discard 删除缓存。没有 UPDATE buffer 或 DELETE 撤销承诺，系统实体身份精确排除。                                                   | RxDBPluginWorkspace.spec.ts:280–361；workspace.browser.spec.ts:214–335 等真实 NEW/修改入口；当前 Node 100/100，通过的是现有状态机面。                                                         | 浏览器真实 save(CREATE)、既有实体 UPDATE 不进入草稿与主表不被缓存操作写入的完整当前链路尚需 browser/应用对照；不扩大 NEW 契约。 |
| C2  | closed / 本轮核销   | RxDBPluginWorkspace.ts:323–349、538–631；workspace-store.ts:75–143                                        | 完整 install/ready 状态机：成功重复 install 复用 Promise；失败 ready 仍 reject，仅显式 install 重试；未知 EntityType 保留草稿；回填及 catch/finally 同用 store 身份，旧纪元不得清新删除意图或标新失败；水合失败回滚半份发布。 | 当前 Node 100/100、0 skip。spec.ts:695–769（未知类型/读失败/水合回滚）、841 起（关闭中 ready）、1408–1489（四顺序）；workspace-store.spec.ts 的 open/blocked/close 故障面全部在当前套件通过。 | 本轮按原 C2 的全部最低场景核销；故障注入为 IDB/实体管理接缝，不宣称浏览器跨页或所有平台持久化通过，后者仍归 C4/C5。             |
| C3  | closed / 保留原限定 | RxDBPluginWorkspace.ts:295–308、816–948                                                                   | 保留 10 月 3 日原核销范围。当前重查：clone 逐项预检，可克隆 setMany 后 delMany；失败较新 save/delete 优先；晚批用 store 身份 guard；unclonable 点名 cacheIds，waiter 只在无 pending/queue 结算。                              | 历史限定单元 96/browser20 证据保留；当前 Node 100/100 复过 delete 阶段失败、新值保护、释放中的 waiter 与晚写入。                                                                              | 不把历史 Chromium 证据伪写成今日通过，不扩大到所有平台/长期故障；当前 browser fresh 由主控后补。                                |
| C4  | partial / 待证      | RxDBPluginWorkspace.ts:358–367、457–465、688–730、801–813；workspace-entry.ts:54–100                      | list structuredClone 深隔离；同 dbName channel、clientId 去自回灌；入站 shape/cacheId/data.id 守卫；sync_errors 在成功发送/删除时清。协议没有全序版本，不能凭两个按序消息称多写者乱序已验证。                                 | spec.ts:364–381、973–1002、1226–1305；browser:465–544 是同页两 channel 的正向/坏消息对照。当前 Node 全套过。                                                                                  | 同源真实双页面、不同库隔离、重复/乱序/多写者冲突的所有原最低场景未完全动态取证，C4 不核销。                                     |
| C5  | partial / 待证      | RxDBPluginWorkspace.ts:429–535；workspace-store.ts:58–71、125–158；package.json:28–42；src/index.ts:14–21 | scope 逆序摘事件/task pump/channel/store；保留实例级 changes$ 而不 complete，重装获得新纪元；IDB versionchange close 后忘记连接可重开；exports 与入口类型核对。构造只发布身份，不偷取资源。                                   | 当前 Node 100/100；browser:389–459、550 起真实重开/versionchange/写失败入口已读，主控 browser 尚待。                                                                                          | 当前真实 Chromium 刷新/重开和 close/reinstall 完整日志及发布消费仍缺；无法打开 IDB 的单元拒绝已证，不代替真实浏览器持久化证明。 |

### 本组改动与复验责任

仅改本对象计划/执行记录，以及本组 evidence；没有修改业务、依赖或已有测试，没有 Git 暂存/提交/重置，没有嵌套 agent。新增独立 probes 只在 search/replay/storage 自己的 sourceRoot，后续执行均归主控。

最小请求保存在 `requirements/reviews/evidence/2026-10-05/parallel/plugins/validation-requests.json`；候选在同目录 `findings.pending.md`。RV-060/061 不重复登记；RV-059 是其它对象公开接缝，不在本组扩 scope。
