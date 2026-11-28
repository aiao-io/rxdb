---
id: US-040
title: 恢复归档时核对身份绑定：别的身份的备份恢复不进当前身份的库，没有绑定的旧备份照常恢复
status: Done
priority: High
epic: epic-015-identity-scoped-sync
created: 2026-11-28
updated: 2026-11-28
tags: [core, backup, identity, sqlite, pglite]
---

# 用户故事：恢复归档时核对身份绑定

## 作为/我想要/以便

**作为** 给每个账号一个本机库（US-035）、又提供备份与恢复（US-527）的应用开发者
**我想要** 恢复归档时，平台在提交之前核对归档里的库绑定的身份：是别的身份就拒绝、目标保持空库；没有绑定或就是当前身份时照常恢复
**以便** 一个账号的备份不会被恢复进另一个账号的库，把数据悄悄交给别人；恢复失败也不会把当前账号的库变成别人的、从此打不开

## 立项

2026-11-28 Admin 的 ADMIN-US-222（本机库按账号隔离）在三端 e2e 里发现：B 恢复 A 导出的备份，恢复「成功」之后重连报身份不匹配。原因是归档带着 A 的身份绑定一起写进了 B 的库，B 的库从此绑定给 A，之后每次打开都被拒。US-035 定的是「库与身份绑定，对不上就停下报错，不自动改绑」，恢复却绕过了这一条。

## 现状

1. **恢复在提交前核对兼容性，但不看身份。** SQLite 一族：[`RxDBAdapterSqliteBase.restore()`](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts) 只写入空目标，结构与行在同一个事务里重放，`writeTarget()`（[`restore-sqlite-database.ts`](../../../packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts)）在提交前核对系统表 / 变更编码版本与结构，失败时 `discardTarget()` 把目标清回空库：

   ```ts
   await assertVersions(client, session.manifest);
   await assertStructure(client, schema);
   ```

   PGlite：[`restorePGliteDatabase()`](../../../packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts) 在恢复出的数据目录上启动引擎，`verifyPGliteRestored()` 在目标对外可见之前核对引擎兼容键与系统表 / 变更编码版本；桌面端的 [`restoreElectronPGliteDatabase()`](../../../packages/rxdb-adapter-electron/src/pglite/restore-electron-pglite-database.ts) 经 IPC 在 host 的私有实例上走同一份校验。

   三条路径上，身份绑定（`rxdb_migration` 里 `__rxdb_identity__:` 前缀的水位行）都随普通行一起被恢复进来，没有核对。

2. **核对原语在核心里，但不公开。** [`assertIdentityBinding()`](../../../packages/rxdb/src/system/identity-binding.ts)、`getRxDBIdentityKey()` 与水位行前缀都是 `@internal`，适配器只用得到 `@aiao/rxdb` 的公开面。
3. **实现了恢复的后端**：SQLite 一族的 `restore()` 在 `rxdb-adapter-sqlite-core`，wa-sqlite、sqlite-wasm、node SQLite、sqliteai、electron、tauri 共用；PGlite 的恢复是 `rxdb-adapter-pglite` 的自由函数；桌面端的 PGlite 由 `rxdb-adapter-electron` 在 host 上恢复。远端适配器（HTTP、Supabase）不提供恢复。

## 范围边界

### In Scope

- 核心提供恢复用的身份核对：给定目标实例与恢复出来的库里迁移表的全部行名，目标声明了 `identity` 而库里绑定的是别的身份时报 `RxDBBackupError('incompatible_archive')`，`details.field` 为 `identity`；库里的首次绑定残缺时报 `corrupt_archive`；目标没声明身份、或库没有绑定、或绑定的就是目标的身份时放行。
- SQLite 一族的恢复在提交之前调用它：拒绝时事务回滚、目标清回空库，之后照常以本身份连接。
- PGlite 与桌面 host 上的 PGlite 在校验恢复出来的库时调用它：拒绝时目标退回从未恢复过的状态（不留未完成标记），之后照常以本身份连接。
- 没有绑定的归档恢复进声明了身份的目标后，第一次连接按 US-035 就地绑定到目标的身份。
- 共享备份套件里的同一组用例，六个 SQLite 系后端都跑；PGlite 与桌面 host 上的 PGlite 各有同口径的用例。
- 文档：备份恢复的身份规则写进备份文档。

### Out of Scope

- 显式改绑（把别人的备份认领到自己名下）：US-035 待定，本故事不提供。
- 归档加密与按身份加密（另有加密认证域的核对）。
- 远端适配器：HTTP、Supabase 不提供恢复。

## 验收标准

