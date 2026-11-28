-- ============================================
-- dev-rxdb-supabase：按身份授权的同步演示（epic-015：US-033 / US-035 / US-036 / US-234）
-- ============================================
-- 在参考夹具 catalog_items 与公开视图 catalog_items_public（docker/sql/03-business-tables.sql 第 13 节）之上补：
--   1. 租户与成员：demo_tenants、demo_tenant_members（带成员权限）
--   2. caller buckets：平台默认的 public 与 user:<uid> 之外，按成员关系补 tenant:<租户 id>
--   3. 成员权限（US-234）：rxdb_caller_grants() 按成员行补 tenant:<租户 id>；管理员 = read + edit + manage，员工 = read。
--      商品的写策略、远端变更历史的可见性都经 rxdb_caller_scopes 读它，三处同口径
--   4. 成员管理：自助加入只拿到 read，演示账号加入自己的默认租户时由服务端授予管理员；改权限与退出只经 RPC，
--      两者守同一个「至少留一个管理员」
--   5. 演示数据：两个租户、四个分类的公开商品与内部商品
-- 由 docker/init-db.sh 与 CI 的 .github/actions/supabase 在 01～04 之后、生产权限脚本之前加载；幂等，
-- 重复执行不覆盖已经改过的演示数据（成员权限也一样；要恢复初始商品见文末的 demo_catalog_reset）。
-- 重新执行 04 会把 rxdb_caller_grants 与 rxdb_caller_can_edit 恢复成平台默认：之后要再加载一次本文件与生产权限脚本。
--
-- 演示专用、不是生产写法：用户可以自己加入或退出任意租户，用来一键模拟「管理员调整了成员关系」。
-- 真实应用由管理员或服务端维护成员表，客户端不能写；成员判断按 website/docs/adapters/supabase.md
-- 「配置 caller buckets」「配置成员权限」放进 SECURITY DEFINER 函数。
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

-- 初始管理员（US-234）：演示账号加入为它登记的租户时，服务端授予管理员。客户端读不到也改不了
CREATE TABLE IF NOT EXISTS public.demo_tenant_initial_admins (
  tenant_id varchar PRIMARY KEY REFERENCES public.demo_tenants (id) ON DELETE CASCADE,
  email text NOT NULL
);

ALTER TABLE public.demo_tenant_initial_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.demo_tenant_initial_admins FROM anon, authenticated;

INSERT INTO public.demo_tenant_initial_admins (tenant_id, email)
VALUES ('xinghe', 'alice@example.com'), ('jiguang', 'bob@example.com')
ON CONFLICT (tenant_id) DO UPDATE SET email = EXCLUDED.email;

-- 成员关系：每个登录身份只看得到自己的成员行。
-- anon 也有 SELECT：rxdb_caller_buckets() / rxdb_caller_grants() 以调用者身份查本表，anon 执行它们时同样要过权限检查（RLS 下零行）
CREATE TABLE IF NOT EXISTS public.demo_tenant_members (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  tenant_id varchar NOT NULL REFERENCES public.demo_tenants (id) ON DELETE CASCADE,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_demo_tenant_members_tenant ON public.demo_tenant_members (tenant_id);

-- 成员权限（US-234）：epic-015 的六项，缺省只有 read。列第一次加上时，已有的成员关系按初始管理员登记补成管理员，
-- 其余是员工；之后重复执行不再改动任何人的权限
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.demo_tenant_members'::regclass AND attname = 'permissions' AND NOT attisdropped
  ) THEN
    ALTER TABLE public.demo_tenant_members ADD COLUMN permissions text[] NOT NULL DEFAULT ARRAY['read']::text[];
    UPDATE public.demo_tenant_members AS member
    SET permissions = ARRAY['read', 'edit', 'manage']::text[]
    FROM public.demo_tenant_initial_admins AS admin
    JOIN auth.users AS account ON account.email = admin.email
    WHERE admin.tenant_id = member.tenant_id AND account.id = member.user_id;
  END IF;
END $$;

ALTER TABLE public.demo_tenant_members DROP CONSTRAINT IF EXISTS demo_tenant_members_permissions_check;
ALTER TABLE public.demo_tenant_members ADD CONSTRAINT demo_tenant_members_permissions_check CHECK (
  permissions <@ ARRAY['read', 'edit', 'comment', 'review', 'merge', 'manage']::text[] AND 'read' = ANY(permissions)
);

