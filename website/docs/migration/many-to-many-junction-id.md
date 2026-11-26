# 多对多关联行的确定性 id

US-228 之前，多对多关联推不上 Supabase：连接实体带 `id` 与时间戳列，远端的中间表却是两列复合主键、没有 `id`，推送以 `42703` 失败，关联一直停在待推。关联行的 `id` 也是随机生成的，两个客户端关联同一对会各生成一行。

现在：

| 变化                   | 说明                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 关联行 id              | 由两端 id 派生（uuid v5，`junctionEntityId`），与从哪一端、在哪个客户端关联无关；取消之后重新关联还是同一个 id                                                       |
| 已在库里、没加载的一对 | 再 `add()` 并保存不报主键冲突：本地适配器（SQLite 系与 PGlite）插入连接行时遇到同 id 的行保留它；新建连接行一律走批量写（`EntityManager.create` 对连接实体同样如此） |
| 连接表的同步配置       | 跟随两端：任一端只在本地或不同步时，连接表也是；连接表不能被 `syncOverrides` 直接覆盖                                                                                |
| 远端中间表             | 按契约建表：`id uuid` 唯一、时间戳列、两端外键作主键且 `ON DELETE CASCADE`，并登记同步，见 <a href="/docs/adapters/supabase#多对多中间表">Supabase 适配器的多对多中间表</a>     |

## 升级顺序

1. **迁移远端中间表**（在登记同步之前）。补列、给 `id` 加唯一约束；主键保持两端外键（PostgREST 靠它识别多对多）：

   ```sql
   ALTER TABLE shop."Category_OrderItem"
     ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
     ADD COLUMN IF NOT EXISTS "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
     ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
     ADD COLUMN IF NOT EXISTS "createdBy" varchar,
     ADD COLUMN IF NOT EXISTS "updatedBy" varchar;
   ALTER TABLE shop."Category_OrderItem" ADD CONSTRAINT "Category_OrderItem_id_key" UNIQUE (id);
   ```

   仓库的 `docker/sql/03-business-tables.sql` 对 shop 的两张中间表做的就是这件事，可以重复执行。

2. **把已有行的 id 改成派生 id**。客户端此前推不上中间表，远端的已有行都是服务端写的，一次性改掉，之后客户端关联同一对推上来的是同一个 id：

   ```sql
   UPDATE shop."Category_OrderItem"
   SET id = extensions.uuid_generate_v5(
     '9fb02b21-84d4-40f2-8847-bb5c3878b0e0',
     'rxdb-junction:v1:shop.Category_OrderItem|categoriesId=' || "categoriesId" || '|orderItemsId=' || "orderItemsId"
   );
   ```

   外键按属性名排序拼接，uuid 是小写（`uuid::text` 本就是小写）。不改的话，客户端再关联同一对时撞主键（`23505`），这类错误不可归类，那一批推送整批失败。

3. **登记同步**：`SELECT public.rxdb_enable_sync_for_table('Category_OrderItem', 'shop', 'Category_OrderItem');`。登记之后再改 `id` 会记成一条换了行 id 的修改，所以第 2 步放在前面。

4. **升级客户端**。升级之前在本机关联、一直推不上去的那些行还是随机 id，升级之后会照原 id 推上去；远端已有同一对时撞主键，整批失败。对这些关联取消关联、再重新关联一次（换成派生 id），或者清掉本地库重新同步。

## 服务端直写

服务端自己写关联行时用同一个公式算 `id`（见 <a href="/docs/adapters/supabase#多对多中间表">Supabase 适配器的多对多中间表</a>）。不带 `id` 直写时取 `gen_random_uuid()`，只适合客户端不会再关联的那些对。
