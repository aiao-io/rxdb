-- ============================================
-- Supabase 测试数据库初始化脚本
-- ============================================
-- 用途: 创建测试所需的业务表、树查询函数和测试 schema
-- 使用: ./init-db.sh 或 ./reset.sh
-- 说明: 字段名以实体属性名为准，避免适配器写入时出现列名不匹配
-- ============================================

CREATE SCHEMA IF NOT EXISTS shop;

-- ============================================
-- 1. Todo 表
-- ============================================
CREATE TABLE IF NOT EXISTS public.todos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title varchar NOT NULL,
    completed boolean DEFAULT false,
    "createdAt" timestamptz(3) DEFAULT now(),
    "updatedAt" timestamptz(3) DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar
);

CREATE INDEX IF NOT EXISTS idx_todo_completed ON public.todos(completed);
CREATE INDEX IF NOT EXISTS idx_todo_created_at ON public.todos("createdAt");

-- ============================================
-- 2. TypeDemo 表
-- ============================================
CREATE TABLE IF NOT EXISTS public.type_demo (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    uuid uuid,
    string varchar,
    number numeric,
    integer integer,
    boolean boolean,
    date timestamptz(3),
    enum varchar CHECK (enum IN ('active', 'inactive', 'pending')),
    "stringArray" varchar[],
    "numberArray" numeric[],
    "keyValue" jsonb,
    json jsonb,
    "createdAt" timestamptz(3) DEFAULT now(),
    "updatedAt" timestamptz(3) DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar
);

CREATE INDEX IF NOT EXISTS idx_type_demo_created_at ON public.type_demo("createdAt");

