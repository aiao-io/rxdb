---
kind: review-execution
object: rxdb-adapter-electron
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-adapter-electron：实际评审执行记录

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

Electron 桌面 SQLite 与 PGlite adapter/host；两种后端的锁与多窗口语义分别核查。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts`](../../../../packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts)
- [`packages/rxdb-adapter-electron/src/electron-sqlite-host.ts`](../../../../packages/rxdb-adapter-electron/src/electron-sqlite-host.ts)
- [`packages/rxdb-adapter-electron/src/electron-file-host.ts`](../../../../packages/rxdb-adapter-electron/src/electron-file-host.ts)
- [`packages/rxdb-adapter-electron/src/node-sqlite-engine.ts`](../../../../packages/rxdb-adapter-electron/src/node-sqlite-engine.ts)
- [`packages/rxdb-adapter-electron/src/pglite/RxDBAdapterElectronPGlite.ts`](../../../../packages/rxdb-adapter-electron/src/pglite/RxDBAdapterElectronPGlite.ts)
- [`packages/rxdb-adapter-electron/src/pglite-host/pglite-host-lock.ts`](../../../../packages/rxdb-adapter-electron/src/pglite-host/pglite-host-lock.ts)
- [`packages/rxdb-adapter-electron/package.json`](../../../../packages/rxdb-adapter-electron/package.json)
- [`packages/rxdb-adapter-electron/project.json`](../../../../packages/rxdb-adapter-electron/project.json)
- [`packages/rxdb-adapter-electron/src/index.ts`](../../../../packages/rxdb-adapter-electron/src/index.ts)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 renderer / host 边界：逐个对照 sqlite-core 协议、TS host 和应用 preload；请求必须归属到正确会话与数据库。
- [ ] C2 SQLite 多窗口与事务：审查 node:sqlite engine、事务请求队列、关闭/崩溃时资源收束。
- [ ] C3 PGlite 独占与可选 peer：检查 PGlite data-dir lock/runtime 与 optional peer 的按需装载；不套用 SQLite 多窗口假设。
- [ ] C4 文件与路径安全：追踪 storage 根路径、logical path、符号链接和请求边界；与插件 storage 和 DevTools provider 联审。
- [ ] C5 加密与备份恢复：审查 SQLite/PGlite 各自备份锁、restore 事务和 keyring；按不同后端分别记录证据。
- [ ] C6 host 与应用集成：将 adapter 单测、应用 electron-conformance 与 packaged E2E 接起来；单纯浏览器 demo 不算桌面证据。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-04：第二批实际深审

### C4：文件 host 与 storage 的实际组合

本轮通过真实 createElectronSqliteHost / createElectronFileHost、RxDBAdapterElectron 与 storage 组合复验。路径仍在自己创建的临时根内，没有路径越界；却暴露逻辑别名共享同一文件并造成旧 ID 内容被覆盖，统一归入 storage [RV-044](../../RV-044-desktop-logical-path-alias-data-overwrite.md)，不重复包装成 file host 越权/RCE。

实际 SQLite、真实文件 host/磁盘、直连协议传输；不是 Electron GUI/IPC。[2 failed / 1 passed](../../evidence/2026-10-04/storage-native-path-alias.txt)。每例 destroy 后关闭自己 host 并删除自己临时目录。C4/C6 的全宿主/窗口/打包链路不随该测试完成。
