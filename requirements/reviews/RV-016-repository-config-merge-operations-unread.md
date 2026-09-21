---
id: RV-016
title: IRepositoryConfig.mergeOperations 写而不读，两处注册方各塞一份没人取的实现
status: Open # Open / Resolved
created: 2026-09-22
updated: 2026-09-22
pr: # 修复 PR 链接，Resolved 时填
---

# Review：`IRepositoryConfig.mergeOperations` 写而不读

## 问题

[`IRepositoryConfig.mergeOperations`](../../packages/rxdb/src/rxdb.types.ts) 全仓**零读取方**。
写入方两处：

- [`EntityManager`](../../packages/rxdb/src/entity/entity-manager.ts) 构造里注册
  `'Repository'` 时塞了 `{ create: merge_create, update: merge_update, remove: merge_remove }`
- [`rxDBPluginGraph.install()`](../../packages/rxdb-plugin-graph/src/plugin.ts) 注册
  `'GraphRepository'` 时照抄了同一形状

真正决定「某个 task 用哪个 merge」的是
[`QueryManager`](../../packages/rxdb/src/repository/QueryManager.ts) 的
`#query_task_merge_create_map.get(task.type) || merge_create`——按 **task 类型**查表，
键由 `registerMergeCreateFn(taskType, fn)` 写入，与 `IRepositoryConfig` 无关。
`rxdb.repository()` 收下 `mergeOperations` 之后再没人碰它。

US-025 阶段 E 把树搬进 `@aiao/rxdb-plugin-tree` 时，
`TreeRepository` 走的正是 `registerMerge{Create,Update,Remove}Fn` 这条活路径，
**没有**再往 `mergeOperations` 里塞第三份——这个字段现在连「大家都这么写」的惯性都没了。

## 根因

两条机制在不同时期分别落地：`mergeOperations` 是按「仓储级默认实现」设计的，
后来 `QueryManager` 改成按 task 类型分发（同一个仓储的不同查询要用不同 merge，
仓储级的粒度不够），旧字段没跟着删。

`mergeOperations` 是可选字段，塞了也不报错、不塞也不报错，静默地保持了两年。

## 修复方案

二选一，倾向前者：

1. **删掉**。`IRepositoryConfig` 去掉 `mergeOperations`，`MergeQueryTaskOptions`
   退出核心公开面，两处写入方同步清掉。这是公开 API 的破坏性变更，走
   [versioning-policy](../versioning-policy.md) 的废弃流程。
2. **接上**。让 `QueryManager` 在按 task 类型查表落空时，回落到注册该仓储时给的
   `mergeOperations` 而不是模块级 `merge_create`。但这会让「仓储级默认」与
   「task 级覆盖」两层语义共存，收益不明——今天没有任何一个仓储需要
   与核心默认不同的**仓储级**兜底。

选 1 时字段上现有的 TSDoc（已写明「当前没有任何读取方 …… 已记 RV 待裁决」）一并删除。

判据：`grep -rn mergeOperations packages` 在 `packages/**` 下零命中（方案 1），
或至少一条读取（方案 2）。

## 解决记录

- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
