---
id: RV-046
title: 树查询增量把被筛选祖先隔断的叶子加入结果
status: Open
severity: P2
created: 2026-10-04
updated: 2026-10-04
baseline: 8b29b549ac5758b2e31a6148b98b8c394754e918
---

# RV-046：树查询增量把被筛选祖先隔断的叶子加入结果

## 问题

🔴 **P2，确认问题，待修复。** 三节点有效树：visible-root→hidden-parent→hidden-child。订阅森林后代查询、where title contains visible；把叶子改成 visible-child 后，订阅增量结果包含它，但同一时点实际 SQL 重查仍只有根节点。父节点也匹配条件的对照一致。

## 根因

[SQLite 递归 SQL](../../packages/rxdb-adapter-sqlite-core/src/query/query_tree_sql.ts) 第 125–176 行在递归项应用 where，未匹配的中间节点会截断遍历。过滤结果因此不能当作完整祖先索引。

[TreeHelper.isEntityDescendant](../../packages/rxdb-plugin-tree/src/query/tree-helper.ts) 第 100–117 行在 targetEntityId=null 时，遇到查询缓存中没有的 parent 便 break，但仍返回 isDescendant=true。[handleFindDescendantsUpdate](../../packages/rxdb-plugin-tree/src/query/merge-update-tree.ts) 第 248–263 行把 newlyMatched 叶子据此直接加入结果。未知祖先路径被当作已确定可达，忽略了 SQL 的遍历筛选。

## 复验

[真实官方 SQLite-WASM / RxDB 订阅 spec](../../packages/rxdb-adapter-sqlite/src/__tests__/review-tree-filter-incremental.spec.ts) 使用现有真实 adapter 工厂、实体 save、树 repository observable，与同一 adapter 原生 findDescendants SQL 重查比较。

**1 failed / 1 passed**：[日志](evidence/2026-10-04/tree-devtools/tree-filter-incremental-sqlite-linked.txt)。不匹配父节点时 live=`[visible-child,visible-root]`，SQL=`[visible-root]`；父节点匹配时两者均为三个节点。没有写原始 SQL 模拟更新事件。

初次 0 tests 是新增 spec 的 tree workspace devDependency 未声明，已经通过 pnpm workspace 命令真实链接，未补 tsconfig 假路径。PGlite 的同类最初复验被 RV-045 阻断，不宣称该增量序列已在两种 SQL 后端都复现。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb-adapter-sqlite:test --args='src/__tests__/review-tree-filter-incremental.spec.ts --run --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

## 修复方案

先明确并保持既有查询的遍历/where 契约；过滤/深度截断后的结果不是完整拓扑。增量路径对不能证明的祖先上下文发起现有 task.refresh，让结果回到后端真相，或维护完整、可验证的拓扑索引后再判 membership。不返回猜测的 true，不随意改 SQL 语义让测试碰巧一致。

补根查询/指定根、where/level、父节点变更与多条更新、create/remove、计数/关系条件；修 RV-045 后补 PGlite 同序列。全对象 C2 尚未完成。

## 解决记录

- [x] 真实 SQL 与公开增量结果漂移、正常祖先对照保留。
- [ ] 修正未知祖先上下文判定，复跑多后端/三框架。
- [ ] 当前 Open，业务实现未改。
