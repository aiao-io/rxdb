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

## 2026-10-05：plugins 并行源码深审与逐 C 交付

**执行状态：partial；评审完成不等于无缺陷，但必要证据缺失不能核销。** 本组不执行 Nx build/test/e2e/coverage/server，动态证据来自主控串行队列。下面覆盖原计划全部 C 编号，不修改原验收口径。

本轮只读了实际登记的源码/测试行区间与若干测试入口；不是全受控文件已经读完。九包 scope 共 **554** 个文件；本组读取范围见 `requirements/reviews/evidence/2026-10-05/parallel/plugins/file-inspection.json`，指纹盘点与阅读分开。当前源判断优先于已删除 RV 的历史状态。

当前 Node：**147 passed /2 failed /1 skip（两红为已修订的本组误用）**。日志：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt`；报告按 `rxdb-plugin-replay` 分目录保存。主控 69 项 strict lint/typecheck 已过，但不是全部 spec 类型或后来修订/晚到 probe 已过的证明。

本批红 suite **没有新的 coverage summary**；不读取旧 coverage 目录冒充 fresh。后续 focused/late probe 与 browser 由主控续跑。

### 实际逐 C 核销矩阵

| C   | 核销状态            | 当前真实源码锚点（相对本包 src；注明联审者除外）                                                                        | 不变量、正向与反证                                                                                                                                                                                                | 已有/本轮测试证据                                                                                                                                                                                    | 必要缺口或核销边界                                                                                                                            |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | closed / 保留原限定 | options.ts:79–88；manager.ts:118–134、216–244；recorder.ts:82–100、111–141                                              | 保留历史包级同意/脱敏核销：首次无 stash 默认不录，start 显式、stop 停采集并冲刷；maskAllInputs 默认 true 与强制 blockSelector。合法 recording stash 是延续原会话，不是首次自动授权。                              | 历史真实 rrweb/PGlite consent browser 6 passed 原范围保留；当前原 Node147 passed（整包另有本组误用测试两红），options/manager/recorder 正向仍过。                                                    | 应用页面授权对包不适用，必须 apps 自行审；任意正文/URL 不承诺自动脱敏。今日 masking/browser 尚未回收，不冒充 fresh。                          |
| C2  | partial / 待证      | store.ts:103–159、236–301、316–347；recorder.ts:125–178；manager.ts:281–315                                             | 独立工厂懒开 recording DB；事件+计数同 transaction；seq主键拒重复；单 in-flight 队列，stop drain 后标 stopped；session/store bytes 满写 truncated marker并停，不自动删会话。stash 以已写 nextSeq 去重，失败可见。 | store/limits/recorder/resume/manager 当前原用例通过；resume 与 manager 用真实 PGlite 临时磁盘重开，rrweb/page为接缝。store.bench 1 skip 如实保留。                                                   | 全录制库与业务库字节隔离/长会话压力、不同持久化宿主配额/失败矩阵没有全部证明；临时文件 PGlite 不等于浏览器永久存储或所有 factory 都自动隔离。 |
| C3  | partial / 待证      | markers.ts:27–31、65–73；store.ts:194–228；manager.ts:158–164、228–230；replayer/mount-replayer.ts:232–262              | marker 带 commitId/branchId，存储按 seq排序，不以 timestamp近似合并；malformed 自有 marker显式报错；恢复仍走当前 branch status 与 workingTree reachability，UI generation只阻止迟到画面。                         | commit-markers.spec.ts:72–110 有真实 PGlite commit链；markers/store/resume gap用例当前原套件通过。                                                                                                   | 跨分支、同 timestamp 多 marker、丢事件/不可达 commit 的完整实际录制→点击→恢复链路未全齐，不能由 marker字段存在核销。                          |
| C4  | partial / 待证      | restore.ts:41–56；manager.ts:187–200、265–295；replayer/mount-replayer.ts:249–262；working-tree/restore-command.ts:1–34 | 先 status 捕获 activation/head/workingTree revisions，再 restore；不偷偷移动 HEAD。resume 与 restore不同状态机；UI卸载只屏蔽迟到展示，没有取消数据库 restore 的公开能力，不假造 cancel API。                      | 原 restore.spec.ts 8例是 fakeDb，不代表真实CAS。新增 review-parallel-restore.spec.ts 首轮两红系本组误当checkout、误用无参数disconnect；已改目标实体内容重放与disconnectAll，旧日志保存，待精确复跑。 | 修订实测未回；dirty/CAS竞争、恢复中断/重试、断连的全真实矩阵仍不足。首轮误用不登记产品缺陷，也不改业务去迁就断言。                            |
| C5  | partial / 待证      | manager.ts:29、197–244；plugin.ts:48–64；replayer/mount-replayer.ts:164–194、249–288                                    | record/replayer动态import，epoch release先stop再destroy录制库；view reload/destroy 推 generation，销毁rrweb实例并 cancel RAF；迟到加载与restore结果不回写已卸载UI。                                               | replayer-parity.spec.ts/recorder/manager当前原用例通过；replayer.browser.spec.ts真实 rrweb 及三 wrappers parity由主控其它对象联审。                                                                  | 加载失败/重复mount-unmount完整浏览器＋三端用户序列、精确版本资源冷加载与停止后无残留的全部原最低场景仍需fresh证据。                           |

### 本组改动与复验责任

仅改本对象计划/执行记录，以及本组 evidence；没有修改业务、依赖或已有测试，没有 Git 暂存/提交/重置，没有嵌套 agent。新增独立 probes 只在 search/replay/storage 自己的 sourceRoot，后续执行均归主控。

最小请求保存在 `requirements/reviews/evidence/2026-10-05/parallel/plugins/validation-requests.json`；候选在同目录 `findings.pending.md`。RV-060/061 不重复登记；RV-059 是其它对象公开接缝，不在本组扩 scope。
