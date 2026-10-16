# Review：rxdb-adapter-pglite

## 结论

🟢 首轮 P1 已修复并经二次评审复核；当前无剩余问题。

## 检查范围

检查了 `package.json` 的 PGlite、encrypted 和可选 tree peer、`project.json` 的串行 test/test-node 配置、README；走读 `PGliteClient.ts`、`RxDBAdapterPGlite.ts`、`change-pipeline.ts`、query/repository/table/transaction/version、backup/restore、keyring 和 FTS 代码，并核对 `src/__tests__/**`（事务、通知背压、序列、分支、备份、加密、树/关系和 query cache）。

## 已处理（二次评审复核）

### P1：关系 JOIN SQL 将关联实体主键硬编码为 `id` — 已修复

- 原证据：`src/query/join_sql.ts` 的 `handle_one_to_many_join`、`handle_to_one_join`、`handle_many_to_many_join` 直接拼接 `prevAlias."id"` / `"${uniqueAlias}"."id"`，自定义主键 `columnName` 时关系 JOIN 访问不存在的列。
- 修复：`join_sql.ts:23-24` 新增 `get_primary_key_column(metadata)`，三处 JOIN 的 `on` 两侧均按各自实体的 metadata 解析物理主键列（`join_sql.ts:249、272、296、310`）；一侧来源 `sourceMetadata` 为当前关系步的源实体、另一侧 `mappedRelation.metadata` 为目标实体，嵌套路径下 `prevAlias` 恰好对应当前步源实体，语义正确。
- 回归：`src/__tests__/query/join_sql.spec.ts` 新增自定义主键（`parent_key` / `child_key`）+ 1:m 与 m:1 双向 JOIN 断言。二次评审在 Node 26.7 下运行该 spec（`vitest run src/__tests__/query/join_sql.spec.ts --browser.enabled=false`）：**8/8 通过**；`typecheck` 通过。

## 风险/未覆盖

PGlite WASM、OPFS AHP worker 和浏览器 IndexedDB 的真实版本组合未执行（本 worktree 的 `test` browser runner 因 @vitest/browser-playwright 环境崩溃，与首轮记录一致）；部分系统迁移/备份测试受宿主能力和测试环境影响。

## 建议验证

在 Chromium OPFS AHP、多 tab IndexedDB 和真实备份恢复环境复验 `pnpm nx test rxdb-adapter-pglite`。