| #   | 前置条件                                  | 操作                                | 预期结果                                                                                  | 状态 |
| --- | ----------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------- | ---- |
| 1   | 源库以身份 A 打开过（已绑定），备份出归档 | 在声明身份 B 的空目标上恢复         | 报 `incompatible_archive`，`details.field` 为 `identity`；目标保持空库，之后以 B 连接正常 | ✅   |
| 2   | 同上                                      | 在声明身份 A 的空目标上恢复并连接   | 恢复成功，数据与源一致，连接时身份核对通过                                                | ✅   |
| 3   | 源库从没声明过身份（未绑定），备份出归档  | 在声明身份 B 的空目标上恢复并连接   | 恢复成功；第一次连接就地绑定到 B，之后以 A 打开这个库报身份不匹配                         | ✅   |
| 4   | 源库以身份 A 绑定                         | 在没有声明身份的空目标上恢复并连接  | 恢复成功（目标不启用身份核对，与 US-035「不声明时行为不变」一致）                         | ✅   |
| 5   | —                                         | 各 SQLite 系后端跑共享备份套件      | 上述用例全部通过                                                                          | ✅   |
| 6   | —                                         | PGlite 与桌面 host 上的 PGlite 恢复 | 拒绝与放行的口径与 SQLite 一族一致；拒绝后目标没有未完成标记                              | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：

- 核心：[`backup-target.spec.ts`](../../../packages/rxdb/src/__tests__/backup/backup-target.spec.ts) 的 `assertRxDBRestoreIdentity（US-040）`：目标没声明身份、库没有绑定、绑定的就是目标的身份时放行；别的身份报 `incompatible_archive`，首次绑定残缺报 `corrupt_archive`，`details.field` 都是 `identity`。
- AC#1、#5：[`shared-backup-failure.suite.ts`](../../../packages/rxdb-adapter-sqlite-core/src/__tests__/shared-backup-failure.suite.ts) 的 `rejects an archive bound to another identity (US-040)`，六个 SQLite 系后端都跑。
- AC#2～#5：[`shared-backup-roundtrip.suite.ts`](../../../packages/rxdb-adapter-sqlite-core/src/__tests__/shared-backup-roundtrip.suite.ts) 的 `identity binding (US-040)`。
- AC#6：PGlite 的 [`backup-identity.spec.ts`](../../../packages/rxdb-adapter-pglite/src/__tests__/backup/backup-identity.spec.ts) 覆盖 AC#1～#4；桌面 host 的 [`electron-pglite-restore.spec.ts`](../../../packages/rxdb-adapter-electron/src/__tests__/backup/electron-pglite-restore.spec.ts) 的 `restoreElectronPGliteDatabase identity binding (US-040)` 覆盖 AC#1、#2。
- 业务验收：Admin 的 [ADMIN-US-222](../../../rxdb-admin-template/requirements/stories/collaboration/ADMIN-US-222-identity-bound-local-databases.md) AC#7，三端 e2e 里同一账号在另一个浏览器恢复成功，别的账号恢复被拒、自己的库不变。

复验：`pnpm nx run-many -t test --projects=rxdb,rxdb-adapter-sqlite-core,rxdb-adapter-wa-sqlite,rxdb-adapter-sqlite-wasm,rxdb-adapter-sqlite,rxdb-adapter-sqliteai,rxdb-adapter-pglite,rxdb-adapter-electron`（SQLite 系后端并行跑时浏览器 worker 用例可能超时，失败的单独复跑）。

## 技术笔记

- SQLite 一族的核对放在 `writeTarget()` 的版本核对之后、提交之前；PGlite 放在 `verifyPGliteRestored()` 的版本核对之后，浏览器与桌面 host 共用。两处都读迁移表全部行名交给核心（行数很少），水位行前缀等内部常量不必公开。
- `verifyPGliteRestored()` 是公开导出，多了必填的目标实例参数，CHANGELOG 记为 Breaking。
- 用 `incompatible_archive` 而不新增错误码：它就是一种兼容性不符，应用已经按这个码给出「归档与当前库不兼容」；要区分身份时看 `details.field`。

## 实现文件

- `packages/rxdb/src/backup/backup-target.ts` — `assertRxDBRestoreIdentity()`（新导出）
- `packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts`、`sqlite-backup-schema.ts` — 提交前调用，读迁移表行名
- `packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts`、`pglite-backup-compat.ts` — 校验时调用，读迁移表行名
- `packages/rxdb-adapter-electron/src/pglite/restore-electron-pglite-database.ts` — host 上的校验带上目标实例
- `website/docs/adapters/backup.md` — 恢复的「身份绑定」一节与错误码说明

## References

- [US-035 每个身份一个本地库](US-035-identity-bound-local-database.md)
- [ADMIN-US-222 本机库按账号隔离](../../../rxdb-admin-template/requirements/stories/collaboration/ADMIN-US-222-identity-bound-local-databases.md)
