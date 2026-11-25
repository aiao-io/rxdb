---
id: US-228
title: 多对多关联在 Supabase 上可同步：中间表按实体形状建表，关联行 id 由两端确定
status: Backlog
priority: High
epic: epic-004-future-features
created: 2026-11-25
updated: 2026-11-25
tags: [adapter, supabase, sync, relationship, many-to-many, core]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 前置 US-037（中间表依赖两端，排序靠全量级联）；不改同步协议
- [x] Negotiable (可协商): id 的派生公式、已关联未加载时走 upsert 还是报错、旧随机 id 行的迁移办法，留待实现前定
- [x] Valuable (有价值): 今天多对多关联推不上 Supabase，永远停在待推；两个客户端关联同一对数据还会重复
- [x] Estimable (可估算): 核心 id 派生 + 同步类型跟随两端 + 中间表 DDL 契约与迁移 + 真栈用例；三个 PR
- [ ] Small (小): 跨核心、本地适配器与参考 SQL，分三个交付阶段
- [x] Testable (可测试): 核心单测 + 两个客户端的真栈用例
-->

# 用户故事：多对多关联在 Supabase 上可同步

## 作为/我想要/以便

**作为** 用多对多关系建模、同步到 Supabase 的应用开发者
**我想要** 挂上、摘掉关联都能推到远端并同步到其他客户端，两个客户端关联同一对数据时只落成一条
**以便** 多对多关联不再停在本地永远待推，也不会因为并发关联出现重复或卡住推送

## 现状

以下都由读代码得出，第 3 点的失败没有实际执行过。

1. 自动生成的中间表实体带 `id` 主键与时间戳列。[`SchemaManager`](../../../packages/rxdb/src/schema/SchemaManager.ts) 用 `@Entity(metadataOptions) class MappedClass extends EntityBase {}` 生成，`EntityBase` 带 `id`、`createdAt`、`updatedAt`、`createdBy`、`updatedBy`。

2. 远端的中间表是复合主键，没有 `id`（[`03-business-tables.sql`](../../../docker/sql/03-business-tables.sql)）：

   ```sql
   CREATE TABLE IF NOT EXISTS shop."Category_OrderItem" (
       "categoriesId" uuid NOT NULL,
       "orderItemsId" uuid NOT NULL,
       PRIMARY KEY ("categoriesId", "orderItemsId"),
   ```

3. 推送整条路径按 `id` 定位行：载荷是 `{ id: entityId, ...patch }`（`build_merge_changes_payload`），`rxdb_mutations` 取快照用 `WHERE source.id::text = $1`，`rxdb_batch_upsert` 用 `ON CONFLICT (id)`。所以推送中间表行会以 42703 失败（**推断**），这类错误不可归类，变更一直待推。

4. 没有 `id` 的表登记不了同步：`rxdb_log_change_trigger` 读 `NEW.id` / `OLD.id`，登记之后这张表的每一次写入都会报错。shop 的两张中间表也确实没有登记。

5. 关联行的 `id` 随机生成。[`relation-cache.ts`](../../../packages/rxdb/src/entity/relation-cache.ts) 的 `add()`：

   ```ts
   junctionEntity = new createJunctionEntity({
     [foreignKeyA]: entity.id,
     [foreignKeyB]: target.id
   });
   ```

   两个客户端关联同一对数据会各生成一行；远端加了成对唯一约束时，后到的那次以 23505 失败（不可归类，整批卡住）。

6. 中间表的同步配置只能继承库级默认：`syncOverrides` 拒绝没登记在 `entities` 里的类（`unregistered`），所以访客给两端实体设了 `SyncType.None`，中间表仍按库级 `Full` 推拉。

7. 现有的多对多用例（`test-many-to-many.spec.ts`）是 `SyncType.None`，直接读写远端中间表，没有走过推拉。

复验方式：grep 上述符号与建表语句；阶段 C 的真栈用例会把第 3 点变成实测。

## 交付阶段

