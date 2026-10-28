# rxdb-adapter-supabase 深度评审

评审日期：2026-10-28；源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。本报告按风险追踪公开入口与关键调用链，未声称逐行覆盖全部源码。

验证口径：区分源码实证、原函数局部执行与真实后端运行。统一 Nx 校验结果见 [包级索引](README.md)；未运行的浏览器、真机或 Rust 宿主测试不计为通过。

## 结论与范围

🟡凑合：远端列名、分页、RLS 和批量写约束已有清晰分界；关系子查询里的组合条件仍可能被静默改写。确定问题 1 条。

| 评审重点              | 源码入口                                                                                                                                                                                                                                                                | 当前判断                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Repository 与列名合同 | [`SupabaseRepository`](../../../packages/rxdb-adapter-supabase/src/SupabaseRepository.ts)、[`transform_row_to_entity`](../../../packages/rxdb-adapter-supabase/src/transform.ts)                                                                                        | 主键按 columnName，其余远端字段按属性名；与 README 对照，未复报旧列名问题 |
| 查询编译              | [`apply_rule_group` / `apply_nested_conditions`](../../../packages/rxdb-adapter-supabase/src/rule_group_builder.ts)                                                                                                                                                     | 发现 SUP-001                                                              |
| 树、分页与 namespace  | [`SupabaseTreeRepository`](../../../packages/rxdb-adapter-supabase/src/SupabaseTreeRepository.ts)、[`select_all_pages`](../../../packages/rxdb-adapter-supabase/src/pagination.ts)、[`resolveEntityScope`](../../../packages/rxdb-adapter-supabase/src/entity_scope.ts) | 非空主键判定、稳定顺序与作用域解析已抽查                                  |
| 生命周期与批量 RPC    | [`RxDBAdapterSupabase.connect` / `disconnect` / `mutations` / `saveMany`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts)                                                                                                                           | 订阅变更串行；批量自定义主键在发请求前显式拒绝                            |

## 确定问题

### SUP-001 · P2 · exists 子查询内的 OR 被编译成 AND

**证据与根因。** [`apply_rule_group`](../../../packages/rxdb-adapter-supabase/src/rule_group_builder.ts) 在顶层区分 `and`/`or`；但 `apply_exists_rule` 进入 `apply_nested_conditions` 后，后者直接遍历 `where.rules`，对叶子逐个调用 `apply_field_filter`，对分组只递归，没有读取 `where.combinator`。

**触发步骤。** 查询“存在标题为 A 或 B 的 posts”：

```ts
{ combinator: 'and', rules: [{ field: 'posts', operator: 'exists', where: {
  combinator: 'or', rules: [{ field: 'title', operator: '=', value: 'A' }, { field: 'title', operator: '=', value: 'B' }]
} }] }
```

预期关联条件 `title = A OR title = B`；实际生成 `not(posts,is,null)`、`eq(posts.title,A)`、`eq(posts.title,B)`，等价于要求同一标题同时为两个不同值，返回空集。

**验证。** 用 Node `stripTypeScriptTypes` 执行当前 `rule_group_builder.ts` 的原函数，注入只记录调用的 PostgREST builder 与最小关系元数据，实际输出：

```json
[
  ["not", "posts", "is", null],
  ["eq", "posts.title", "A"],
  ["eq", "posts.title", "B"]
]
```

这是查询编译层的原函数执行证据；未连接真实 Supabase 服务。已检查顶层 OR 的专门路径，缺陷限于关系子查询，不泛化为“全部 OR 不支持”。

**影响。** 合法关系过滤静默漏行，嵌套更深的 OR 同样受影响；与已明示拒绝的“顶层 OR 中包含关系过滤”和“notExists 带 where”不同。

**修复与回归。** 用同一 AST 编译关系作用域内的布尔分组；PostgREST 无法表达的组合应发请求前显式报错，不能变成 AND。加入 exists 下直接 OR、AND 包 OR、多层关系及对应实际服务验收，至少断言 builder 生成的逻辑结构。

## 已文档化限制与验证边界

`saveMany`/`mutations` 不支持自定义主键物理列；`saveMany` 分组写本身不是跨组原子事务。它们已经公开说明，不计新增缺陷。此次未验证真实 RLS 策略、Realtime 重连、RPC 的 PostgreSQL 权限配置；本地 mock 通过不能替代服务端验收。

## 调用链交叉核查

通过当前 `apply_rule_group` 的完整公开编译入口再次传入 exists→OR，记录到 not(posts,is,null) 后两个连续 eq，SUP-001 保留。顶层 OR 中关系过滤及带 where 的 notExists 有显式拒绝，不能把它们当作同一个静默编译缺陷。字符串过滤使用 ilike 是站点文档公开的后端映射，本轮不另加一条仅据实现差异推断的缺陷。

## 本次 Nx 校验

本次 `rxdb-adapter-supabase:test`：620 passed (620)；目标实际执行。命令及整体边界见[总索引](README.md)。
