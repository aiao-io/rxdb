---
id: RV-060
title: Supabase QueryCache 元数据查询丢失关系上下文
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
baseline: b7edef590051c8842d4914e30e31475977dea6ac
---

# RV-060：Supabase QueryCache 元数据查询丢失关系上下文

## 问题与影响

**P2，确认，待修。** 两个测试 User 没有 Order。普通 Supabase 仓储执行相同合法条件：`orders exists` 返回 0，`orders notExists` 返回 2；标量主键条件也正常。`fetchMetadata('shop:User', where)` 却在发送查询前报 `Relation 'orders' not found in 'unknown'`。

真实 QueryCache 公开 `entityManager.getRepository(User).findAll(...)` 也传播该异常，关系读不能完成。不是断网、RLS 拒绝或缺失 User/Order 定义；复验采用生成的 `UserStaticTypes` 验证条件形状。限制只覆盖本轮实际测到的顶层 AND 下 exists/notExists，不把 translator 明确拒绝的关系 OR 或带 where 的 notExists 也算作新缺陷。

## 根因

[RxDBAdapterSupabase.fetchMetadata](../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts)：594–595 行只 select `id, updatedAt`，调用 `apply_rule_group(query, queryFilter)` 时没传 metadata/schemaManager，也没建立关系 SELECT。

[apply_exists_rule](../../packages/rxdb-adapter-supabase/src/rule_group_builder.ts) 的 313–315 行需要 `metadata.relationMap`；[普通 SupabaseRepository.find](../../packages/rxdb-adapter-supabase/src/SupabaseRepository.ts) 则构建关系 select 并传这两份上下文（85–89 行）。相同 RuleGroup 经由两条读入口时语义分叉。

[QueryCacheEngine](../../packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts) 在 658–670 行把 metadata 查询放入实际读管线，错误不会被当作正常空集合，最终阻断公开仓储调用。

## 实际复验

[复验与对照](../../packages/rxdb-adapter-supabase/src/__tests__/review-querycache-relations.spec.ts) 使用原 RxDB/插件/QueryCache/wa-sqlite、Chromium 中真实 Wasm 和 SDK、隔离 CI PostgreSQL/PostgREST：

1. 两个新 User、无关联 Order；普通仓储和标量 metadata 主键集合一致。
2. exists 和 notExists：普通仓储分别 0/2 行；对应两个 metadata 测试均失败在缺关系上下文。
3. 先用既有物理表原语把同一份远端行写进实际本地表，确认本地仓储能读回 2 行；公开 QueryCache 的 notExists 查询仍报同一异常。这个对照用于排除另一个 namespace 落库缺陷，不冒充正常 QueryCache 冷启动已通过。

[最终聚焦日志](evidence/2026-10-05/supabase/supabase-delivery-focused.txt) / [最终整包日志](evidence/2026-10-05/supabase/supabase-delivery-all-tests.txt)。本项对应三条失败用例；标量 metadata/普通查询、实际物理落库为成功对照。

## 修复方向

将普通查询与 metadata 查询的关系选择、别名/外键消歧及 metadata/schemaManager 解析收敛到同一条构造路径。只给 `apply_rule_group` 补第三个参数还不够：PostgREST 关系过滤还需要实际 embedding/select。保留 id/updatedAt 的轻量投影与明确不支持的组合边界。

补正向有关联、负向无关联、嵌套 AND、点号路径、查询结果与 metadata 主键集合一致性，以及真实 QueryCache 本地读最终结果；不能 catch 后返回空元数据，也不能把配置/规则错误改判离线。

## 解决记录

- [x] 普通仓储/metadata/公开 QueryCache 三条路径对照。
- [ ] 统一关系查询上下文和 SELECT，补实际远端及缓存回归。
