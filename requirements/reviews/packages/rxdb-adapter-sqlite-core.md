---
package: rxdb-adapter-sqlite-core
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb-adapter-sqlite-core 增量代码评审

## 结论

🔴 待处理：1 条 P1、1 条 P2、1 条 P3。本轮新增问题见 INC 编号条目。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 44 文件、测试/测试工具 40 文件、配置/文档/版本 3 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`be7353e3 fix(rxdb-adapter-sqlite-core): skip unsupported coverage workers`；`c425f414 chore(deps): safely upgrade workspace dependencies`；`9361d916 q`；`b109ba33 feat(aiao): 重构 worktree 功能 (#122)`；`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：影子表名/索引/外键、播种与回收、系统 schema v8、事件 tableSetSuffix、公开仓库事务化、共享客户端 Web Lock、OPFS 重试、快照信封直通；旧 AAD 与 binary 内联路径复核。
- 实现锚点：`src/RxDBAdapterSqliteBase.ts`、`src/backup/sqlite-backup-schema.ts`、`src/desktop-host.ts`、`src/desktop/desktop-host-protocol.ts`、`src/desktop/desktop-sqlite-client.ts`、`src/entity/delete_sql.ts`、`src/entity/deletes_sql.ts` 等 44 个实现文件。

## 发现

### P1：加密列 + 自定义主键 `columnName` → AAD 主键两侧不一致，行写入后永久不可读

- 证据：`src/sqlite-core.utils.ts:383` 写入侧 `const primaryKeyValue = opts?.primaryKey ?? (entity['id'] as RxDBEntityId | null | undefined) ?? ''`；调用方 `src/entity/insert_sql.ts:67` 与 `src/entity/inserts_sql.ts:68` 传入的是 `normalizeCreateEntity` 的产物——**以物理列名为键**，自定义主键列名下没有 `id` 键，`opts.primaryKey` 又未传（对照 `update_sql.ts:46-47` 正确传了 `single?.id`）→ 加密 AAD 的 primaryKey 落成空串。读取侧 `src/sqlite-core.utils.ts:675` 从**已水合的实体**（属性名键）取 `obj['id']` → 真实主键。AES-GCM 的 AAD 参与认证（`envelope.ts` / `keyring.ts`），两侧不一致 → 每次读取抛 `EncryptedDecryptError`，且**写入时无任何报错**。
- 触发：任一 sqlite 家族适配器（wa-sqlite / sqlite-wasm / sqlite / sqliteai / electron / miniprogram，均复用本包），实体主键声明 `columnName: 'pk_id'` 且存在任一 `encrypted: true` 列，`repository.create()` / `saveMany()` 即产生不可读行。`shared-custom-primary-key.suite.ts` 覆盖自定义主键但无加密列，加密测试只用默认 `id` 列——交集无覆盖。
- 建议：`insert_sql.ts` / `inserts_sql.ts` 调用时显式传 `primaryKey: entity.id`（与 update 路径对齐），或在 `transformEntityValueToSql` 内经 `metadata.propertyMap.get('id')?.columnName` 取主键值；补「自定义主键列 + 加密列」的创建→读取集成测试进共享套件。

### P3：binary 种子值被内联成未加引号的 `1,2,3`，建表 SQL 直接语法错误

- 证据：`src/sqlite-core.utils.ts:552` `get_sql_value` 对 `Uint8Array` 原样返回；`563-565` `get_sql_with_params` 用 `String(...)` 拼接；`src/table/create_tables_sql.ts:56` 把种子 INSERT 参数全部内联进建表 SQL（布尔/日期在 `transformValueJsToSqlite` 已转 0/1、ISO 串，只有 binary 保持 `Uint8Array`）。
- 触发：`createTables(EntityTypes, seedEntities)` 的种子行含 `binary` 属性（当前核心种子均为文本，插件 `createInitialRows` 贡献可触达）→ 连接期 SQL 语法错误。
- 建议：`get_sql_with_params` 对 `Uint8Array` 输出 `X'hex'` 字面量，或在该内联路径显式拒绝 binary。

### P2：无日志实体的删除事件在事务提交前派发，回滚后仍通知应用删除（INC-002）

- 引入：`b109ba33`（PR #122）。同一问题同时影响 PGlite 与 sqlite-core，汇总只计一条。
- 证据：`packages/rxdb-adapter-pglite/src/repository/PGliteRepository.ts:97-98`、`packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts:113-114`；两处均在 DELETE 语句返回后立即调用 `dispatchUnloggedRemovals` / `dispatch_unlogged_removals`。执行器的 `writeQuery` 直接复用外层事务，这时还没 COMMIT。
- 触发：实体声明 `log: false`；在 `adapter.transaction()` 中经 `executor.getRepository(Entity).remove(row)` 删除后，后续语句或业务逻辑抛错。事务回滚、行仍存在，但 `ENTITY_LOCAL_REMOVE` 已到达应用订阅者，不能随数据库回滚。
- 验证：本轮用真实内存 PGlite 执行临时回归；回滚后 `count() === 1`，预期零次删除通知，实际收到一次，断言失败。SQLite 侧按同源调用顺序静态确认，未把它写成真实 SQLite 已复现。
- 建议：把通知收集到所属事务，在提交成功后统一派发；回滚丢弃。补显式事务回滚、提交失败与正常删除的共享回归。

## 验证与限制

本轮对本包执行静态增量检查，未单独运行其 lint/typecheck/test/build；不沿用旧报告的测试通过结论。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
