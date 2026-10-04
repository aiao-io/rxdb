---
kind: review-execution
created: 2026-10-04
updated: 2026-10-04
baseline: b01e35e9aedc58e61fb02a909ec98b4a119e82a2
execution: in-progress
---

# 2026-10-04：继续实际深审

本批新增 **3 份确认意见：1 P1 / 2 P2**，更新 7 个对象的独立执行记录。不是重做计划，不把测试存在或门禁通过算成全源码深审。

全范围仍是 **50 个有效包 +19 个应用 +1 个 desktop 残留对象**；70 个均已启动，**0 个全对象深审完成**。这批核销 replay 的包级 C1，连同上批 workspace C3，共 2 个明确专题已核销；其余专题保持逐项处理。

导航：[总计划](deep-review-plan.md) · [上批执行台账](execution-2026-10-03.md) · [本批证据](evidence/2026-10-04/)。

## 1. 新增确认意见

| 意见                                                               | 对象                    | 已复现结果                                                                              | 测量边界                                                                     |
| ------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [RV-042 / P2](RV-042-workspace-install-epoch-settlement.md)        | workspace               | 旧 install 回调清掉新删除意图、或污染新安装失败标记；新四例 2 failed / 2 passed         | 实际插件/LifecycleScope，IDB/event 接缝；未外推主表或真实 IDB 重开           |
| [RV-043 / P2](RV-043-storage-fetch-response-body-leak.md)          | storage                 | 状态/MIME 早期拒绝后响应体未取消；storage 销毁后仍下载；2 failed / 1 passed             | 原生 Node fetch + 真实 HTTP；保留原 Response 观测引用，文件/metadata 夹具    |
| [RV-044 / P1](RV-044-desktop-logical-path-alias-data-overwrite.md) | storage + Electron host | case / NFC-NFD 别名形成两条 metadata、一份文件，旧 ID 内容也被覆盖；2 failed / 1 passed | 实际 RxDB、node:sqlite、Electron host、当前本机卷；非 GUI/IPC，不外推所有 OS |

全部 Open，失败复验保留。业务实现没有修改；只补测试、文档、证据及新浏览器 probe 所需的**测试专用**依赖预优化配置。

## 2. 七个对象的实际专题

| 对象                                                          | 本轮源码路径 / 专题                                                           | 结论                                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [workspace](results/packages/rxdb-plugin-workspace.md)        | install→release→restore 的纪元身份、catch/finally 与删除意图                  | 确认 RV-042，C2 部分核查；上轮 C3 局部通过不覆盖该组合链                         |
| [storage](results/packages/rxdb-plugin-storage.md)            | upload/metadata/rollback、HTTP body 归属、logical/physical path、锁、URL 清理 | 确认 RV-043 / RV-044；既有六文件 137 passed 不覆盖新边界                         |
| [Electron adapter](results/packages/rxdb-adapter-electron.md) | 原生 SQLite + 文件 host 的直连组合、根内路径与逻辑别名                        | 文件不越根，但不同逻辑 ID 共享原生对象；统一归 RV-044，不另报 RCE                |
| [sqlite-core](results/packages/rxdb-adapter-sqlite-core.md)   | archive/schema/blank target/marker/transaction/rollback/wipe/lock             | 未发现本专题新增问题；117 passed / 21 skipped，memdb 页内“持久化”不等于磁盘恢复  |
| [PGlite](results/packages/rxdb-adapter-pglite.md)             | restore 独占、未提交禁止 sync、引擎/schema/codec 校验、失败清理               | 四文件 50 passed；不是完整加密/强杀/桌面矩阵                                     |
| [replay](results/packages/rxdb-plugin-replay.md)              | 首次不录/start-stop、options 脱敏、真实 DOM→rrweb→PGlite 事件数据             | 包级 C1 核销；45 单元 / 6 浏览器通过，应用授权与全文/URL 隐私不在此通过主张      |
| [Angular 应用](results/apps/dev-rxdb-angular.md)              | TestBed 观测与原配置复跑                                                      | 两组诊断及原配置均 333 passed，没有观察到候选 marker/platform 脱节；根因仍未确认 |

## 3. 运行证据不能混用

### 备份恢复

- SQLite **117 passed / 21 skipped**：[日志](evidence/2026-10-04/sqlite-backup-boundaries.txt)。实际官方 SQLite-WASM / Chromium；memdb 同页面保活，强杀/跨进程等不适用项跳过，不能算通过。
- PGlite **50 passed**：[日志](evidence/2026-10-04/pglite-backup-boundaries.txt)。实际 Chromium/PGlite 的 memory + IDB 路径，覆盖失败/取消/非空/忙/竞争/清理；完整实体加密与所有宿主仍未审完。
- storage 既有补偿/锁/URL/命名六文件 **137 passed**：[日志](evidence/2026-10-04/storage-compensation-controls.txt)。不能因局部成功声称 DB/filesystem 跨存储原子。