-- ============================================
-- 3. MenuLarge 树表
-- ============================================
CREATE TABLE IF NOT EXISTS public.menu_large (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title varchar NOT NULL,
    "sortOrder" varchar,
    "parentId" uuid,
    "createdAt" timestamptz(3) DEFAULT now(),
    "updatedAt" timestamptz(3) DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar,
    CONSTRAINT menu_large_parentId_fkey
      FOREIGN KEY ("parentId") REFERENCES public.menu_large(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_menu_large_parent_id ON public.menu_large("parentId");
CREATE INDEX IF NOT EXISTS idx_menu_large_sort_order ON public.menu_large("sortOrder");
-- MenuLarge 声明的 `parent_title`（unique + normalized，RXT-016）：同级重名由数据库拦，与本地适配器按元数据
-- 建的同名索引同一口径 —— `COALESCE` 让根节点（"parentId" IS NULL）也可比，`lower()` 对齐树形 UI 不分大小写的
-- 同级重名判定。缺这条时远端写得进重复的同级菜单，拉回本地却被本地唯一约束拒绝（RV-01a1bbd2927b）。
-- 已有库里若残留重复的同级菜单，这条会建不出来：先清掉重复行或 ./reset.sh 后再初始化。
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_large_parent_title
  ON public.menu_large (lower(COALESCE(CAST("parentId" AS TEXT), '')), lower(COALESCE(CAST(title AS TEXT), '')));

-- ============================================
-- 4. Shop schema 业务表
-- ============================================
CREATE TABLE IF NOT EXISTS shop."user" (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar NOT NULL,
  "idCardId" uuid,
    married boolean DEFAULT false,
    age numeric DEFAULT 25,
    gender varchar DEFAULT '男',
    "createdAt" timestamptz(3) DEFAULT now(),
    "updatedAt" timestamptz(3) DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar
);

CREATE TABLE IF NOT EXISTS shop.id_card (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code varchar NOT NULL,
    "ownerId" uuid NOT NULL,
    "createdAt" timestamptz(3) DEFAULT now(),
    "updatedAt" timestamptz(3) DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar,
    CONSTRAINT id_card_code_key UNIQUE (code),
    CONSTRAINT id_card_ownerId_key UNIQUE ("ownerId"),
    CONSTRAINT id_card_ownerId_fkey
      FOREIGN KEY ("ownerId") REFERENCES shop."user"(id) ON DELETE CASCADE
);

ALTER TABLE shop."user"
  DROP CONSTRAINT IF EXISTS user_idCardId_fkey;

ALTER TABLE shop."user"
  ADD CONSTRAINT user_idCardId_fkey
  FOREIGN KEY ("idCardId") REFERENCES shop.id_card(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS shop."order" (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number varchar NOT NULL,
    amount numeric NOT NULL,
    status varchar DEFAULT 'pending',
    "ownerId" uuid NOT NULL,
    "createdAt" timestamptz(3) DEFAULT now(),
    "updatedAt" timestamptz(3) DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar,
    CONSTRAINT order_number_key UNIQUE (number),
    CONSTRAINT order_ownerId_fkey
      FOREIGN KEY ("ownerId") REFERENCES shop."user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shop.category (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar NOT NULL,
    "createdAt" timestamptz(3) DEFAULT now(),
    "updatedAt" timestamptz(3) DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar
);

CREATE TABLE IF NOT EXISTS shop.product (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar NOT NULL,
    description varchar,
    "createdAt" timestamptz(3) DEFAULT now(),
    "updatedAt" timestamptz(3) DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar
);

CREATE TABLE IF NOT EXISTS shop.sku (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code varchar NOT NULL,
    price numeric NOT NULL,
    stock integer NOT NULL,
    "productId" uuid NOT NULL,
    "createdAt" timestamptz(3) DEFAULT now(),
    "updatedAt" timestamptz(3) DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar,
    CONSTRAINT sku_code_key UNIQUE (code),
    CONSTRAINT sku_productId_fkey
      FOREIGN KEY ("productId") REFERENCES shop.product(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shop.attribute (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar NOT NULL,
    "createdAt" timestamptz(3) DEFAULT now(),
    "updatedAt" timestamptz(3) DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar
);

CREATE TABLE IF NOT EXISTS shop.attribute_value (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar NOT NULL,
    "attributeId" uuid NOT NULL,
    "createdAt" timestamptz(3) DEFAULT now(),
    "updatedAt" timestamptz(3) DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar,
    CONSTRAINT attribute_value_attributeId_fkey
      FOREIGN KEY ("attributeId") REFERENCES shop.attribute(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shop.sku_attributes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "skuId" uuid NOT NULL,
    "attributeId" uuid NOT NULL,
    "valueId" uuid NOT NULL,
    "createdAt" timestamptz(3) DEFAULT now(),
    "updatedAt" timestamptz(3) DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar,
    CONSTRAINT sku_attributes_skuId_fkey
      FOREIGN KEY ("skuId") REFERENCES shop.sku(id) ON DELETE CASCADE,
    CONSTRAINT sku_attributes_attributeId_fkey
      FOREIGN KEY ("attributeId") REFERENCES shop.attribute(id) ON DELETE CASCADE,
    CONSTRAINT sku_attributes_valueId_fkey
      FOREIGN KEY ("valueId") REFERENCES shop.attribute_value(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shop.order_item (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "productName" varchar NOT NULL,
    quantity numeric NOT NULL,
    price numeric NOT NULL,
    "orderId" uuid NOT NULL,
    "skuId" uuid,
    "createdAt" timestamptz(3) DEFAULT now(),
    "updatedAt" timestamptz(3) DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar,
    CONSTRAINT order_item_orderId_fkey
      FOREIGN KEY ("orderId") REFERENCES shop."order"(id) ON DELETE CASCADE,
    CONSTRAINT order_item_skuId_fkey
      FOREIGN KEY ("skuId") REFERENCES shop.sku(id) ON DELETE SET NULL
);

-- 多对多中间表按实体形状建表（US-228 的 DDL 契约）：`id uuid` 唯一并带时间戳列（中间表实体继承 EntityBase，
-- 推送按 id 定位行），两端外键 NOT NULL + ON DELETE CASCADE 并作主键，登记同步（第 7 节）。主键必须是两端外键：
-- PostgREST 只把「外键在主键里」的表认作多对多中间表，主键换成 id 之后跨中间表的嵌入查询就找不到关系。
-- 客户端的关联行 id 由两端 id 确定性派生（uuid v5，见 website/docs/adapters/supabase.md「多对多中间表」），
-- 两个客户端关联同一对只落成一行；服务端不带 id 直写时取 gen_random_uuid()
CREATE TABLE IF NOT EXISTS shop."Category_OrderItem" (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    "categoriesId" uuid NOT NULL,
    "orderItemsId" uuid NOT NULL,
    "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
    "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar,
    PRIMARY KEY ("categoriesId", "orderItemsId"),
    CONSTRAINT "Category_OrderItem_id_key" UNIQUE (id),
    CONSTRAINT Category_OrderItem_categoriesId_fkey
      FOREIGN KEY ("categoriesId") REFERENCES shop.category(id) ON DELETE CASCADE,
    CONSTRAINT Category_OrderItem_orderItemsId_fkey
      FOREIGN KEY ("orderItemsId") REFERENCES shop.order_item(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shop."Category_Product" (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    "categoriesId" uuid NOT NULL,
    "productsId" uuid NOT NULL,
    "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
    "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar,
    PRIMARY KEY ("categoriesId", "productsId"),
    CONSTRAINT "Category_Product_id_key" UNIQUE (id),
    CONSTRAINT Category_Product_categoriesId_fkey
      FOREIGN KEY ("categoriesId") REFERENCES shop.category(id) ON DELETE CASCADE,
    CONSTRAINT Category_Product_productsId_fkey
      FOREIGN KEY ("productsId") REFERENCES shop.product(id) ON DELETE CASCADE
);

-- 已有库里的旧形状（没有 id 与时间戳列）迁到契约形状，可重复执行：补列、id 唯一、主键是两端外键。
-- 已有的关联行拿到随机 id，与客户端派生的 id 不同：客户端再关联同一对时撞主键（23505），处理办法见迁移文档
DO $$
DECLARE
  v_junction record;
  v_relation regclass;
  v_primary_key text;
  v_primary_columns text[];
BEGIN
  FOR v_junction IN
    SELECT *
    FROM (VALUES ('Category_OrderItem', 'categoriesId', 'orderItemsId'), ('Category_Product', 'categoriesId', 'productsId'))
      AS junction(name, first_key, second_key)
  LOOP
    v_relation := pg_catalog.format('shop.%I', v_junction.name)::regclass;
    EXECUTE pg_catalog.format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid()', v_relation);
    EXECUTE pg_catalog.format(
      'ALTER TABLE %s ADD COLUMN IF NOT EXISTS "createdAt" timestamptz(3) NOT NULL DEFAULT now()', v_relation
    );
    EXECUTE pg_catalog.format(
      'ALTER TABLE %s ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz(3) NOT NULL DEFAULT now()', v_relation
    );
    EXECUTE pg_catalog.format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS "createdBy" varchar', v_relation);
    EXECUTE pg_catalog.format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS "updatedBy" varchar', v_relation);

    -- 推送按 id 定位行（rxdb_batch_upsert 的 ON CONFLICT (id)），id 要有唯一约束
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = v_relation AND conname = v_junction.name || '_id_key'
    ) THEN
      EXECUTE pg_catalog.format('ALTER TABLE %s ADD CONSTRAINT %I UNIQUE (id)', v_relation, v_junction.name || '_id_key');
    END IF;

    SELECT constraint_row.conname, pg_catalog.array_agg(attribute.attname::text ORDER BY attribute.attname)
    INTO v_primary_key, v_primary_columns
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = constraint_row.conrelid AND attribute.attnum = ANY(constraint_row.conkey)
    WHERE constraint_row.conrelid = v_relation AND constraint_row.contype = 'p'
    GROUP BY constraint_row.conname;
    IF v_primary_columns IS DISTINCT FROM ARRAY[v_junction.first_key, v_junction.second_key] THEN
      IF v_primary_key IS NOT NULL THEN
        EXECUTE pg_catalog.format('ALTER TABLE %s DROP CONSTRAINT %I', v_relation, v_primary_key);
      END IF;
      EXECUTE pg_catalog.format(
        'ALTER TABLE %s ADD PRIMARY KEY (%I, %I)', v_relation, v_junction.first_key, v_junction.second_key
      );
    END IF;
    -- 两端已是主键，早先迁到 id 主键时加的成对唯一约束多余
    EXECUTE pg_catalog.format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', v_relation, v_junction.name || '_pair_key');
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_id_card_owner_id ON shop.id_card("ownerId");
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_id_card_id ON shop."user"("idCardId") WHERE "idCardId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_owner_id ON shop."order"("ownerId");
CREATE INDEX IF NOT EXISTS idx_order_status ON shop."order"(status);
CREATE INDEX IF NOT EXISTS idx_order_item_order_id ON shop.order_item("orderId");
CREATE INDEX IF NOT EXISTS idx_order_item_sku_id ON shop.order_item("skuId");
CREATE INDEX IF NOT EXISTS idx_category_name ON shop.category(name);
CREATE INDEX IF NOT EXISTS idx_sku_product_id ON shop.sku("productId");
CREATE INDEX IF NOT EXISTS idx_attribute_value_attribute_id ON shop.attribute_value("attributeId");
CREATE UNIQUE INDEX IF NOT EXISTS uq_attribute_value_attribute_identity ON shop.attribute_value("attributeId", id);
CREATE INDEX IF NOT EXISTS idx_sku_attributes_sku_id ON shop.sku_attributes("skuId");
CREATE INDEX IF NOT EXISTS idx_sku_attributes_attribute_id ON shop.sku_attributes("attributeId");
CREATE INDEX IF NOT EXISTS idx_sku_attributes_value_id ON shop.sku_attributes("valueId");
-- RXT-011：一个 SKU 上同一个属性只能有一行。与 shop/SKUAttributes.ts 的 `sku_attribute`
-- 索引同口径；本地适配器由实体元数据建表，Supabase 走这份 SQL，两边必须一致。
-- 用 CREATE UNIQUE INDEX 而不是 ALTER TABLE ADD CONSTRAINT：上面的建表语句是
-- IF NOT EXISTS，已经存在的库不会重跑，只有这里能把约束补给它们。
CREATE UNIQUE INDEX IF NOT EXISTS uq_sku_attributes_sku_attribute ON shop.sku_attributes("skuId", "attributeId");
CREATE UNIQUE INDEX IF NOT EXISTS uq_id_card_owner_identity ON shop.id_card(id, "ownerId");

ALTER TABLE shop.sku_attributes
  DROP CONSTRAINT IF EXISTS sku_attributes_attribute_value_consistency_fkey;

ALTER TABLE shop.sku_attributes
  ADD CONSTRAINT sku_attributes_attribute_value_consistency_fkey
  FOREIGN KEY ("attributeId", "valueId") REFERENCES shop.attribute_value("attributeId", id);

ALTER TABLE shop."user"
  DROP CONSTRAINT IF EXISTS user_id_card_owner_consistency_fkey;

ALTER TABLE shop."user"
  ADD CONSTRAINT user_id_card_owner_consistency_fkey
  FOREIGN KEY ("idCardId", id) REFERENCES shop.id_card(id, "ownerId");
CREATE INDEX IF NOT EXISTS idx_category_order_item_order_item_id ON shop."Category_OrderItem"("orderItemsId");
CREATE INDEX IF NOT EXISTS idx_category_product_product_id ON shop."Category_Product"("productsId");

-- ============================================
-- 5. MenuLarge 树查询 RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.get_descendants(root_id uuid, max_level integer DEFAULT 100)
RETURNS TABLE(
  id uuid,
  title varchar,
  "sortOrder" varchar,
  "parentId" uuid,
  "createdAt" timestamptz(3),
  "updatedAt" timestamptz(3),
  "createdBy" varchar,
  "updatedBy" varchar,
  "hasChildren" boolean,
  level integer
)
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE tree AS (
    SELECT
      m.id,
      m.title,
      m."sortOrder",
      m."parentId",
      m."createdAt",
      m."updatedAt",
      m."createdBy",
      m."updatedBy",
      0::integer AS level
    FROM public.menu_large m
    WHERE m.id = root_id

    UNION ALL

    SELECT
      child.id,
      child.title,
      child."sortOrder",
      child."parentId",
      child."createdAt",
      child."updatedAt",
      child."createdBy",
      child."updatedBy",
      tree.level + 1
    FROM public.menu_large child
    JOIN tree ON child."parentId" = tree.id
    WHERE tree.level < GREATEST(COALESCE(max_level, 100), 0)
  )
  SELECT
    tree.id,
    tree.title,
    tree."sortOrder",
    tree."parentId",
    tree."createdAt",
    tree."updatedAt",
    tree."createdBy",
    tree."updatedBy",
    EXISTS (SELECT 1 FROM public.menu_large child WHERE child."parentId" = tree.id) AS "hasChildren",
    tree.level
  FROM tree
  ORDER BY tree.level, tree."createdAt", tree.id;
$$;

CREATE OR REPLACE FUNCTION public.get_root_descendants(max_level integer DEFAULT 100)
RETURNS TABLE(
  id uuid,
  title varchar,
  "sortOrder" varchar,
  "parentId" uuid,
  "createdAt" timestamptz(3),
  "updatedAt" timestamptz(3),
  "createdBy" varchar,
  "updatedBy" varchar,
  "hasChildren" boolean,
  level integer
)
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE tree AS (
    SELECT
      m.id,
      m.title,
      m."sortOrder",
      m."parentId",
      m."createdAt",
      m."updatedAt",
      m."createdBy",
      m."updatedBy",
      0::integer AS level
    FROM public.menu_large m
    WHERE m."parentId" IS NULL

    UNION ALL

    SELECT
      child.id,
      child.title,
      child."sortOrder",
      child."parentId",
      child."createdAt",
      child."updatedAt",
      child."createdBy",
      child."updatedBy",
      tree.level + 1
    FROM public.menu_large child
    JOIN tree ON child."parentId" = tree.id
    WHERE tree.level < GREATEST(COALESCE(max_level, 100), 0)
  )
  SELECT
    tree.id,
    tree.title,
    tree."sortOrder",
    tree."parentId",
    tree."createdAt",
    tree."updatedAt",
    tree."createdBy",
    tree."updatedBy",
    EXISTS (SELECT 1 FROM public.menu_large child WHERE child."parentId" = tree.id) AS "hasChildren",
    tree.level
  FROM tree
  ORDER BY tree.level, tree."createdAt", tree.id;
$$;

CREATE OR REPLACE FUNCTION public.get_ancestors(node_id uuid, max_level integer DEFAULT 100)
RETURNS TABLE(
  id uuid,
  title varchar,
  "sortOrder" varchar,
  "parentId" uuid,
  "createdAt" timestamptz(3),
  "updatedAt" timestamptz(3),
  "createdBy" varchar,
  "updatedBy" varchar,
  "hasChildren" boolean,
  level integer
)
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE tree AS (
    SELECT
      m.id,
      m.title,
      m."sortOrder",
      m."parentId",
      m."createdAt",
      m."updatedAt",
      m."createdBy",
      m."updatedBy",
      0::integer AS level
    FROM public.menu_large m
    WHERE m.id = node_id

    UNION ALL

    SELECT
      parent.id,
      parent.title,
      parent."sortOrder",
      parent."parentId",
      parent."createdAt",
      parent."updatedAt",
      parent."createdBy",
      parent."updatedBy",
      tree.level + 1
    FROM public.menu_large parent
    JOIN tree ON tree."parentId" = parent.id
    WHERE tree.level < GREATEST(COALESCE(max_level, 100), 0)
  )
  SELECT
    tree.id,
    tree.title,
    tree."sortOrder",
    tree."parentId",
    tree."createdAt",
    tree."updatedAt",
    tree."createdBy",
    tree."updatedBy",
    EXISTS (SELECT 1 FROM public.menu_large child WHERE child."parentId" = tree.id) AS "hasChildren",
    tree.level
  FROM tree
  ORDER BY tree.level, tree."createdAt", tree.id;
$$;

-- ============================================
-- 6. updatedAt 触发器
-- ============================================
DO $$
DECLARE
  public_tables text[] := ARRAY['todos', 'type_demo', 'menu_large'];
  shop_tables text[] := ARRAY[
    'user',
    'id_card',
    'order',
    'order_item',
    'category',
    'product',
    'sku',
    'attribute',
    'attribute_value',
    'sku_attributes'
  ];
  t text;
BEGIN
  -- `CREATE OR REPLACE TRIGGER`（PG 14+）而不是 DROP + CREATE：后者会对全库的
  -- auth.*/realtime.* 表加 AccessExclusiveLock，详见 01-rxdb-system-tables.sql。
  FOREACH t IN ARRAY public_tables LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      'update_' || t || '_updated_at',
      t
    );
  END LOOP;

  FOREACH t IN ARRAY shop_tables LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER %I BEFORE UPDATE ON shop.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      'update_' || t || '_updated_at',
      t
    );
  END LOOP;
END $$;

-- ============================================
-- 7. 启用 RxDB Sync (Change Tracking)
-- ============================================
DO $$
BEGIN
  IF pg_catalog.to_regprocedure('public.rxdb_enable_sync_for_table(text,text,text)') IS NOT NULL THEN
    PERFORM public.rxdb_enable_sync_for_table('todos', 'public', 'Todo');
    PERFORM public.rxdb_enable_sync_for_table('type_demo', 'public', 'TypeDemo');
    PERFORM public.rxdb_enable_sync_for_table('menu_large', 'public', 'MenuLarge');
    PERFORM public.rxdb_enable_sync_for_table('user', 'shop', 'User');
    PERFORM public.rxdb_enable_sync_for_table('id_card', 'shop', 'IdCard');
    PERFORM public.rxdb_enable_sync_for_table('order', 'shop', 'Order');
    PERFORM public.rxdb_enable_sync_for_table('order_item', 'shop', 'OrderItem');
    PERFORM public.rxdb_enable_sync_for_table('category', 'shop', 'Category');
    PERFORM public.rxdb_enable_sync_for_table('product', 'shop', 'Product');
    PERFORM public.rxdb_enable_sync_for_table('sku', 'shop', 'SKU');
    PERFORM public.rxdb_enable_sync_for_table('attribute', 'shop', 'Attribute');
    PERFORM public.rxdb_enable_sync_for_table('attribute_value', 'shop', 'AttributeValue');
    PERFORM public.rxdb_enable_sync_for_table('sku_attributes', 'shop', 'SKUAttributes');
    -- 多对多中间表（US-228）：实体名就是中间表名
    PERFORM public.rxdb_enable_sync_for_table('Category_OrderItem', 'shop', 'Category_OrderItem');
    PERFORM public.rxdb_enable_sync_for_table('Category_Product', 'shop', 'Category_Product');
  END IF;
END $$;

-- ============================================
-- 8. 禁用 RLS 并授权（仅测试环境）
-- ============================================
DO $$
DECLARE
  public_tables text[] := ARRAY['todos', 'type_demo', 'menu_large'];
  shop_tables text[] := ARRAY[
    'user',
    'id_card',
    'order',
    'order_item',
    'category',
    'product',
    'sku',
    'attribute',
    'attribute_value',
    'sku_attributes',
    'Category_OrderItem',
    'Category_Product'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY public_tables LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;

  FOREACH t IN ARRAY shop_tables LOOP
    EXECUTE format('ALTER TABLE IF EXISTS shop.%I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ============================================
-- 9. US-218 RLS 回归夹具表（rls_todos）
-- ============================================
-- 真实 RLS 策略的 todos 镜像：仅用于 B3/B4 真实链路与 e2e 验证被拒推送回执；
-- 不纳入第 8 节“禁用 RLS”范围，必须保持启用（非 FORCE）。
CREATE TABLE IF NOT EXISTS public.rls_todos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title varchar NOT NULL,
    completed boolean DEFAULT false,
    "createdAt" timestamptz(3) DEFAULT now(),
    "updatedAt" timestamptz(3) DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar
);

CREATE INDEX IF NOT EXISTS idx_rls_todos_completed ON public.rls_todos(completed);
CREATE INDEX IF NOT EXISTS idx_rls_todos_created_by ON public.rls_todos("createdBy");

CREATE OR REPLACE TRIGGER update_rls_todos_updated_at
  BEFORE UPDATE ON public.rls_todos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.rls_todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_todos_select ON public.rls_todos;
CREATE POLICY rls_todos_select ON public.rls_todos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS rls_todos_insert ON public.rls_todos;
CREATE POLICY rls_todos_insert ON public.rls_todos
  FOR INSERT WITH CHECK ("createdBy" = auth.uid()::text);

DROP POLICY IF EXISTS rls_todos_update ON public.rls_todos;
CREATE POLICY rls_todos_update ON public.rls_todos
  FOR UPDATE USING ("createdBy" = auth.uid()::text);

DROP POLICY IF EXISTS rls_todos_delete ON public.rls_todos;
CREATE POLICY rls_todos_delete ON public.rls_todos
  FOR DELETE USING ("createdBy" = auth.uid()::text);

DO $$
BEGIN
  IF pg_catalog.to_regprocedure('public.rxdb_enable_sync_for_table(text,text,text)') IS NOT NULL THEN
    PERFORM public.rxdb_enable_sync_for_table('rls_todos', 'public', 'RlsTodo');
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rls_todos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rls_todos TO authenticated;

-- ============================================
-- 10. US-218 阶段 B 不可归类错误夹具表（rls_unique_probe）
-- ============================================
-- 仅用于 T042 真实链路验证 23505（唯一键冲突）在 rxdb_mutations 的「不可归类，整批
-- 失败」路径下原样传播（contracts/rxdb-mutations-receipts.md §5-6）。不能复用
-- rls_todos/todos：INSERT/UPDATE 都委托给 rxdb_batch_upsert，它对主键 id 走
-- `ON CONFLICT (id) DO UPDATE`，同 id 重复插入天然幂等（这正是 AC#15 需要的行为），
-- 永远不会因为 id 冲突抛 23505；必须有一列独立于 id 的 UNIQUE 约束才能真正制造
-- 不可归类的唯一键冲突。不开 RLS（与 todos/type_demo 一致），按文件末尾的
-- `GRANT ALL ON ALL TABLES IN SCHEMA public` 统一授权。
-- `createdBy`/`updatedBy` 两列必须有：`build_merge_changes_payload`（见
-- supabase.merge-changes.ts）对所有走 mergeChanges 的 INSERT 载荷无条件写入这两个
-- 字段，列不存在会在 `rxdb_batch_upsert` 的 `ON CONFLICT ... DO UPDATE SET` 里报
-- 42703（undefined column），而不是本夹具要制造的 23505。
CREATE TABLE IF NOT EXISTS public.rls_unique_probe (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "uniqueSlug" varchar NOT NULL UNIQUE,
    "createdBy" varchar,
    "updatedBy" varchar
);

-- ============================================
-- 11. 零散收尾项第 8 条：mutations() 直写路径 UPDATE 语义复现夹具表
-- ============================================
-- 复现 US-220 症状 2 / 症状 3 是否同样命中 `RxDBAdapterSupabase.mutations()`
-- （仓库 save() 直写，`options.update` 整实体进 `p_upserts`，走
-- `INSERT … ON CONFLICT DO UPDATE`）。策略形状照搬 US-220 SQL 回归的
-- rls_update_owner / rls_update_shared（见
-- packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql），
-- 但落成 public 持久表：mutations() 的复现走 vitest 真实链路
-- （spec：mutations-update-rls-repro.spec.ts），回归 SQL 的事务内夹具表对它不可见。
--
-- 归属列必须叫 `createdBy`：mutations() 的 update 载荷是「整实体去掉 createdBy」
-- （build_upsert_params mode='update'），若用 owner 之类的列名，整实体载荷带着
-- owner 原值，症状 2 的 FOR ALL 策略会直接放行，复现不出。这与 US-220 故事
-- 「按 createdBy 判定归属的策略必然命中这一条」的结论一致。
-- 保持 RLS 启用（非 FORCE），与 rls_todos 同理，不纳入第 8 节「禁用 RLS」范围。

-- 11a. owner 型：FOR ALL USING/WITH CHECK (createdBy = auth.uid())（US-220 症状 2 的形状）
CREATE TABLE IF NOT EXISTS public.rls_mutations_owner (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title varchar NOT NULL,
    completed boolean DEFAULT false,
    "createdAt" timestamptz(3) DEFAULT now(),
    "updatedAt" timestamptz(3) DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar
);

CREATE OR REPLACE TRIGGER update_rls_mutations_owner_updated_at
  BEFORE UPDATE ON public.rls_mutations_owner
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.rls_mutations_owner ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_mutations_owner_all ON public.rls_mutations_owner;
CREATE POLICY rls_mutations_owner_all ON public.rls_mutations_owner
  FOR ALL
  USING ("createdBy" = auth.uid()::text)
  WITH CHECK ("createdBy" = auth.uid()::text);

-- 11b. 共享编辑型：SELECT 全放行、INSERT 限本人、UPDATE 不设限（US-220 症状 3 的形状）
CREATE TABLE IF NOT EXISTS public.rls_mutations_shared (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title varchar NOT NULL,
    completed boolean DEFAULT false,
    "createdAt" timestamptz(3) DEFAULT now(),
    "updatedAt" timestamptz(3) DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar
);

CREATE OR REPLACE TRIGGER update_rls_mutations_shared_updated_at
  BEFORE UPDATE ON public.rls_mutations_shared
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.rls_mutations_shared ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_mutations_shared_select ON public.rls_mutations_shared;
CREATE POLICY rls_mutations_shared_select ON public.rls_mutations_shared
  FOR SELECT USING (true);
DROP POLICY IF EXISTS rls_mutations_shared_insert ON public.rls_mutations_shared;
CREATE POLICY rls_mutations_shared_insert ON public.rls_mutations_shared
  FOR INSERT WITH CHECK ("createdBy" = auth.uid()::text);
DROP POLICY IF EXISTS rls_mutations_shared_update ON public.rls_mutations_shared;
CREATE POLICY rls_mutations_shared_update ON public.rls_mutations_shared
  FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS rls_mutations_shared_delete ON public.rls_mutations_shared;
CREATE POLICY rls_mutations_shared_delete ON public.rls_mutations_shared
  FOR DELETE USING (true);

DO $$
BEGIN
  IF pg_catalog.to_regprocedure('public.rxdb_enable_sync_for_table(text,text,text)') IS NOT NULL THEN
    PERFORM public.rxdb_enable_sync_for_table('rls_mutations_owner', 'public', 'RlsMutationsOwner');
    PERFORM public.rxdb_enable_sync_for_table('rls_mutations_shared', 'public', 'RlsMutationsShared');
  END IF;
END $$;

-- ============================================
-- 12. 拉取游标提交顺序复现夹具（RV-01a1c49dee517814adf2e68788ad084e）
-- ============================================
-- 仅供 pull-commit-order.spec.ts 走真实链路。PostgREST 一个 RPC 一个事务，测试没法把事务挂着不提交，
-- 只能让函数自己拖住提交：rxdb_test_slow_todo_insert 直写 todos（同步触发器记日志），
-- 睡 p_hold_seconds 秒才返回，模拟「先拿到日志 id、晚提交」的直写事务。
-- rxdb_test_change_id_seq_last_value 读日志序列的当前值：序列不受事务可见性约束，
-- 慢事务一拿到 id 测试就读得到，据此确认它已写下日志，不靠猜等待时长。序列从没取过值时返回 0。
CREATE OR REPLACE FUNCTION public.rxdb_test_slow_todo_insert(
    p_id uuid,
    p_title text,
    p_hold_seconds double precision
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO public.todos (id, title) VALUES (p_id, p_title);
  PERFORM pg_catalog.pg_sleep(p_hold_seconds);
END;
$$;

CREATE OR REPLACE FUNCTION public.rxdb_test_change_id_seq_last_value()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM public.rxdb_change_id_seq;
$$;

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA shop TO anon;
GRANT USAGE ON SCHEMA shop TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA shop TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA shop TO authenticated;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA shop TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA shop TO authenticated;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ============================================
-- 13. US-036 规则之外的公开数据：商品目录夹具（catalog_items）与公开视图（catalog_items_public）
-- ============================================
-- 分区实体（US-033）：公开商品在 public 区，租户内部商品在 tenant:<tenantId> 区，区由生成列 rxdb_bucket 算，
-- 能读哪些区由 RLS 按 rxdb_caller_buckets() 裁决。默认的 caller buckets 不含租户区，租户内部商品只有
-- service_role 读得到；dev-rxdb-supabase 的演示 SQL 在此之上补租户、成员与成员的写权限。
-- 公开视图（US-036）只含公开行、不含成本价，给只读浏览实体走 QueryCache。用 security_invoker：沿用业务表的
-- RLS 与列权限；定义者权限的视图绕过这两层，Supabase Advisor 报 security_definer_view（ERROR）。
-- 放在文件末尾：上面的整库 GRANT 每次初始化都会把表级权限放宽，anon 的列权限要在它之后收。
CREATE TABLE IF NOT EXISTS public.catalog_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar NOT NULL,
    category varchar NOT NULL,
    price numeric(12, 2) NOT NULL DEFAULT 0,
    cost numeric(12, 2),
    visibility varchar NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'tenant')),
    "tenantId" varchar NOT NULL,
    "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
    "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
    "createdBy" varchar,
    "updatedBy" varchar,
    rxdb_bucket text GENERATED ALWAYS AS (
        CASE WHEN visibility = 'public' THEN 'public' ELSE 'tenant:' || "tenantId" END
    ) STORED
);

CREATE INDEX IF NOT EXISTS idx_catalog_items_bucket_id ON public.catalog_items (rxdb_bucket, id);
CREATE INDEX IF NOT EXISTS idx_catalog_items_category_name ON public.catalog_items (category, name);

ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;

-- 读：按区放行（与文档「配置 caller buckets」的业务表策略同一写法）。客户端没有写策略，写入只经 service_role
DROP POLICY IF EXISTS catalog_items_select_by_bucket ON public.catalog_items;
CREATE POLICY catalog_items_select_by_bucket ON public.catalog_items
  FOR SELECT USING (rxdb_bucket = ANY((SELECT public.rxdb_caller_buckets())::text[]));

SELECT public.rxdb_enable_sync_for_table('catalog_items', 'public', 'CatalogItem');

CREATE OR REPLACE VIEW public.catalog_items_public WITH (security_invoker = true) AS
  SELECT id, name, category, price, "tenantId", "createdAt", "updatedAt", "createdBy", "updatedBy"
  FROM public.catalog_items
  WHERE visibility = 'public';

-- anon 读不到成本价：收回表级权限，按列授予。同步与浏览都只取有列权限的列
REVOKE ALL ON public.catalog_items FROM anon;
GRANT SELECT (
  id, name, category, price, visibility, "tenantId", "createdAt", "updatedAt", "createdBy", "updatedBy", rxdb_bucket
) ON public.catalog_items TO anon;
REVOKE ALL ON public.catalog_items_public FROM anon, authenticated;
GRANT SELECT ON public.catalog_items_public TO anon, authenticated;