-- 演示账号加入为它登记的租户时授予管理员。SECURITY DEFINER：要读 auth.users 与初始管理员登记，客户端都读不到
CREATE OR REPLACE FUNCTION public.demo_grant_initial_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.demo_tenant_initial_admins AS admin
    JOIN auth.users AS account ON account.email = admin.email
    WHERE admin.tenant_id = NEW.tenant_id AND account.id = NEW.user_id
  ) THEN
    NEW.permissions := ARRAY['read', 'edit', 'manage']::text[];
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER demo_tenant_members_initial_admin
  BEFORE INSERT ON public.demo_tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.demo_grant_initial_admin();

ALTER TABLE public.demo_tenant_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demo_tenant_members_read_own ON public.demo_tenant_members;
CREATE POLICY demo_tenant_members_read_own ON public.demo_tenant_members
  FOR SELECT USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS demo_tenant_members_join ON public.demo_tenant_members;
CREATE POLICY demo_tenant_members_join ON public.demo_tenant_members
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
-- 退出不开放直接删行：唯一的管理员删掉自己的成员行，租户就没人能再调整成员权限了。退出只经下文的
-- demo_leave_tenant，与改权限同一把租户锁、同一个「至少留一个管理员」
DROP POLICY IF EXISTS demo_tenant_members_leave ON public.demo_tenant_members;
-- 防自我提权：INSERT 只按列授予 tenant_id，不授予 UPDATE。自助加入写不到权限列，拿到的永远是缺省的 read；
-- 改权限只经下文的 demo_set_member_permissions
REVOKE ALL ON public.demo_tenant_members FROM anon, authenticated;
GRANT SELECT ON public.demo_tenant_members TO anon, authenticated;
GRANT INSERT (tenant_id) ON public.demo_tenant_members TO authenticated;

-- 调用者能读的区：public、自己的 user 区，加上所在租户的区。员工照样读得到本租户的区，没有成员行的身份与平台默认完全一致
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

-- 调用者在各作用域上的权限（US-234）：平台默认的 user 区，加上每个成员行的 tenant:<租户 id> 与它的权限。
-- 下面的写策略、rxdb_caller_can_edit 与两个成员 RPC 都经 rxdb_caller_scopes 读它
CREATE OR REPLACE FUNCTION public.rxdb_caller_grants()
RETURNS TABLE (scope text, permissions text[])
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT 'user:' || auth.uid()::text, ARRAY['read', 'edit']::text[]
    WHERE auth.uid() IS NOT NULL
    UNION ALL
    SELECT 'tenant:' || member.tenant_id, member.permissions
    FROM public.demo_tenant_members AS member
    WHERE member.user_id = auth.uid()
    ORDER BY 1
$$;

-- 商品的写权限：在该租户有 edit 的成员能新增、修改、删除本租户的商品（公开或内部），用来模拟「服务端那边改了数据」。
-- 读权限沿用夹具的按区策略。写入经同步触发器记进对应区的日志，其他身份同步时按各自能读的区收到写入或移除
DROP POLICY IF EXISTS catalog_items_member_insert ON public.catalog_items;
CREATE POLICY catalog_items_member_insert ON public.catalog_items
  FOR INSERT TO authenticated
  WITH CHECK (('tenant:' || "tenantId") = ANY((SELECT public.rxdb_caller_scopes('edit'))::text[]));
DROP POLICY IF EXISTS catalog_items_member_update ON public.catalog_items;
CREATE POLICY catalog_items_member_update ON public.catalog_items
  FOR UPDATE TO authenticated
  USING (('tenant:' || "tenantId") = ANY((SELECT public.rxdb_caller_scopes('edit'))::text[]))
  WITH CHECK (('tenant:' || "tenantId") = ANY((SELECT public.rxdb_caller_scopes('edit'))::text[]));
DROP POLICY IF EXISTS catalog_items_member_delete ON public.catalog_items;
CREATE POLICY catalog_items_member_delete ON public.catalog_items
  FOR DELETE TO authenticated
  USING (('tenant:' || "tenantId") = ANY((SELECT public.rxdb_caller_scopes('edit'))::text[]));

