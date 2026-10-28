# rxdb-adapter-electron 深度评审

评审日期：2026-10-28；源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。本次为公开入口和高风险路径审计，未声称逐行覆盖整个包。

统一 Nx 校验结果见 [包级索引](README.md)；源码实证与测试运行结果分别记录，未运行的宿主验证不计为通过。

## 结论与范围

🟡凑合：本次重点路径未发现新增确定包内缺陷；SQLite 入口继承共享加密风险，故当前不能判定整体无阻断问题。Electron PGlite 和 SQLite 是两种后端，不能把一个入口的结论直接套到另一个。

| 评审重点                | 源码与符号                                                                                                                                                                                                                                                                        | 当前判断                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| renderer SQLite adapter | [`RxDBAdapterElectron`](../../../packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts)                                                                                                                                                                                       | 逻辑名构造期校验；dropStorage 与 restore 走窄协议                                         |
| SQLite host 生命周期    | [`createElectronSqliteHost`](../../../packages/rxdb-adapter-electron/src/electron-sqlite-host.ts)、[`NodeSqliteEngine.open` / `execute` / `close`](../../../packages/rxdb-adapter-electron/src/node-sqlite-engine.ts)                                                             | 每库存储操作串行，BEGIN BUSY 有重试预算，关闭会回滚未完成事务                             |
| SQL 与文件边界          | [`NodeSqliteEngine.#initialize`](../../../packages/rxdb-adapter-electron/src/node-sqlite-engine.ts)、[`createElectronFileHost`](../../../packages/rxdb-adapter-electron/src/electron-file-host.ts)                                                                                | authorizer 拒绝越界指令；路径 realpath containment、临时写入/rename、session 锁队列已抽查 |
| PGlite renderer 与恢复  | [`DesktopPGliteClient.#runTransaction` / `snapshotDataDir` / `#runClose`](../../../packages/rxdb-adapter-electron/src/pglite/desktop-pglite-client.ts)、[`restoreElectronPGliteDatabase`](../../../packages/rxdb-adapter-electron/src/pglite/restore-electron-pglite-database.ts) | transactionId 显式传递；恢复核对 manifest 后提交，失败走 abort                            |
| PGlite 跨进程存储锁     | [`acquirePgliteDirectoryLock`](../../../packages/rxdb-adapter-electron/src/pglite-host/pglite-host-lock.ts)、[`walkPgliteDataDirectory`](../../../packages/rxdb-adapter-electron/src/pglite-host/pglite-host-data-dir.ts)                                                         | 独立 SQLite 锁文件与恢复 marker；归档读逐块处理实际 bytesRead                             |

## 问题清单与共享风险

新增独立确定缺陷：0。SQLite 入口继承 [sqlite-core SQLC-001](rxdb-adapter-sqlite-core.md)：无关系实体的加密 `*Id` 列在 renderer 转换层被直接透传为明文，host 无法识别其应该加密。PGlite 入口不走这个共享 SQLite 转换函数，不在该问题影响范围内。

## 已知契约与不重复项

恢复 marker 删除失败后的回滚是既有原子性选择；`pg.backup.end` 传输失败后依赖会话断开回收是 [清理记录](../README.md) 保留的事实，不重新包装成新增问题。文件写提交使用临时文件 rename，原生文件上传的覆盖语义与 OPFS 上传不同，不能混报。

## 测试与边界

已定位 host/client、SQLite backup、Electron PGlite backup/restore 并发和故障注入测试。此次未独立驱动真实 Electron 应用，未验证 Windows 文件系统与强杀进程；Node 接缝测试不能代替窗口销毁、preload 注册或真实 IPC 验收。后续先补共享加密实际落盘回归，再按 SQLite/PGlite 两入口分别跑宿主验证。

## 本次 Nx 校验

本次 `rxdb-adapter-electron:test`：4 failed | 1386 passed | 8 skipped (1398)；目标实际执行。命令及整体边界见[总索引](README.md)。失败的 4 个文件随后以 `--maxWorkers=1 --run` 定点复跑：36 个用例全部通过，未再出现超时或未处理拒绝。按仓库约定作为并发/资源相关抖动记录，不登记为确定业务缺陷；没有再次执行全包测试目标。
