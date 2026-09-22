# rxdb-tree 分支代码评审 — 剩余待办

- **分支**：`rxdb-tree`（合并基 `860f882d`）
- 原报告的 F-01…F-16、E1…E7、C1/C2/C3/C5/C6/C7/C9 与规范符合性各项**已修复**，C4/C10 经复核**诊断不成立**，均已从本文件删除。以下是尚未处理的项目。

---

## C8 · 三个 SQL 适配器把「可选」插件变成硬依赖

`rxdb-adapter-pglite`、`rxdb-adapter-sqlite-core`、`rxdb-adapter-supabase` 从 `@aiao/rxdb-plugin-tree` 导入的不只是类型，还有**运行时**的 `assertTreeLevel`：

- `packages/rxdb-adapter-pglite/src/query/query_tree_sql.ts:2`
- `packages/rxdb-adapter-sqlite-core/src/query/query_tree_sql.ts:2`
- `packages/rxdb-adapter-supabase/src/SupabaseTreeRepository.ts:7`

四个适配器的 `package.json` 因此声明了 `"@aiao/rxdb-plugin-tree": "workspace:*"`，「可选插件」对这些适配器的用户成了强制安装，且插件版本与适配器版本可以各走各的。

**修法**：把 `assertTreeLevel` / `TREE_MAX_LEVEL` 这类契约常量挪到双方都依赖的中立位置（核心包或新的契约包），适配器只留类型导入。

**为什么不在本轮做**：会同时改动 `@aiao/rxdb` 与 `@aiao/rxdb-plugin-tree` 两份 api-baseline，属包边界的架构决策，不是可安全机械化的修复。

## PR 说明 · `@aiao/rxdb` 有破坏性导出移除

C1 删掉了 `IRepositoryConfig.mergeOperations` 与 `MergeQueryTaskOptions`（死通道，真正生效的是 `QueryManager.registerMerge*Fn`）。`scripts/audit/api-surface.mjs` 已标记为**破坏性变更**，基线已更新，但合并 PR 时仍需附迁移/breaking note。
