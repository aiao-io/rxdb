---
id: US-304
title: 跨 realm writer lease 与迁移 fencing
status: In Progress
priority: High
epic: epic-005-type-system-evolution
created: 2026-08-01
updated: 2026-08-11
tags: [collaboration, migration, lease, fencing, cross-tab, cross-process]
inherited_acs:
  - from: US-303
    ac: 13
    note: 将跨 realm/进程旧 writer 的可靠排除从 change codec story 拆出，先发布桥接协议再执行迁移。
---

<!--
INVEST 检查清单:
- [ ] Independent: 依赖 US-303 的系统迁移入口和旧格式可读能力
- [x] Negotiable: lease 表、guard 状态机和后端锁实现可以调整
- [x] Valuable: 防止空闲旧连接在迁移后恢复并写入不兼容格式
- [x] Estimable: 范围集中在 writer 协作协议、迁移隔离和发布门禁
- [x] Small: 不包含 change codec、远程同步、加密和 DevTools
- [x] Testable: lease、fencing、竞态、崩溃恢复和多 realm 均有独立 AC
-->

# 用户故事：跨 realm writer lease 与迁移 fencing

## 作为/我想要/以便

**作为** 发布 Local-first 客户端的开发者
**我想要** 在系统迁移前可靠发现并隔离所有旧 writer
**以便** 跨 Tab、Worker、进程或空闲连接不会在迁移后继续写入旧格式

## 来源与边界

本 story 继承 [US-303 AC13](./US-303-bigint-binary-change-codec.md)，只负责跨 realm/进程 writer 的可观测性和 fencing。US-303 已完成的 change codec、系统表迁移、watermark 原子提交和回滚重试不在本 story 重做。

### In Scope

- 在旧格式兼容的桥接版本中发布 writer lease/upgrade guard 协议，不提前改变 change schema
- SQLite family 与 PGlite 使用持久化 lease 表记录 writer 身份、协议版本、epoch、心跳和过期时间
- writer 在每个写事务内校验 guard/epoch，并在同一事务内续租；失去 lease 或 fencing 后停止写入
- upgrader 执行 `open → draining → migrating → open` 状态机，拒绝新旧不兼容 writer
- 获取排他锁、排空 lease、复查 fencing、执行迁移和启用业务 trigger 的顺序约束
- writer 崩溃、Tab 挂起、Worker 重启、升级失败和升级者崩溃后的安全重试
- 桥接版本的最低协议版本、强制升级、缓存失效和旧 bundle 禁止继续写入的发布门禁

### Out of Scope

- change envelope、patch/inversePatch 和 entityId codec（US-303）
- Supabase push/pull、加密字段和 DevTools 展示
- 允许未实现桥接协议的旧 bundle 继续写入已升级数据库
- 仅依赖 `BroadcastChannel`、Web Locks 或当前 JS realm 内存状态的实现

## 验收标准

| #   | 前置条件                                     | 操作                                 | 预期结果                                                                             | 状态 |
| --- | -------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ | ---- |
| 1   | 桥接版本打开旧格式数据库                     | 初始化 writer lease 与 upgrade guard | 不改变旧 change 格式；旧 writer 可读；协议版本可查询                                 | ⚠️   |
| 2   | 两个 Tab、Worker 或进程连接同一数据库        | 注册并持续写入 lease                 | 每个 writer 有唯一身份；心跳使用数据库时间；重复注册不覆盖其他 writer                | ⚠️   |
| 3   | 存在仍有效的空闲旧 writer lease              | 新版本请求迁移                       | 进入 `draining` 后无法确认 writer 已退出则 fail-fast；业务 trigger 不启动            | ✅   |
| 4   | writer 写事务与 upgrader 同时竞争            | 执行写入和升级                       | guard/epoch 校验与实际写入在同一事务内，不存在检查后竞态窗口                         | ⚠️   |
| 5   | writer 被杀死或 lease 超时                   | 等待保守的 lease TTL 后重试升级      | 旧 writer 被视为失效，升级可重新获取 fencing 并继续                                  | ✅   |
| 6   | 已迁移后暂停的旧桥接 writer 恢复             | 尝试写入                             | epoch/fencing 校验失败，连接转为只读或要求重连，不产生旧格式 change                  | ⚠️   |
| 7   | lease drain 成功                             | 执行系统 DDL/DML 与 watermark 提交   | guard、schema、watermark、epoch 和业务 trigger 在同一原子提交中完成                  | ✅   |
| 8   | 迁移任意步骤失败或 upgrader 崩溃             | 重新连接并重试                       | 无半迁移状态；过期升级者不能清除其他 owner 的 guard；重试成功且不重复改写历史        | ⚠️   |
| 9   | lease/guard 表不存在、协议版本过低或状态未知 | 尝试升级                             | 明确报错并中止，不猜测安全、不启用业务 trigger                                       | ✅   |
| 10  | 真实 SQLite 多进程和 PGlite Worker/Tab 场景  | 运行共享迁移套件                     | 空闲 writer、竞态、崩溃恢复和 stale writer fencing 均通过                            | ✅   |
| 11  | 仍有桥接版本之前的离线旧 bundle              | 发布迁移版本                         | 发布门禁阻止升级，或通过强制更新/缓存失效/新数据库命名空间隔离；不得声称 AC13 已完成 | ⚠️   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 复核记录（2026-08-11）

### 已交付的部分

