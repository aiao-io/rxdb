# Review：rxdb-adapter-pglite

## 结论

🔴 发现 1 个 P1，涉及关系 JOIN 对自定义主键列的处理。

## 检查范围

检查了 `package.json` 的 PGlite、encrypted 和可选 tree peer、`project.json` 的串行 test/test-node 配置、README；走读 `PGliteClient.ts`、`RxDBAdapterPGlite.ts`、`change-pipeline.ts`、query/repository/table/transaction/version、backup/restore、keyring 和 FTS 代码，并核对 `src/__tests__/**`（事务、通知背压、序列、分支、备份、加密、树/关系和 query cache）。

## 发现

### P1：关系 JOIN SQL 将关联实体主键硬编码为 `id`

- 证据：`src/query/join_sql.ts:231-312` 的 `handle_one_to_many_join`、`handle_to_one_join`、`handle_many_to_many_join` 均直接拼接 `prevAlias."id"` 或 `"${uniqueAlias}"."id"`（242、265、288、302 行）。同包普通查询已通过 `resolve_column_name()`（`src/query/query_sql.ts:120-137`）和 metadata 解析物理列名，sqlite-core 的同类 JOIN 也调用 `get_primary_key_column()`。
- 影响：RxDB 元数据允许实体主键属性 `id` 设置自定义 `columnName`，但关系过滤/排序触发 JOIN 时仍访问不存在的 `id` 列，导致 PostgreSQL 报列不存在或关系条件不匹配。当前 `test-column-name.spec.ts` 只覆盖普通属性/外键的 columnName，未覆盖自定义主键 + 一对一/一对多/多对多 JOIN。
- 建议：在 join context 中携带每个 alias 对应的 `EntityMetadata`，统一用 `propertyMap.get('id')?.columnName ?? 'id'`（或共用主键解析函数）生成两侧主键列；补三种关系和嵌套路径的自定义主键集成测试。

## 风险/未覆盖

除上述 JOIN 主键问题外，PGlite WASM、OPFS AHP worker 和浏览器 IndexedDB 的真实版本组合未在本轮执行；部分系统迁移/备份测试受宿主能力和测试环境影响。

## 建议验证

执行 `pnpm nx run rxdb-adapter-pglite:typecheck`、`pnpm nx test rxdb-adapter-pglite`、`pnpm nx run rxdb-adapter-pglite:test-node`，并在 Chromium OPFS AHP、多 tab IndexedDB 和真实备份恢复环境复验。
