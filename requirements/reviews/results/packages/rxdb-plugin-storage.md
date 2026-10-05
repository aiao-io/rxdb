---
kind: review-execution
object: rxdb-plugin-storage
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-plugin-storage：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

文件 metadata 与物理文件的双存储协作，含 OPFS、桌面 filesystem 与 DevTools provider。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-plugin-storage/src/storage.service.ts`](../../../../packages/rxdb-plugin-storage/src/storage.service.ts)
- [`packages/rxdb-plugin-storage/src/storage.ops.ts`](../../../../packages/rxdb-plugin-storage/src/storage.ops.ts)
- [`packages/rxdb-plugin-storage/src/storage.rename-copy.ts`](../../../../packages/rxdb-plugin-storage/src/storage.rename-copy.ts)
- [`packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts`](../../../../packages/rxdb-plugin-storage/src/filesystem/opfs-filesystem.ts)
- [`packages/rxdb-plugin-storage/src/filesystem/physical-name.ts`](../../../../packages/rxdb-plugin-storage/src/filesystem/physical-name.ts)
- [`packages/rxdb-plugin-storage/src/devtools-desktop-filesystem.ts`](../../../../packages/rxdb-plugin-storage/src/devtools-desktop-filesystem.ts)
- [`packages/rxdb-plugin-storage/package.json`](../../../../packages/rxdb-plugin-storage/package.json)
- [`packages/rxdb-plugin-storage/project.json`](../../../../packages/rxdb-plugin-storage/project.json)
- [`packages/rxdb-plugin-storage/src/index.ts`](../../../../packages/rxdb-plugin-storage/src/index.ts)

| target         | 当前证据                      | 日志                                                            |
| -------------- | ----------------------------- | --------------------------------------------------------------- |
| `lint`         | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)         |
| `typecheck`    | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt)    |
| `test`         | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)         |
| `build`        | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)        |
| `test-browser` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test-browser.txt) |

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 双存储一致性：画 metadata DB 与 filesystem 的写入/删除/拷贝顺序，核查真实失败窗口和明确的补偿边界。
- [ ] C2 路径、命名与锁：审查 logical/physical path、canonicalization、path-lock 和并发 rename/copy。
- [ ] C3 资源与配额：检查流式读写、配额失败、object URL 和大文件的内存/取消边界。
- [ ] C4 OPFS / desktop parity：按 backend-parity suite 核对各 filesystem 的支持边界，联审 Electron/Tauri file host。
- [ ] C5 备份与 DevTools：核查 database-backup-scope、桌面快照与 mutation provider 的权限和大小限制。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

四指标合并后已通过 80% 门禁，见 [合并门禁](../../evidence/2026-10-03/full-run/merged-coverage-gate.txt)；不代表全部 C 项完成。

## 2026-10-04：第二批实际深审

### C1/C2/C3 已核查的补偿对照

沿 upload→rollback snapshot→metadata create/update→discard，以及 delete 的 metadata 删除→文件删除失败补回，阅读 storage.ops / service / rename-copy、路径校验与锁。六个既有文件共 **137 passed**：[日志](../../evidence/2026-10-04/storage-compensation-controls.txt)。这包括文件/metadata 写失败、显式重试、同路径并发、URL 清理、配额与名字编码的局部对照，不覆盖上述新场景，也不等于双存储已经原子。

C1/C2/C3 仍部分执行。浏览器完整场景、其它原生卷/OS、Tauri/Rust 与 GUI/IPC、rename/copy 的别名并发待补证。未修改业务实现。

## 2026-10-05：plugins 并行源码深审与逐 C 交付

**执行状态：partial；评审完成不等于无缺陷，但必要证据缺失不能核销。** 本组不执行 Nx build/test/e2e/coverage/server，动态证据来自主控串行队列。下面覆盖原计划全部 C 编号，不修改原验收口径。

本轮只读了实际登记的源码/测试行区间与若干测试入口；不是全受控文件已经读完。九包 scope 共 **554** 个文件；本组读取范围见 `requirements/reviews/evidence/2026-10-05/parallel/plugins/file-inspection.json`，指纹盘点与阅读分开。当前源判断优先于已删除 RV 的历史状态。

当前 Node：**267 passed /0 failed /0 skip（不含晚到新 probe）**。日志：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt`；报告按 `rxdb-plugin-storage` 分目录保存。主控 69 项 strict lint/typecheck 已过，但不是全部 spec 类型或后来修订/晚到 probe 已过的证明。

