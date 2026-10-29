---
id: RV-084
title: packages 深度评审修复中新发现、尚未处理的问题
status: Open
created: 2026-10-29
updated: 2026-10-29
pr:
---

# Review：packages 深度评审修复中新发现、尚未处理的问题

修 `packages/` 深度评审（2026-10-28 首轮、10-29 更新轮）的 32 个修复点时顺带发现。同一批顺手修掉的不在这里（见 [README 清理记录](README.md#清理记录)），这里只留仍需动作或决策的条目。

## 问题

### P2-1 树 `findDescendants` 带 `level` 时节点上移，新落入层级范围的子孙不补进实时结果

`handleFindDescendantsUpdate`（`packages/rxdb-plugin-tree/src/query/merge-update-tree.ts`）对已在结果里的节点判「保留」后，不再复查它名下子树的深度。复现：`root → a → b → c`，订阅 `findDescendants({ entityId: root, level: 2 })`，把 `b` 改挂到 `root` 下：实时结果 `[root, a, b]`，SQL 重查 `[root, a, b, c]`。`countDescendants` 同场景回 SQL，结果正确。

### P2-2 Supabase：同一层两条独立 `exists` 指向同一关系时被并成同一个嵌入

两条 `exists` 落到同一条 `!inner` 嵌入上，PostgREST 把两组条件当作对同一行关联记录的过滤，语义从「存在一笔满足 A 的、也存在一笔满足 B 的」变成「存在一笔同时满足 A 与 B 的」。真实栈复现：用户有金额 100 与 200 两笔订单，`exists(orders, amount = 100) AND exists(orders, amount = 200)` 返回 `[]`。

### P2-3 React `EntityDetail` 分不出「没有 Provider」与「异步 source 尚未就绪」

`useRxDBOptional()` 两种情况都返回 `undefined`（`packages/rxdb-react/src/rxdb-react.tsx`）。由此：

- create 模式在数据库就绪前点保存：`handleSave` 没有草稿，走透传分支 `onFormSubmitted` + 关闭对话框，记录不落库；Vue 用 `isCreatePending`（有 provider、数据库未就绪、非 `delegateSave`）禁用保存。
- edit 模式没有 Provider 却带 `entityId` 时按未就绪处理（只留取消）；Vue / Angular 在没有数据库时照常透传表单数据。

### P3-1 待核实：Supabase `findAncestors({ entityId: null })` 返回空

静态阅读：Supabase 树仓储全树查祖先返回 `[]`，sqlite-core / PGlite 的 `generate_tree_sql` 返回全部根节点。未在真实栈上运行。

### P3-2 待核实：图查询 SQL 的节点主键列写死 `id`

`packages/rxdb-plugin-graph/src/sqlite/query_graph_sql.ts` 的节点表按 `id` 关联与回填；图实体把主键 `columnName` 改成别的名字时可能查不到节点。未运行复现。

### P3-3 三端 `EntityDetail` / `QueryBuilder` 的剩余行为差异

- Vue 有、Angular / React 没有：编辑目标等待期间的输入覆盖层（`editFormChanges`，就绪后合入并随下次提交落库）；edit 模式 `fixedFormData` 叠加在实例数据上；create 草稿保存（`onSave`）的迟到结果判定；React 换库时清理旧草稿与错误面板。
- 挂载时 Angular / React `QueryBuilder` 各发一次 `queryChange` / `validationChange`，Vue 的 watch 不是 immediate、不发。
- React `SubqueryBuilder` 单独放在 `<Activity>` 下时，重连仍从空查询起步（嵌在 `QueryBuilder` 里由父组件快照恢复，当前内部用法无害）。

## 根因

- P2-1：增量合并对「保留」节点只看它自己是否仍在范围内，层级限制下子树深度随父链变化没有回 SQL 的判据。
- P2-2：嵌入路径按关系名去重，`exists` 规则之间没有各自的别名作用域。
- P2-3：rxdb-react 的 Provider 槽位不对外暴露「有没有 Provider / 是否仍在解析」。

## 修复方案

- P2-1：被保留节点的父链深度变化（上移）且查询带 `level` 时回 SQL，或本地补算其子树。
- P2-2：每条 `exists` 用独立别名嵌入；PostgREST 表达不了的组合在发请求前显式拒绝，不能静默改语义。
- P2-3：先定 rxdb-react 暴露就绪状态的公开 API（与 Vue `injectRxDBRef()`、Angular 注入语义对齐），再把 React `EntityDetail` 的 create / edit 未就绪判据改成与 Vue 同口径。
- P3：先复现再定级；三端差异逐项定「对齐」或「写明为框架差异」。

## 解决记录

- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
