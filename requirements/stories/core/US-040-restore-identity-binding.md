---
id: US-040
title: 恢复归档时核对身份绑定：别的身份的备份恢复不进当前身份的库，没有绑定的旧备份照常恢复
status: In Progress
priority: High
epic: epic-015-identity-scoped-sync
created: 2026-11-28
updated: 2026-11-28
tags: [core, backup, identity, sqlite]
---

# 用户故事：恢复归档时核对身份绑定

## 作为/我想要/以便

**作为** 给每个账号一个本机库（US-035）、又提供备份与恢复（US-527）的应用开发者
**我想要** 恢复归档时，平台在提交之前核对归档里的库绑定的身份：是别的身份就拒绝、目标保持空库；没有绑定或就是当前身份时照常恢复
**以便** 一个账号的备份不会被恢复进另一个账号的库，把数据悄悄交给别人；恢复失败也不会把当前账号的库变成别人的、从此打不开

## 立项

2026-11-28 Admin 的 ADMIN-US-222（本机库按账号隔离）在三端 e2e 里发现：B 恢复 A 导出的备份，恢复「成功」之后重连报身份不匹配。原因是归档带着 A 的身份绑定一起写进了 B 的库，B 的库从此绑定给 A，之后每次打开都被拒。US-035 定的是「库与身份绑定，对不上就停下报错，不自动改绑」，恢复却绕过了这一条。

## 现状

1. **恢复在提交前核对兼容性，但不看身份。** [`RxDBAdapterSqliteBase.restore()`](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts) 只写入空目标，结构与行在同一个事务里重放，`writeTarget()`（[`restore-sqlite-database.ts`](../../../packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts)）在提交前核对系统表 / 变更编码版本与结构，失败时 `discardTarget()` 把目标清回空库：

   ```ts
   await assertVersions(client, session.manifest);
   await assertStructure(client, schema);
   ```

   身份绑定（`rxdb_migration` 里 `__rxdb_identity__:` 前缀的水位行）随普通行一起被恢复进来，没有核对。
2. **核对原语在核心里，但不公开。** [`assertIdentityBinding()`](../../../packages/rxdb/src/system/identity-binding.ts)、`getRxDBIdentityKey()` 与水位行前缀都是 `@internal`，SQLite 适配器只用得到 `@aiao/rxdb` 的公开面。
3. **只有 SQLite 一族实现了恢复**：`restore()` 在 `rxdb-adapter-sqlite-core`，wa-sqlite、sqlite-wasm、node SQLite、sqliteai、electron、tauri 共用。

## 范围边界

### In Scope

- 核心提供恢复用的身份核对：给定目标实例与恢复出来的库里迁移表的全部行名，目标声明了 `identity` 而库里绑定的是别的身份时报 `RxDBBackupError('incompatible_archive')`，`details.field` 为 `identity`；库里的首次绑定残缺时报 `corrupt_archive`；目标没声明身份、或库没有绑定、或绑定的就是目标的身份时放行。
- SQLite 一族的恢复在提交之前调用它：拒绝时事务回滚、目标清回空库，之后照常以本身份连接。
- 没有绑定的归档恢复进声明了身份的目标后，第一次连接按 US-035 就地绑定到目标的身份。
- 共享备份套件里的同一组用例，六个 SQLite 系后端都跑。
- 文档：备份恢复的身份规则写进备份文档。

### Out of Scope

- 显式改绑（把别人的备份认领到自己名下）：US-035 待定，本故事不提供。
- 归档加密与按身份加密（另有加密认证域的核对）。
- 非 SQLite 后端：目前没有别的后端实现恢复。

## 验收标准

| #   | 前置条件                                         | 操作                                   | 预期结果                                                                                         | 状态 |
| --- | ------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- |
| 1   | 源库以身份 A 打开过（已绑定），备份出归档        | 在声明身份 B 的空目标上恢复            | 报 `incompatible_archive`，`details.field` 为 `identity`；目标保持空库，之后以 B 连接正常         | ⬜   |
| 2   | 同上                                             | 在声明身份 A 的空目标上恢复并连接      | 恢复成功，数据与源一致，连接时身份核对通过                                                       | ⬜   |
| 3   | 源库从没声明过身份（未绑定），备份出归档         | 在声明身份 B 的空目标上恢复并连接      | 恢复成功；第一次连接就地绑定到 B，之后以 A 打开这个库报身份不匹配                                 | ⬜   |
| 4   | 源库以身份 A 绑定                                | 在没有声明身份的空目标上恢复并连接     | 恢复成功（目标不启用身份核对，与 US-035「不声明时行为不变」一致）                                | ⬜   |
| 5   | —                                                | 各 SQLite 系后端跑共享备份套件         | 上述用例全部通过                                                                                 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：随实现补齐——`packages/rxdb-adapter-sqlite-core/src/__tests__/shared-backup-failure.suite.ts` 与 `shared-backup-roundtrip.suite.ts` 的身份用例，复验命令同 US-318（`pnpm nx run-many -t test --projects=rxdb-adapter-sqlite-core,rxdb-adapter-wa-sqlite,rxdb-adapter-sqlite-wasm,rxdb-adapter-sqlite,rxdb-adapter-sqliteai,rxdb-adapter-electron`）。

## 技术笔记

- 核对放在 `writeTarget()` 的版本核对之后、提交之前，读迁移表全部行名交给核心（行数很少），水位行前缀等内部常量不必公开。
- 用 `incompatible_archive` 而不新增错误码：它就是一种兼容性不符，应用已经按这个码给出「归档与当前库不兼容」；要区分身份时看 `details.field`。

## 实现文件

- `packages/rxdb/src/backup/` — 恢复用的身份核对（新导出）
- `packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts` — 提交前调用
- `packages/rxdb-adapter-sqlite-core/src/__tests__/` — 共享备份套件的身份用例

## References

- [US-035 每个身份一个本地库](US-035-identity-bound-local-database.md)
- [ADMIN-US-222 本机库按账号隔离](../../../rxdb-admin-template/requirements/stories/collaboration/ADMIN-US-222-identity-bound-local-databases.md)