- 协议原语：`packages/rxdb/src/system/writer-lease.ts` 提供 `open/draining/migrating/failed` 状态机、`epoch`/`minProtocol` 不变式与全部 `RxDBWriterLeaseErrorCode`，本身不持有心跳，也不触发自动迁移。
- 双适配器接入：`RxDBAdapterSqliteBase` 与 `RxDBAdapterPGlite` 都在写事务内读 guard 并续租（PGlite 用 `SELECT ... FOR UPDATE`，SQLite 用带 `state = 'open' AND epoch = ?` 条件的 UPSERT，`rowsAffected !== 1` 即判 `writer_fenced`）；心跳间隔取 `RXDB_WRITER_HEARTBEAT_INTERVAL_MS`，时间戳取数据库时间（`strftime('%Y-%m-%dT%H:%M:%fZ','now')` / `clock_timestamp()`）。
- 测试：`shared-system-schema-migration.suite.ts`、真实多进程的 `system-schema-migration.multiprocess.spec.ts`、PGlite 的 `pglite-migration-writer.worker.ts` 覆盖 AC3/5/7/9/10。

### AC11 由 ✅ 降级为 ⚠️ 的依据

- `v0.0.24` 上的 `requirements/migration-release.json` 声明 `kind=migration`、`bridge.tag=null`、`oldBundlePolicy.enforced=false`，门禁对该清单判定 fail-closed；而 `@aiao/rxdb@0.0.24` 已经是 npm `latest`。门禁没有拦住那次发布，所以“发布门禁阻止升级”从未被真实发布验证过。
- 至今没有任何 tag 被声明为桥接版本，`oldBundlePolicy` 也从未启用，AC11 列出的三条替代路径（强制更新 / 缓存失效 / 新数据库命名空间）一条都没生效。
- 现清单已改为 `kind=bridge` / `0.0.25`，`pnpm nx run @aiao/source:migration-release-gate` 与 `migration-release-gate-test` 本地均通过。该桥接版本实际发布后，AC11 才能重新评估。

### ⚠️ 项的剩余条件

| AC  | 剩余条件                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | 协议常量与建表已就位，但“桥接版本已发布”这一前提要等 `0.0.25` 真正发布后才成立                                                |
| 2   | 唯一 writerId、按 `(databaseId, writerId)` 冲突更新与数据库时间心跳已实现，待在真实多 Tab/Worker/进程下复核并发注册不互相覆盖 |
| 4   | 校验与写入已在同一事务内，待逐一确认四个 SQLite 后端（wa-sqlite / sqlite-wasm / sqliteai / node）的 `rowsAffected` 语义一致   |
| 6   | 现有用例通过模拟 epoch 提升验证 fencing，待补长时间挂起的浏览器 Tab 恢复后的真实表现                                          |
| 8   | 回滚与过期 owner 保护已有用例，但 `failed` 是需要人工恢复的终态，恢复步骤尚未写入 `website/docs/migration/schema.md`          |

## 技术约束

- lease TTL 只能用于发现失联 writer，不能替代 fencing；挂起后恢复的 writer 必须因 epoch 失效而不能写入
- 数据库时间用于 `lastSeenAt`/`expiresAt`，不得依赖跨进程本地时钟比较
- SQLite 使用数据库内 lease 表配合 `BEGIN IMMEDIATE/EXCLUSIVE`；PGlite 使用持久化 guard 行锁/表锁，realm 内 peer 检查只能提前失败
- 所有未知状态、未知协议版本和无法确认 lease 完整性的情况必须 fail-fast
- 干净关闭可以删除 lease，但升级安全性不能依赖客户端一定执行 cleanup
- 桥接版本必须先于迁移版本发布，并定义最低可升级 writer 协议版本

## 推荐状态模型

```text
open -> draining -> migrating -> open
                 \-> failed -> explicit retry
```

推荐系统表至少包含：

- `upgrade_guard(databaseId, epoch, state, ownerId, ownerExpiresAt, minProtocol)`
- `writer_lease(databaseId, writerId, protocolVersion, epoch, lastSeenAt, expiresAt)`

## 实施分期

1. **桥接版本**：创建 lease/guard 表，所有 writer 在同一写事务内注册、续租并校验 epoch；只新增协议，不升级 change schema。
2. **迁移版本**：实现 drain barrier、排他锁复查、fencing epoch 和原子迁移；任何 lease 不完整或协议过低都 fail-fast。
3. **发布门禁**：强制最小桥接版本、处理离线旧 bundle、运行 SQLite 多进程与 PGlite Worker/Tab 集成套件，再允许类型系统升级进入发布产物。

本仓库的发布门禁由 [`requirements/migration-release.json`](../../migration-release.json) 和
`pnpm nx run @aiao/source:migration-release-gate` 执行。迁移发布必须填写已存在且位于当前
提交祖先链上的桥接 tag、最低桥接版本和已启用的旧 bundle 策略；门禁还会检查桥接 tag
确实包含 writer lease/guard 集成。缺任一项时发布任务 fail-closed。

## 实现文件

- `packages/rxdb/src/system/` — lease/guard 类型、协议版本和错误
- `packages/rxdb/src/RxDB.ts` — drain 顺序、fencing 和迁移前置检查
- `packages/rxdb-adapter-sqlite-core/src/` — SQLite lease 表、事务锁和 writer guard
- `packages/rxdb-adapter-pglite/src/` — PGlite lease 表、行锁/表锁和 writer guard
- `packages/rxdb-test/src/testing/` — 多 realm、崩溃恢复和 stale writer 套件
- `website/docs/migration/schema.md` — 发布顺序、单向迁移和旧 bundle 限制

## References

- [US-303 bigint/binary change codec 与系统迁移](./US-303-bigint-binary-change-codec.md)
- [Epic 005 类型系统演进](../../epics/epic-005-type-system-evolution.md)
- [系统 schema 迁移文档](../../../website/docs/migration/schema.md)