### 回放同意与真实写入

- Node 状态/选项/recorder 对照 **45 passed**：[日志](evidence/2026-10-04/replay-consent-lifecycle-controls.txt)。门面/录制库是真 PGlite，rrweb 是状态测试替身。
- 真 Chromium/rrweb masking + 新增实际 ReplayEventRecord.data 检查 **6 passed**：[日志](evidence/2026-10-04/replay-consent-final.txt)。stop 后输入不加事件；显式 maskAllInputs:false 的反证能在同一真实存储看到输入。
- 新 browser probe 首次 **0 tests / collection failed**：[日志](evidence/2026-10-04/replay-persisted-consent.txt)。迟发现 PGlite 三个入口导致 Vite reload；不记为产品断言失败，更不隐藏记录。
- 为本次新 probe 补 **仅 isBrowserTest 分支**的 optimizeDeps.include，保持生产入口/API 不变。临时配置指向自己新建的空缓存目录验证冷状态 **6 passed**：[日志](evidence/2026-10-04/replay-consent-cold-cache.txt) / [状态](evidence/2026-10-04/replay-consent-cold-cache-status.json)。没有删除既有缓存；临时配置与自己缓存已清理。不能只用热缓存绿交付一个冷启动收集失败的测试。

### TestBed

两个临时诊断各 41 文件 /333 passed，各有 41 次 setup 前 marker=false/platform=false，0 个 marker=true/platform=false。[分析](evidence/2026-10-04/angular-testbed-trace-analysis.json)。候选 reset 条件没有触发，故不能归因为已证实的 marker 修法。

移除临时源码后原配置 **333 passed**：[日志](evidence/2026-10-04/angular-original-after-observer.txt)。原 setup SHA 不变；诊断 import 顺序/模块图与原 setup 有差异，不当作修复因果证明。历史失败保留为未归因，没有改缩略图业务。

## 4. 代码与门禁纪律

- 没有修改业务实现、没有提交、没有改暂存区。
- negative probes 保持红：workspace 2、新 HTTP 2、native alias 2；不是排除失败换绿。
- 最初新 replay spec 有一处 unused variable 和两处缺少必填 where 的类型错误，已修测试本身；初始红日志留存，不把它们报成产品问题。
- 本批均禁 Nx 远端/本地缓存，串行/maxWorkers=1；跨包 testing 产物按实际来源核查。本轮关闭 coverage，不使用旧 coverage summary 验收新改动。
- 严格 lint/typecheck 与最终格式/链接/源码范围证据以本目录的 final-* 状态核销，不由正文预先假定。

## 5. 后续仍需要执行

1. workspace 的真实 IDB 重开/connect 同竞态；storage 别名的目录/rename/copy/并发和其它卷/OS/宿主。
2. caller 页面权限/同意 UI、全部 replay 恢复/配额/三框架卸载；C1 本包授权子场景不适用不等于 apps 授权已通过。
3. 真正磁盘/OPFS/目录的强杀恢复与整个备份矩阵，所有非核心包覆盖率；已知查询/生命周期/公开 commit 红测试仍 Open。
4. 按 70 对象索引继续其它 C 项，不把本批 3 个问题和部分对照包装成全仓评审完成。

## 本批最终核销

- 三个修改测试的项目严格零警告 lint / typecheck 均通过：[lint](evidence/2026-10-04/quality-final-lint.txt) / [typecheck](evidence/2026-10-04/quality-final-typecheck.txt)。
- workspace 单文件仍 2 failed /80 passed；两个 storage 负向文件合跑仍 4 failed /2 passed，失败不是被删掉：[workspace](evidence/2026-10-04/negative-workspace-final.txt) / [storage](evidence/2026-10-04/negative-storage-final.txt)。
- [本批状态汇总](evidence/2026-10-04/round-results.json) · [输入版本/源码摘要](evidence/2026-10-04/runtime-and-sources.json) · [可交付日志摘要](evidence/2026-10-04/evidence-digests.json)。

运行期间用户提交了已有文档/评审测试；对起始基线到最终 HEAD 的差异检查未发现业务实现变更，本工具没有提交、改索引或回滚用户提交。每个历史日志保持其实际运行面，完整对象仍 0 个完成。