-- 远端变更历史的可见性（US-229）：商品的历史只对它所属租户里有 edit 的成员开放，与上面三条写策略同一口径
-- （按 tenantId，不看可见范围：公开商品的修改照样只给本租户能编辑的成员看）。员工看不到。其他实体交回平台默认。
-- 历史按每条记录时的行判定，商品换了租户之后，改动前的历史只对旧租户的成员可见；换租户那一条的前像
-- 也按旧租户判（rxdb_entity_history 分开判两侧），新租户的成员只拿到改动后的一侧
CREATE OR REPLACE FUNCTION public.rxdb_caller_can_edit(p_namespace text, p_entity text, p_row jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT CASE
        WHEN p_namespace = 'public' AND p_entity = 'CatalogItem' THEN
            ('tenant:' || (p_row->>'tenantId')) = ANY(public.rxdb_caller_scopes('edit'))
        ELSE public.rxdb_caller_can_edit_default(p_namespace, p_entity, p_row)
    END
$$;

REVOKE ALL ON FUNCTION public.rxdb_caller_can_edit(text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- 租户至少留一个管理员（US-234）：p_user_id 失去 manage 之后（降权或退出），租户里还要有别的管理员。
-- 改权限与退出共用；调用方先锁租户行，同一租户的这两种操作排队执行，同时互相降权、同时退出都不会一个都不剩
CREATE OR REPLACE FUNCTION public.demo_assert_keeps_manager(p_tenant_id varchar, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.demo_tenant_members AS member
    WHERE member.tenant_id = p_tenant_id AND member.user_id = p_user_id AND 'manage' = ANY(member.permissions)
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.demo_tenant_members AS other
    WHERE other.tenant_id = p_tenant_id AND other.user_id <> p_user_id AND 'manage' = ANY(other.permissions)
  ) THEN
    RAISE EXCEPTION '不能撤掉或退出最后一个管理员：租户 % 至少要留一个管理员', p_tenant_id USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- 改一个成员的权限（US-234）：调用者要在该租户有 manage；权限只能取六项、必须含 read（成员表的 CHECK 兜着）；
-- 不能撤掉最后一个管理员的 manage。先锁租户行：同一租户的改权限与退出排队执行
CREATE OR REPLACE FUNCTION public.demo_set_member_permissions(p_tenant_id varchar, p_user_id uuid, p_permissions text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM public.demo_tenants AS tenant WHERE tenant.id = p_tenant_id FOR UPDATE;
  IF NOT (('tenant:' || p_tenant_id) = ANY(public.rxdb_caller_scopes('manage'))) THEN
    RAISE EXCEPTION '只有租户 % 的管理员才能调整成员权限', p_tenant_id USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1
  FROM public.demo_tenant_members AS member
  WHERE member.tenant_id = p_tenant_id AND member.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '用户 % 不是租户 % 的成员', p_user_id, p_tenant_id USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT ('manage' = ANY(p_permissions)) THEN
    PERFORM public.demo_assert_keeps_manager(p_tenant_id, p_user_id);
  END IF;

  UPDATE public.demo_tenant_members AS member
  SET permissions = p_permissions
  WHERE member.tenant_id = p_tenant_id AND member.user_id = p_user_id;
END;
$$;

-- 退出租户（US-234）：删掉调用者自己的成员行。与改权限同一把租户锁、同一个不变量：最后一个管理员不能退出，
-- 先把别人升为管理员再退。不是成员时什么都不做
CREATE OR REPLACE FUNCTION public.demo_leave_tenant(p_tenant_id varchar)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '退出租户要先登录' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM 1 FROM public.demo_tenants AS tenant WHERE tenant.id = p_tenant_id FOR UPDATE;
  PERFORM public.demo_assert_keeps_manager(p_tenant_id, auth.uid());
  DELETE FROM public.demo_tenant_members AS member
  WHERE member.tenant_id = p_tenant_id AND member.user_id = auth.uid();
END;
$$;

-- 列出一个租户的全部成员与权限，只对该租户的管理员开放。邮箱来自 auth.users，匿名用户没有邮箱（null）
CREATE OR REPLACE FUNCTION public.demo_tenant_member_list(p_tenant_id varchar)
RETURNS TABLE (user_id uuid, email text, permissions text[], "createdAt" timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT (('tenant:' || p_tenant_id) = ANY(public.rxdb_caller_scopes('manage'))) THEN
    RAISE EXCEPTION '只有租户 % 的管理员才能查看成员列表', p_tenant_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT member.user_id, account.email::text, member.permissions, member."createdAt"::timestamptz
  FROM public.demo_tenant_members AS member
  LEFT JOIN auth.users AS account ON account.id = member.user_id
  WHERE member.tenant_id = p_tenant_id
  ORDER BY member."createdAt", member.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.demo_grant_initial_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_assert_keeps_manager(varchar, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_set_member_permissions(varchar, uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.demo_leave_tenant(varchar) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.demo_tenant_member_list(varchar) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.demo_set_member_permissions(varchar, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.demo_leave_tenant(varchar) TO authenticated;
GRANT EXECUTE ON FUNCTION public.demo_tenant_member_list(varchar) TO authenticated;

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
