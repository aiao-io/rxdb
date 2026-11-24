-- ============================================
-- dev-rxdb-supabase：按身份授权的同步演示（epic-015：US-033 / US-035 / US-036）
-- ============================================
-- 在参考夹具 catalog_items 与公开视图 catalog_items_public（docker/sql/03-business-tables.sql 第 13 节）之上补：
--   1. 租户与成员：demo_tenants、demo_tenant_members
--   2. caller buckets：平台默认的 public 与 user:<uid> 之外，按成员关系补 tenant:<租户 id>
--   3. 成员的写权限：租户成员可以新增、修改、删除本租户的商品（公开或内部），用来模拟「服务端那边改了数据」
--   4. 演示数据：两个租户、四个分类的公开商品与内部商品
-- 由 docker/init-db.sh 与 CI 的 .github/actions/supabase 在 01～04 之后、生产权限脚本之前加载；幂等，
-- 重复执行不覆盖已经改过的演示数据（要恢复初始数据见文末的 demo_catalog_reset）。
--
-- 演示专用、不是生产写法：用户可以自己加入或退出任意租户，用来一键模拟「管理员调整了成员关系」。
-- 真实应用由管理员或服务端维护成员表，客户端不能写；成员判断按 website/docs/adapters/supabase.md
-- 「配置 caller buckets」放进 SECURITY DEFINER 函数。
-- ============================================

CREATE TABLE IF NOT EXISTS public.demo_tenants (
  id varchar PRIMARY KEY,
  name varchar NOT NULL
);

ALTER TABLE public.demo_tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demo_tenants_read ON public.demo_tenants;
CREATE POLICY demo_tenants_read ON public.demo_tenants FOR SELECT USING (true);
REVOKE ALL ON public.demo_tenants FROM anon, authenticated;
GRANT SELECT ON public.demo_tenants TO anon, authenticated;

