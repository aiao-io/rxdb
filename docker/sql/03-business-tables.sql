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

CREATE TABLE IF NOT EXISTS shop."Category_OrderItem" (
    "categoriesId" uuid NOT NULL,
    "orderItemsId" uuid NOT NULL,
    PRIMARY KEY ("categoriesId", "orderItemsId"),
    CONSTRAINT Category_OrderItem_categoriesId_fkey
      FOREIGN KEY ("categoriesId") REFERENCES shop.category(id) ON DELETE CASCADE,
    CONSTRAINT Category_OrderItem_orderItemsId_fkey
      FOREIGN KEY ("orderItemsId") REFERENCES shop.order_item(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shop."Category_Product" (
    "categoriesId" uuid NOT NULL,
    "productsId" uuid NOT NULL,
    PRIMARY KEY ("categoriesId", "productsId"),
    CONSTRAINT Category_Product_categoriesId_fkey
      FOREIGN KEY ("categoriesId") REFERENCES shop.category(id) ON DELETE CASCADE,
    CONSTRAINT Category_Product_productsId_fkey
      FOREIGN KEY ("productsId") REFERENCES shop.product(id) ON DELETE CASCADE
);

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
