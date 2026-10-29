# rxdb-adapter-electron 深度评审

评审日期：2026-10-29；源码基线：`f62f77c19d55c73d8335df026778422282c2fed4`。本次为公开入口和高风险路径审计，未声称逐行覆盖整个包。本更新轮仅 `package.json` devDependencies 的 `@electric-sql/pglite` `^0.5.11 → ^0.5.12`，源码无变更，未发现新的确定问题。

统一 Nx 校验结果见 [包级索引](README.md)；源码实证与测试运行结果分别记录，未运行的宿主验证不计为通过。

## 结论与范围

🟡凑合：本次重点路径未发现新增确定包内缺陷；SQLite 入口继承共享加密写入缺陷（P2），正常加密 CRUD 仍需修复。Electron PGlite 和 SQLite 是两种后端，不能把一个入口的结论直接套到另一个。2026-10-29 复核后问题计数不变（0 个新增独立修复点）。

| 评审重点                | 源码与符号                                                                                                                                                                                                                                                                        | 当前判断                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| renderer SQLite adapter | [`RxDBAdapterElectron`](../../../packages/rxdb-adapter-electron/src/RxDBAdapterElectron.ts)                                                                                                                                                                                       | 逻辑名构造期校验；dropStorage 与 restore 走窄协议                                         |
| SQLite host 生命周期    | [`createElectronSqliteHost`](../../../packages/rxdb-adapter-electron/src/electron-sqlite-host.ts)、[`NodeSqliteEngine.open` / `execute` / `close`](../../../packages/rxdb-adapter-electron/src/node-sqlite-engine.ts)                                                             | 每库存储操作串行，BEGIN BUSY 有重试预算，关闭会回滚未完成事务                             |
| SQL 与文件边界          | [`NodeSqliteEngine.#initialize`](../../../packages/rxdb-adapter-electron/src/node-sqlite-engine.ts)、[`createElectronFileHost`](../../../packages/rxdb-adapter-electron/src/electron-file-host.ts)                                                                                | authorizer 拒绝越界指令；路径 realpath containment、临时写入/rename、session 锁队列已抽查 |
| PGlite renderer 与恢复  | [`DesktopPGliteClient.#runTransaction` / `snapshotDataDir` / `#runClose`](../../../packages/rxdb-adapter-electron/src/pglite/desktop-pglite-client.ts)、[`restoreElectronPGliteDatabase`](../../../packages/rxdb-adapter-electron/src/pglite/restore-electron-pglite-database.ts) | transactionId 显式传递；恢复核对 manifest 后提交，失败走 abort                            |
| PGlite 跨进程存储锁     | [`acquirePgliteDirectoryLock`](../../../packages/rxdb-adapter-electron/src/pglite-host/pglite-host-lock.ts)、[`walkPgliteDataDirectory`](../../../packages/rxdb-adapter-electron/src/pglite-host/pglite-host-data-dir.ts)                                                         | 独立 SQLite 锁文件与恢复 marker；归档读逐块处理实际 bytesRead                             |

## 问题清单与共享风险

新增独立确定缺陷：0。SQLite 入口继承 [sqlite-core SQLC-001](rxdb-adapter-sqlite-core.md)：无关系实体的加密 `*Id` 列在 renderer 转换层跳过加密；正常公开仓库的解密回填失败会让同一事务回滚，不能把参数明文透传等同于已提交敏感数据。PGlite 入口不走这个共享 SQLite 转换函数，不在该问题影响范围内。

**2026-10-29 复核：**仍有效。本包与 `rxdb-adapter-sqlite-core` 源码在本区间均无变更（`sqlite-core.utils.ts` 的 `key.endsWith('Id')` 跳过加密分支仍在 HEAD）；首轮 `test` 4 文件超时及定点复跑 36/36 通过的记录维持原状（本轮未重跑测试，主会话统一重跑后另计）。

## 已知契约与不重复项

恢复 marker 删除失败后的回滚是既有原子性选择；`pg.backup.end` 传输失败后依赖会话断开回收是 [清理记录](../README.md) 保留的事实，不重新包装成新增问题。文件写提交使用临时文件 rename，原生文件上传的覆盖语义与 OPFS 上传不同，不能混报。

## 测试与边界

已定位 host/client、SQLite backup、Electron PGlite backup/restore 并发和故障注入测试。此次未独立驱动真实 Electron 应用，未验证 Windows 文件系统与强杀进程；Node 接缝测试不能代替窗口销毁、preload 注册或真实 IPC 验收。后续先补共享加密实际落盘回归，再按 SQLite/PGlite 两入口分别跑宿主验证。

2026-10-29 变更仅为 devDependencies 的 `@electric-sql/pglite` `^0.5.11 → ^0.5.12`；[vite.config.mts](../../../packages/rxdb-adapter-electron/vite.config.mts) 已把 `@electric-sql/pglite` 列为 external（既有配置，非本轮改动），打包姿态不变，运行差异由主会话统一重跑测试后另计。

## 调用链交叉核查

重新核对 renderer→共享内核→Node host：加密回填位于公开仓库事务内部，Node host 收到明文参数不等于明文已提交。SQLite host 的 authorizer 在解析期拒绝 ATTACH/DETACH 与目录重定向 PRAGMA；PGlite 的独立恢复路径不受这段转换影响。未新增确定独立缺陷。

## 本次 Nx 校验

首轮（2026-10-28）`rxdb-adapter-electron:test`：4 failed | 1386 passed | 8 skipped (1398)；目标实际执行。命令及整体边界见[总索引](README.md)。失败的 4 个文件随后以 `--maxWorkers=1 --run` 定点复跑：36 个用例全部通过，未再出现超时或未处理拒绝。按仓库约定作为并发/资源相关抖动记录，不登记为确定业务缺陷；没有再次执行全包测试目标。
