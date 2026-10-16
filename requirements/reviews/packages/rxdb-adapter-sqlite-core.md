# Review：rxdb-adapter-sqlite-core

## 结论

🔴 二次评审发现 1 条 P1、1 条 P3，均为自定义 `columnName` 与既有功能的组合盲区；首轮「未发现问题」结论被推翻。

## 检查范围

检查了 `package.json` 的主入口、`/desktop-host`、`/testing` exports，`project.json` 的 build/typecheck/coverage-acceptance 依赖；走读 `RxDBAdapterSqliteBase.ts`、query/repository/transaction/version/table/backup、加密集成、oo1 与 Comlink 工具，并核对 `src/__tests__/**` 的共享 CRUD/查询/树/事务/备份/自定义主键和约束套件。二次评审额外核对了加密 AAD 的写入/读取两侧取值路径与建表种子内联路径。

## 发现

### P1：加密列 + 自定义主键 `columnName` → AAD 主键两侧不一致，行写入后永久不可读

- 证据：`src/sqlite-core.utils.ts:391` 写入侧 `const primaryKeyValue = opts?.primaryKey ?? (entity['id'] as RxDBEntityId | null | undefined) ?? ''`；调用方 `src/entity/insert_sql.ts:66` 与 `src/entity/inserts_sql.ts:67` 传入的是 `normalizeCreateEntity` 的产物——**以物理列名为键**，自定义主键列名下没有 `id` 键，`opts.primaryKey` 又未传（对照 `update_sql.ts:46-47` 正确传了 `single?.id`）→ 加密 AAD 的 primaryKey 落成空串。读取侧 `src/sqlite-core.utils.ts:711` 从**已水合的实体**（属性名键）取 `obj['id']` → 真实主键。AES-GCM 的 AAD 参与认证（`envelope.ts` / `keyring.ts`），两侧不一致 → 每次读取抛 `EncryptedDecryptError`，且**写入时无任何报错**。
- 触发：任一 sqlite 家族适配器（wa-sqlite / sqlite-wasm / sqlite / sqliteai / electron / miniprogram，均复用本包），实体主键声明 `columnName: 'pk_id'` 且存在任一 `encrypted: true` 列，`repository.create()` / `saveMany()` 即产生不可读行。`shared-custom-primary-key.suite.ts` 覆盖自定义主键但无加密列，加密测试只用默认 `id` 列——交集无覆盖。
- 建议：`insert_sql.ts` / `inserts_sql.ts` 调用时显式传 `primaryKey: entity.id`（与 update 路径对齐），或在 `transformEntityValueToSql` 内经 `metadata.propertyMap.get('id')?.columnName` 取主键值；补「自定义主键列 + 加密列」的创建→读取集成测试进共享套件。

### P3：binary 种子值被内联成未加引号的 `1,2,3`，建表 SQL 直接语法错误

- 证据：`src/sqlite-core.utils.ts:588` `get_sql_value` 对 `Uint8Array` 原样返回；`599-601` `get_sql_with_params` 用 `String(...)` 拼接；`src/table/create_tables_sql.ts:52` 把种子 INSERT 参数全部内联进建表 SQL（布尔/日期在 `transformValueJsToSqlite` 已转 0/1、ISO 串，只有 binary 保持 `Uint8Array`）。
- 触发：`createTables(EntityTypes, seedEntities)` 的种子行含 `binary` 属性（当前核心种子均为文本，插件 `createInitialRows` 贡献可触达）→ 连接期 SQL 语法错误。
- 建议：`get_sql_with_params` 对 `Uint8Array` 输出 `X'hex'` 字面量，或在该内联路径显式拒绝 binary。

## 风险/未覆盖

该包依赖各后端真实 SQLite 引擎才能完全验证；本轮未执行 coverage-acceptance，且 Nx daemon EPERM/Node 版本限制阻止了统一门禁。

## 建议验证

执行 `pnpm nx run rxdb-adapter-sqlite-core:typecheck`、`pnpm nx run rxdb-adapter-sqlite-core:coverage-acceptance`，并分别用 wa-sqlite、官方 sqlite-wasm、sqliteai、Electron/Tauri host 跑共享套件。