当前 fresh **Node** 四指标（S/B/F/L）：**93.4% / 86.23% / 95.59% / 94.69%**。来源：`requirements/reviews/evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage/rxdb-plugin-storage/coverage-summary.json`。tree 的 100% 只涉及 Node 面；browser 合并/宿主 skip 另审。覆盖率达标不自动核销 C。

### 实际逐 C 核销矩阵

| C   | 核销状态                     | 当前真实源码锚点（相对本包 src；注明联审者除外）                                                         | 不变量、正向与反证                                                                                                                                                                                     | 已有/本轮测试证据                                                                                                                               | 必要缺口或核销边界                                                                                                 |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| C1  | partial / 待证               | storage.ops.ts:123–164、254–321、385–440；storage.rename-copy.ts:93–123                                  | upload/fetch 先快照文件，再写文件/metadata，失败补偿原文件；delete 先删 metadata，文件失败重建 metadata；rename journal 按已完成阶段补偿。两存储不是同事务，补偿失败必须可见。                         | 既有 storage.service/desktop-failure/backend-parity 回归；当前旧测量面 267/267。历史137只作历史，不替代当前。                                   | 取消/重复请求、rename/copy 全部补偿失败窗口、真实 quota/crash 的矩阵未完整证明；不能声称跨存储原子。               |
| C2  | partial / 待证               | paths.ts:20–52、60–94、121–158；path-lock.ts:82–134、137–169；storage.ops.ts:338–381                     | 拒绝 ..、反斜线、NUL、内部空段，逻辑目录规范化；锁去重排序并 gate exclusive，错误 tail 仍可释放；大小写/NFC alias 单独保存避免覆盖。跨标签锁有 backend/web-lock 条件边界。                             | path-lock/physical-name/review-desktop-path-alias、backend parity 入口；当前 Node 全套通过。                                                    | 不同 OS/卷大小写与 Unicode alias、递归 copy/rename 同源/同目标并发的全真实宿主矩阵未完成，历史 RV-044 不重复造号。 |
| C3  | partial / 已分流候选、仍待证 | storage.ops.ts:176–208；storage.service.ts:329–346、648–685；object-url.ts:43–68                         | 流写失败 cancel/abort；destroy 等 activeWrites 并 clear URL，但 preview/createObjectUrl 的只读 await 完成后不再核验 lifecycle。已发现销毁后重新登记 URL 的候选，先与历史 RV-043 去重，不能宣称已修复。 | 当前旧测量面267/267不含新晚到 probe；新增 review-parallel-preview-lifecycle.spec.ts 两负向＋正常回收正向，未运行。                              | 候选待主控 late probe/去重；QuotaExceeded、部分流/reader句柄、零字节/超大文件与卸载全验收仍不足。                  |
| C4  | partial / 待证               | filesystem/opfs-filesystem.ts:224–240；desktop.ts:157–238；plugin.ts:44–77                               | OPFS 错误 kind 不隐藏；desktop response kind 有协议边界；service 的 root/filesystem 注入与 scoped 销毁分开，不能把内存 handle 对照称 Electron/Tauri 文件宿主实测。                                     | storage-backend-parity.suite.ts、backend-parity.spec.ts、desktop-filesystem.spec.ts、storage.browser.spec.ts；当前 Node 267/267，browser 后跑。 | 真实 OPFS 重开/平台拒绝以及 Electron/Tauri 重启持久化、IPC/GUI 对称证据尚缺。                                      |
| C5  | partial / 待证               | devtools-desktop-snapshot.ts:104–138；devtools-desktop-filesystem.ts:159–220；storage.service.ts:639–640 | snapshot 在 runExclusive barrier 下采 metadata/file、带 changeEpoch，AbortSignal 明确短路；desktop 按 sessionId/path/chunk 上限发送，writer有 commit/discard。备份 DB 与文件的边界分开。               | database-backup-scope、devtools-desktop-snapshot、devtools-desktop-filesystem 入口；当前 Node 全套通过。                                        | provider 权限、批操作真实失败/越界与敏感文件默认不可暴露的应用配置/宿主联审未全面完成。                            |

### 本组改动与复验责任

仅改本对象计划/执行记录，以及本组 evidence；没有修改业务、依赖或已有测试，没有 Git 暂存/提交/重置，没有嵌套 agent。新增独立 probes 只在 search/replay/storage 自己的 sourceRoot，后续执行均归主控。

最小请求保存在 `requirements/reviews/evidence/2026-10-05/parallel/plugins/validation-requests.json`；候选在同目录 `findings.pending.md`。RV-060/061 不重复登记；RV-059 是其它对象公开接缝，不在本组扩 scope。