| 阶段 | 状态 | 交付                                                                                | 必过 AC  | 门禁                                                     |
| ---- | ---- | ----------------------------------------------------------------------------------- | -------- | -------------------------------------------------------- |
| A    | ⬜   | 关联行 id 由两端 id 确定性派生；重新关联复用同一 id；已关联未加载的一对不产生重复行 | AC#1～3  | `rxdb` 覆盖率 ≥ 90%；SQLite 与 PGlite 本地适配器套件通过 |
| B    | ⬜   | 中间表的同步类型跟随两端实体                                                        | AC#4～6  | resolver 单测；不允许 `syncOverrides` 直接指向中间表     |
| C    | ⬜   | 中间表 DDL 契约、shop 中间表迁移与登记、真栈用例与文档                              | AC#7～11 | SQL 回归通过；真栈用例只跑单个文件                       |

**前置**：[US-037](../core/US-037-push-order-by-foreign-key.md)。中间表依赖两端实体，要靠一次全量级联保证两端先到远端。

## 范围边界

### In Scope

- 确定性的关联行 id：由中间表键与两端 id 派生，与从哪一端调用 `add()` 无关。
- `add()` 复用已有的活实例；关联已存在但未加载的一对时走 upsert，不产生第二行。
- 中间表的同步类型：任一端是 `local` / `none` 时，中间表取该端的配置；否则保持库级默认。
- Supabase 中间表 DDL 契约：`id uuid` 主键、时间戳列、两端外键 `NOT NULL` + `ON DELETE CASCADE`、两端成对 `UNIQUE`、登记同步。
- shop 的两张中间表迁到契约形状并登记同步；`test-many-to-many.spec.ts` 的直写照常可用。
- 文档：`adapters/supabase.md`（契约）、`model-definition/relations.md`（id 与关联的幂等）、`collaboration/sync.md`（中间表跟随两端）。

### Out of Scope

- 旧的随机 id 关联行自动迁移：写明人工处理办法（冲突时报 23505），自动迁移另行评估。
- 中间表两端是 `Filter` / `QueryCache` 实体：写明不支持。
- 中间表带额外列（关联上的属性）。

## 验收标准

### 阶段 A：确定性关联行 id

| #   | 前置条件                               | 操作                   | 预期结果                                         | 状态 |
| --- | -------------------------------------- | ---------------------- | ------------------------------------------------ | ---- |
| 1   | 一对订单项与分类                       | 分别从两端调用 `add()` | 两次得到同一个 id（UUID v5）；不同的一对 id 不同 | ⬜   |
| 2   | 一对已关联                             | 取消关联后重新关联     | 仍是同一个 id，本地只有一行                      | ⬜   |
| 3   | 一对已在本地库里关联，但没有加载进内存 | 再次 `add()` 并保存    | 本地仍只有一行，不报主键冲突                     | ⬜   |

### 阶段 B：中间表的同步类型

| #   | 前置条件                                       | 操作                 | 预期结果                      | 状态 |
| --- | ---------------------------------------------- | -------------------- | ----------------------------- | ---- |
| 4   | 两端都通过 `syncOverrides` 设为 `None` + local | 解析中间表的同步类型 | 中间表为 local，不推不拉      | ⬜   |
| 5   | 一端 local，另一端 `Full`                      | 解析                 | 中间表为 local                | ⬜   |
| 6   | 两端都是 `Full`                                | 解析                 | 中间表为 `Full`（与现在一致） | ⬜   |

### 阶段 C：Supabase 契约与真栈

| #   | 前置条件                     | 操作                             | 预期结果                                       | 状态 |
| --- | ---------------------------- | -------------------------------- | ---------------------------------------------- | ---- |
| 7   | 客户端 A、B 都已同步两端实体 | A 关联一对并推送，B 拉取         | B 看到这条关联，id 与 A 相同                   | ⬜   |
| 8   | 同上                         | A、B 同时关联同一对并各自推送    | 远端只有一行，两端都看到这条关联，没有推送失败 | ⬜   |
| 9   | 两端都有这条关联             | A 取消关联并推送，B 拉取         | B 的关联消失                                   | ⬜   |
| 10  | 两端都有这条关联             | A 删除其中一端实体并推送，B 拉取 | 远端中间表行被级联删除；B 的关联也消失         | ⬜   |
| 11  | shop 中间表已迁到契约形状    | 运行 `test-many-to-many.spec.ts` | 直接写中间表（不带 id）照常成功                | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：待实现。AC#1～6 由 `rxdb` 核心单测与本地适配器套件覆盖；AC#7～11 由 `rxdb-adapter-supabase` 真栈用例（`many-to-many-sync.spec.ts`、`test-many-to-many.spec.ts`）覆盖。