INSERT INTO public.demo_tenants (id, name)
VALUES ('xinghe', '星河零售'), ('jiguang', '极光百货')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 成员关系：每个登录身份只看得到、只改得了自己的成员行。
-- anon 也有 SELECT：rxdb_caller_buckets() 以调用者身份查本表，anon 角色执行它时同样要过权限检查（RLS 下零行）
CREATE TABLE IF NOT EXISTS public.demo_tenant_members (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  tenant_id varchar NOT NULL REFERENCES public.demo_tenants (id) ON DELETE CASCADE,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_demo_tenant_members_tenant ON public.demo_tenant_members (tenant_id);

ALTER TABLE public.demo_tenant_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demo_tenant_members_read_own ON public.demo_tenant_members;
CREATE POLICY demo_tenant_members_read_own ON public.demo_tenant_members
  FOR SELECT USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS demo_tenant_members_join ON public.demo_tenant_members;
CREATE POLICY demo_tenant_members_join ON public.demo_tenant_members
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS demo_tenant_members_leave ON public.demo_tenant_members;
CREATE POLICY demo_tenant_members_leave ON public.demo_tenant_members
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.demo_tenant_members FROM anon, authenticated;
GRANT SELECT ON public.demo_tenant_members TO anon;
GRANT SELECT, INSERT, DELETE ON public.demo_tenant_members TO authenticated;

-- 调用者能读的区：public、自己的 user 区，加上所在租户的区。没有成员行的身份与平台默认完全一致。
CREATE OR REPLACE FUNCTION public.rxdb_caller_buckets()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT CASE
        WHEN auth.uid() IS NULL THEN ARRAY['public']::text[]
        ELSE ARRAY['public', 'user:' || auth.uid()::text]::text[] || ARRAY(
            SELECT 'tenant:' || member.tenant_id
            FROM public.demo_tenant_members AS member
            WHERE member.user_id = auth.uid()
            ORDER BY member.tenant_id
        )
    END
$$;

-- 成员对本租户商品的写权限（读权限沿用夹具的按区策略）。写入经同步触发器记进对应区的日志，
-- 其他身份同步时按各自能读的区收到写入或移除
DROP POLICY IF EXISTS catalog_items_member_insert ON public.catalog_items;
CREATE POLICY catalog_items_member_insert ON public.catalog_items
  FOR INSERT TO authenticated
  WITH CHECK (('tenant:' || "tenantId") = ANY((SELECT public.rxdb_caller_buckets())::text[]));
DROP POLICY IF EXISTS catalog_items_member_update ON public.catalog_items;
CREATE POLICY catalog_items_member_update ON public.catalog_items
  FOR UPDATE TO authenticated
  USING (('tenant:' || "tenantId") = ANY((SELECT public.rxdb_caller_buckets())::text[]))
  WITH CHECK (('tenant:' || "tenantId") = ANY((SELECT public.rxdb_caller_buckets())::text[]));
DROP POLICY IF EXISTS catalog_items_member_delete ON public.catalog_items;
CREATE POLICY catalog_items_member_delete ON public.catalog_items
  FOR DELETE TO authenticated
  USING (('tenant:' || "tenantId") = ANY((SELECT public.rxdb_caller_buckets())::text[]));

-- 演示数据：id 固定，重复执行只补缺的行，不覆盖演示过程中的修改
CREATE OR REPLACE FUNCTION public.demo_catalog_seed()
RETURNS TABLE (id uuid, name varchar, category varchar, price numeric, cost numeric, visibility varchar, "tenantId" varchar)
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
    VALUES
        ('6f0c3b8e-0000-4000-a000-000000000001'::uuid, '星河 X1 蓝牙耳机'::varchar, '数码'::varchar, 299::numeric, 120::numeric, 'public'::varchar, 'xinghe'::varchar),
        ('6f0c3b8e-0000-4000-a000-000000000002', '星河智能手环', '数码', 199, 80, 'public', 'xinghe'),
        ('6f0c3b8e-0000-4000-a000-000000000003', '星河香薰加湿器', '家居', 159, 60, 'public', 'xinghe'),
        ('6f0c3b8e-0000-4000-a000-000000000004', '《本地优先软件》', '图书', 69, 30, 'public', 'xinghe'),
        ('6f0c3b8e-0000-4000-a000-000000000005', '星河 X2 耳机（工程样机）', '数码', 399, 210, 'tenant', 'xinghe'),
        ('6f0c3b8e-0000-4000-a000-000000000006', '星河加湿器 2027 款（未发布）', '家居', 199, 90, 'tenant', 'xinghe'),
        ('6f0c3b8e-0000-4000-a000-000000000007', '极光坚果礼盒', '食品', 128, 70, 'public', 'jiguang'),
        ('6f0c3b8e-0000-4000-a000-000000000008', '极光冻干咖啡', '食品', 89, 35, 'public', 'jiguang'),
        ('6f0c3b8e-0000-4000-a000-000000000009', '极光记忆棉枕', '家居', 239, 100, 'public', 'jiguang'),
        ('6f0c3b8e-0000-4000-a000-00000000000a', '《RxJS 实战》', '图书', 79, 32, 'public', 'jiguang'),
        ('6f0c3b8e-0000-4000-a000-00000000000b', '极光便携充电宝', '数码', 149, 55, 'public', 'jiguang'),
        ('6f0c3b8e-0000-4000-a000-00000000000c', '极光年货礼盒（内部报价）', '食品', 368, 210, 'tenant', 'jiguang'),
        ('6f0c3b8e-0000-4000-a000-00000000000d', '极光充电宝二代（试产）', '数码', 169, 70, 'tenant', 'jiguang')
$$;

INSERT INTO public.catalog_items (id, name, category, price, cost, visibility, "tenantId")
SELECT seed.id, seed.name, seed.category, seed.price, seed.cost, seed.visibility, seed."tenantId"
FROM public.demo_catalog_seed() AS seed
ON CONFLICT (id) DO NOTHING;

-- 恢复初始演示数据：两个演示租户的商品回到种子状态，演示过程中新增的商品删除；成员关系不动。
-- 只给管理员在库里执行（见 dev-rxdb-supabase 的 README），不授予任何客户端角色
CREATE OR REPLACE FUNCTION public.demo_catalog_reset()
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, pg_temp
AS $$
    DELETE FROM public.catalog_items AS item
    WHERE item."tenantId" IN (SELECT tenant.id FROM public.demo_tenants AS tenant)
      AND item.id NOT IN (SELECT seed.id FROM public.demo_catalog_seed() AS seed);
    INSERT INTO public.catalog_items (id, name, category, price, cost, visibility, "tenantId")
    SELECT seed.id, seed.name, seed.category, seed.price, seed.cost, seed.visibility, seed."tenantId"
    FROM public.demo_catalog_seed() AS seed
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        price = EXCLUDED.price,
        cost = EXCLUDED.cost,
        visibility = EXCLUDED.visibility,
        "tenantId" = EXCLUDED."tenantId";
$$;

REVOKE ALL ON FUNCTION public.demo_catalog_seed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_catalog_reset() FROM PUBLIC, anon, authenticated;
