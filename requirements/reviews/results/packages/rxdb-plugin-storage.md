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

当前确认意见：[RV-043](../../RV-043-storage-fetch-response-body-leak.md)、[RV-044](../../RV-044-desktop-logical-path-alias-data-overwrite.md)；全对象仍未审完。

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

### C2：真实磁盘路径别名覆盖数据

🔴 **P1** [RV-044](../../RV-044-desktop-logical-path-alias-data-overwrite.md)：大小写与 NFC/NFD 两组不同逻辑名在本机原生卷共享文件。真实 RxDB / SQLite / Electron file host / 磁盘复验中，两条 metadata 对应一个文件，第一个 ID 也读到第二次上传内容。2 failed / 1 正常命名对照：[日志](../../evidence/2026-10-04/storage-native-path-alias.txt)。没有用假 metadata 或假 filesystem。

### C3：响应体的早期拒绝没有归属

🔴 [RV-043](../../RV-043-storage-fetch-response-body-leak.md)：真实 Node HTTP server 持续发数据，status/MIME 校验拒绝后未主动 cancel body，storage.destroy 完成后仍在下载。最终观测保留原始 Response 引用、网络仍是原生 fetch：2 failed / 1 对照。[日志](../../evidence/2026-10-04/storage-fetch-retained-response.txt)。未保留引用初版的不同测量结果同样保留，不混算、不宣称所有运行时必然无限下载。

### C1/C2/C3 已核查的补偿对照

沿 upload→rollback snapshot→metadata create/update→discard，以及 delete 的 metadata 删除→文件删除失败补回，阅读 storage.ops / service / rename-copy、路径校验与锁。六个既有文件共 **137 passed**：[日志](../../evidence/2026-10-04/storage-compensation-controls.txt)。这包括文件/metadata 写失败、显式重试、同路径并发、URL 清理、配额与名字编码的局部对照，不覆盖上述新场景，也不等于双存储已经原子。

C1/C2/C3 仍部分执行。浏览器完整场景、其它原生卷/OS、Tauri/Rust 与 GUI/IPC、rename/copy 的别名并发待补证。未修改业务实现。