## 技术笔记

- **id 公式**：`uuid` v5（`@aiao/rxdb` 已依赖 `uuid@^14`，纯 JS、同步）。名字是 `rxdb-junction:v1:<namespace>.<中间表名>|<键1>=<值1>|<键2>=<值2>`，键按属性名排序；命名空间是固定的协议常量，永不改变。端点主键是 uuid 时值统一转小写（PGlite 存 `uuid`，SQLite 存 TEXT 且区分大小写）。缺任一端 id 直接抛错。
- **自关联多对多**：两个外键名不同，id 天然区分方向。
- **已关联未加载**：中间表创建走现有的 upsert 路径（sqlite-core `generate_entity_insert_sql` 的 `useReplace`、PGlite 的 upsert），重复关联退化为一次更新。
- **同步类型跟随两端**：`createEntitySyncResolver` 加可选的第三个参数 `junctionEndpointsOf`；`SchemaManager` 在生成中间表时记下两端（`junctionEndpointsOf` / `isJunctionEntity`）。中间表取「第一个不可同步的一端」的配置，端点按排序后的顺序取。
- **DDL 契约**：

  ```sql
  CREATE TABLE <schema>."<A>_<B>" (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "<relA>Id" uuid NOT NULL REFERENCES ... ON DELETE CASCADE,
    "<relB>Id" uuid NOT NULL REFERENCES ... ON DELETE CASCADE,
    "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
    "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
    "createdBy" varchar, "updatedBy" varchar,
    UNIQUE ("<relA>Id", "<relB>Id"));
  SELECT public.rxdb_enable_sync_for_table('<A>_<B>', '<schema>', '<A>_<B>');
  ```

  `rxdb_enable_sync_for_table` 会顺带装上 `updatedAt` 触发器。登记之后，一端被删时 US-224 的隐式删除日志也能覆盖中间表行。

- **服务端直写的风险**：服务端自己插中间表行时如果不用派生 id，之后可能与客户端的行撞 23505；可选提供 `rxdb_junction_id(...)`（`uuid_generate_v5`）。
- **shop 迁移**：`ADD COLUMN IF NOT EXISTS` 并给默认值，主键从两列换成 `id` 加成对 `UNIQUE`，登记同步。

## 实现文件

| 阶段 | 路径                                                                     | 说明                                     |
| ---- | ------------------------------------------------------------------------ | ---------------------------------------- |
| A    | `packages/rxdb/src/entity/many-to-many-entity.ts`                        | `junctionEntityId`                       |
| A    | `packages/rxdb/src/entity/relation-cache.ts`                             | `add()` 用派生 id、复用活实例            |
| A    | `packages/rxdb-adapter-sqlite-core/`、`packages/rxdb-adapter-pglite/`    | 中间表创建走 upsert                      |
| B    | `packages/rxdb/src/sync-contract/entity-sync-resolver.ts`                | `junctionEndpointsOf`                    |
| B    | `packages/rxdb/src/schema/SchemaManager.ts`                              | 记录中间表的两端                         |
| C    | `docker/sql/03-business-tables.sql`                                      | shop 中间表迁移与登记                    |
| C    | `packages/rxdb-adapter-supabase/src/__tests__/many-to-many-sync.spec.ts` | 两个客户端的真栈用例                     |
| C    | `website/docs/`                                                          | `supabase.md`、`relations.md`、`sync.md` |

## References

- [US-037 全量推送按外键依赖排序](../core/US-037-push-order-by-foreign-key.md) — 前置
- [US-224 Supabase 推送路径上级联删除的子行不写变更日志](./US-224-supabase-cascade-delete-change-log.md) — 一端被删时中间表行的隐式日志
- [US-227 dev-rxdb-supabase 关系数据的推拉同步演示](./US-227-supabase-relational-sync-demo.md) — 阶段 B 依赖本故事
