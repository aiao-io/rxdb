-- ============================================
-- dev-rxdb-supabase：关系数据的推拉同步演示（US-227）
-- ============================================
-- 阶段 A：客户 1—n 订单 1—n 订单项。删客户级联删订单，删订单级联删订单项。
-- 阶段 B：订单项 n—n 分类，中间表 "DemoCategory_DemoOrderItem" 按 US-228 的契约建表。全部表都登记同步（未分区日志）。
-- 实体在 apps/dev-rxdb-supabase/src/app/orders/order-entities.ts，本地在多对一一侧声明同样的 ON DELETE CASCADE。
--
-- 已登录身份共享全部行：Alice 与 Bob 读写同一批订单，演示的是外键关系的推拉，不是按身份授权（那一套见 catalog-demo.sql）。
-- anon 没有任何表权限：生产权限下 anon 不能推送，也读不到未分区日志，访客的这些实体只存本地（demo-sync-overrides.ts）。
-- 由 docker/init-db.sh 与 CI 的 .github/actions/supabase 在 01～04 之后、生产权限脚本之前加载；幂等，没有种子数据。
--
-- 演示专用、不是生产写法：真实应用按所有者或租户写 RLS，见 website/docs/adapters/supabase.md「业务表 RLS 推荐策略」。
-- ============================================

CREATE TABLE IF NOT EXISTS public.demo_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  "createdBy" varchar,
  "updatedBy" varchar
);

CREATE TABLE IF NOT EXISTS public.demo_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number varchar NOT NULL,
  "customerId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  "createdBy" varchar,
  "updatedBy" varchar,
  CONSTRAINT "demo_orders_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES public.demo_customers (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_demo_orders_customerId" ON public.demo_orders ("customerId");

CREATE TABLE IF NOT EXISTS public.demo_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "productName" varchar NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  "orderId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  "createdBy" varchar,
  "updatedBy" varchar,
  CONSTRAINT "demo_order_items_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES public.demo_orders (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_demo_order_items_orderId" ON public.demo_order_items ("orderId");

CREATE TABLE IF NOT EXISTS public.demo_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  "createdBy" varchar,
  "updatedBy" varchar
);

-- 订单项—分类的中间表，表名即 RxDB 生成的中间表实体名（两端实体名排序后拼接）。US-228 的契约：
-- id 唯一（客户端按两端派生，推送按它定位行），两端外键 NOT NULL + ON DELETE CASCADE 并作主键
-- （PostgREST 只把外键在主键里的表认作多对多中间表），删掉任一端时关联行随之删掉
CREATE TABLE IF NOT EXISTS public."DemoCategory_DemoOrderItem" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "categoriesId" uuid NOT NULL,
  "orderItemsId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  "createdBy" varchar,
  "updatedBy" varchar,
  PRIMARY KEY ("categoriesId", "orderItemsId"),
  CONSTRAINT "DemoCategory_DemoOrderItem_id_key" UNIQUE (id),
  CONSTRAINT "DemoCategory_DemoOrderItem_categoriesId_fkey"
    FOREIGN KEY ("categoriesId") REFERENCES public.demo_categories (id) ON DELETE CASCADE,
  CONSTRAINT "DemoCategory_DemoOrderItem_orderItemsId_fkey"
    FOREIGN KEY ("orderItemsId") REFERENCES public.demo_order_items (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_DemoCategory_DemoOrderItem_orderItemsId"
  ON public."DemoCategory_DemoOrderItem" ("orderItemsId");

-- 行级安全：已登录身份读写全部行（Alice 与 Bob 共享数据）。策略也覆盖 UPDATE：US-038 的延迟列补写要用它。
-- 先收回再授权：01 / 03 的整库授权与 Supabase 的默认权限都会把表权限放给 anon
ALTER TABLE public.demo_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demo_customers_shared ON public.demo_customers;
CREATE POLICY demo_customers_shared ON public.demo_customers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.demo_customers FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_customers TO authenticated;

ALTER TABLE public.demo_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demo_orders_shared ON public.demo_orders;
CREATE POLICY demo_orders_shared ON public.demo_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.demo_orders FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_orders TO authenticated;

ALTER TABLE public.demo_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demo_order_items_shared ON public.demo_order_items;
CREATE POLICY demo_order_items_shared ON public.demo_order_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.demo_order_items FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_order_items TO authenticated;

ALTER TABLE public.demo_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demo_categories_shared ON public.demo_categories;
CREATE POLICY demo_categories_shared ON public.demo_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.demo_categories FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_categories TO authenticated;

ALTER TABLE public."DemoCategory_DemoOrderItem" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "DemoCategory_DemoOrderItem_shared" ON public."DemoCategory_DemoOrderItem";
CREATE POLICY "DemoCategory_DemoOrderItem_shared" ON public."DemoCategory_DemoOrderItem"
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public."DemoCategory_DemoOrderItem" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."DemoCategory_DemoOrderItem" TO authenticated;

-- 登记同步：装上同步触发器与 updatedAt 触发器，推送被外键拒绝时 dependsOn 才能指回父实体
SELECT public.rxdb_enable_sync_for_table('demo_customers', 'public', 'DemoCustomer');
SELECT public.rxdb_enable_sync_for_table('demo_orders', 'public', 'DemoOrder');
SELECT public.rxdb_enable_sync_for_table('demo_order_items', 'public', 'DemoOrderItem');
SELECT public.rxdb_enable_sync_for_table('demo_categories', 'public', 'DemoCategory');
SELECT public.rxdb_enable_sync_for_table('DemoCategory_DemoOrderItem', 'public', 'DemoCategory_DemoOrderItem');
