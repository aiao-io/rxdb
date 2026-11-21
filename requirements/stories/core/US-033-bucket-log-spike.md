# US-033 试验：分区日志带不带正文、是否单独成表

对应故事见 [US-033 按授权分区同步（只读）](US-033-identity-scoped-read-sync.md)。本文记录阶段 A 之前的一次 SQL 试验：比了哪两个方案、各场景的结果、据此定了什么。脚本在文末，全部对象建在一个事务里，结尾回滚，不是参考 SQL，函数名、表名与签名都不是定稿。

## 结论

| 问题               | 结论                                                                     | 依据                        |
| ------------------ | ------------------------------------------------------------------------ | --------------------------- |
| 分区日志带不带正文 | 不带。日志只记「哪个区的哪一行变了」，正文在拉取时按调用者身份从业务表读 | 场景 5、9、10、11 与量级 P4 |
| 是否单独成表       | 单独成表，`rxdb_change` 保持 US-225 的状态                               | 场景 13                     |

## 两个方案

两套日志挂在同一张业务表上，由同一批写入驱动，逐个场景对比。

|          | 方案 M（采用）                                                                | 方案 B（改写前的首版写法）                                     |
| -------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 日志内容 | 区、实体、行 id、操作（写入或移除）                                           | 同左，另带 `before_data` / `after_data`                        |
| 行换区   | 旧区一条「移除」，新区一条「写入」                                            | 旧区一条「移除」并把该行在旧区的历史正文置空，新区一条完整写入 |
| 增量     | `SECURITY INVOKER` 函数：游标之后的日志行按行去重，逐行按主键取业务表的当前行 | 直接读日志表，由 RLS 按区裁决                                  |
| 快照     | 同一套列与筛选，去掉游标条件                                                  | 读业务表                                                       |

## 场景结果

夹具：一张带「公开 / 租户私有」标记的业务表 `article`，成本列 `cost` 不授给 anon。用户 A 在租户 1，B 在租户 2，C 是后来才加入租户 1 的成员。

| #   | 场景                                          | 方案 M                                                                     | 方案 B                                           | US-033 的 AC |
| --- | --------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------ | ------------ |
| 1   | anon 从头拉公开区                             | 只有公开行，行里没有 `cost`                                                | —                                                | 1、5         |
| 2   | anon 拉租户 1 区，并直读日志表                | 零行；日志表里只看得到公开区                                               | —                                                | 1            |
| 3   | A、B 各拉各的租户区                           | 各得各的，行里带 `cost`                                                    | —                                                | 1            |
| 4   | 把 A 加进租户 2，业务行一行没改               | A 能读的区立即多出租户 2 区，快照返回该区的行                              | —                                                | 2            |
| 5   | 公开行改成租户 2 私有                         | anon 用旧游标续拉、从头拉，都只得到不带内容的「移除」；B 得到完整行        | 旧区留下 `INSERT(无正文)`、`REMOVE(无正文)`      | 3            |
| 6   | 远端删除一行                                  | 「移除」                                                                   | —                                                | 4            |
| 7   | 行修改后离开 `category = news`                | 增量返回「移除」，带同一筛选的快照里没有它                                 | —                                                | 7            |
| 8   | `category != news`，有一行 `category` 为 NULL | 快照与增量都包含 NULL 行；同一条件写成 SQL 比较则不包含                    | —                                                | 7            |
| 9   | 改掉一个标题、删掉一行之后，C 从头拉          | 只有现存行的当前值与已删行的「移除」；读到旧标题 0 次、已删行正文 0 次     | 读到旧标题的日志行 2 条、已删行正文的日志行 2 条 | 6            |
| 10  | anon 直读公开区的日志                         | 日志没有正文                                                               | 读到 1 条带 `cost` 的日志行，值为 10             | 5            |
| 11  | 同一行改 100 次                               | 增量返回 1 行，版本号是最后一条日志的 id                                   | 要拉 100 条                                      | —            |
| 12  | 把 A 移出租户 1                               | A 能读的区里没有租户 1 区，拉取零行                                        | —                                                | 2            |
| 13  | 全部写入之后看旧日志表                        | `rxdb_change` 没有这张表的任何行，anon 仍无读权限；新表 RLS 开启并 `FORCE` | —                                                | 8            |

## 量级

一个 2 万行的区。单次运行、本机 docker，不是基准测试，只看数量级。

| 测量                                                    | 结果                       |
| ------------------------------------------------------- | -------------------------- |
| 快照 2 万行，不带筛选                                   | 154 ms                     |
| 快照一页 1000 行                                        | 8 ms                       |
| 快照 2 万行，带筛选（日志求值器逐行求值），命中 5000 行 | 205 ms                     |
| 同一条件写成 SQL 比较                                   | 3 ms                       |
| 改 1000 行之后的增量                                    | 10 ms                      |
| 没有变化时的增量                                        | 0.5 ms                     |
| P4 批量换区 2000 行（每行 6 条历史），方案 M            | 75 ms                      |
| P4 同样的换区，方案 B（置空 12000 条历史正文）          | 201 ms                     |
| 45113 条日志的体积                                      | 方案 M 13 MB，方案 B 24 MB |

## 试验中踩到的实现约束

1. **增量要从变更的行 id 出发，逐行按主键取当前行。** 第一版把「行 id 在这一页里」写成半连接，规划器选了对业务表的全表扫描，并且先对区里每一行求筛选：2 万行的区改 1000 行，增量要 192 ms，而且随区的大小增长。改成 `LEFT JOIN LATERAL` 按主键取行之后是 10 ms。
2. **列清单要按调用者的列权限生成。** 对只授了部分列的角色，整行 `to_jsonb(t)` 会报权限错误。试验用 `has_column_privilege` 取出调用者能读的列再拼查询。
3. **拉取与快照函数声明为 `STABLE`。** 这样函数里的查询共用调用语句的快照，返回的行内容与版本号（该行在这个区里最大的日志 id）是同一时刻的。
4. **anon 需要筛选求值函数的执行权。** [生产权限脚本](../../../docker/sql/production/rxdb-change-grants.sql)把 `rxdb_jsonb_matches_filter` 与 `rxdb_jsonb_matches_rule` 从 anon 收回了；anon 要带规则拉公开区，就得还给它，或者按区拉取另用一套求值。US-033 定为把规则编译成 SQL 条件之后，不再需要这项授权。
5. **新表可以 `FORCE ROW LEVEL SECURITY`。** 隔离栈上日志表与触发器函数的属主是 `postgres`，它有 `BYPASSRLS`，`SECURITY DEFINER` 的触发器照常写入。别的部署要先确认属主角色。
6. **复用日志求值器不是好选择。** 试验在当前行上复用日志求值器：快照与增量自然一致，但 NULL 的结论与 SQL 比较不同（场景 8），逐行求值也比 SQL 比较慢两个数量级。US-033 因此定为把规则编译成 SQL 条件，口径与仓储查询一致。

## 没有验证的

- 客户端的落库规则：来源区、版本号、同步轮次。
- 并发写入下的顺序。试验是单会话；日志 id 等于提交顺序要沿用 `rxdb_change_serialize_append` 的做法。
- 写入路径（US-034）。
- 规则编译成 SQL 条件的写法。试验用的是日志求值器。
- 大于 2 万行的区，以及一次请求带多组（区、实体、游标）的函数形状。

## 复验

先起隔离栈，再把文末「脚本」一节的 SQL 存成文件，从标准输入传给 db 容器（`docker ps` 里名字以 `rxdb-supabase-db-` 开头的那个）：

```bash
pnpm nx run rxdb-adapter-supabase:test-env
docker exec -i <db 容器名> psql -U postgres -d postgres -At < <存下来的 SQL 文件>
```

## 运行记录

2026-11-19，本检出位的隔离栈，PostgreSQL 17.6（`supabase/postgres:17.6.1.136`）：脚本退出码为 0，输出里没有 `ERROR`；跑完后 `rxdb_spike` schema 不存在，anon 对筛选求值函数的执行权仍是收回的状态。

## 脚本

```sql
-- US-033 试验：分区日志带不带正文、是否单独成表
--
-- 用途：回答 US-033 阶段 A 之前的两个设计问题，结论与结果见本文件上文。
--   方案 M：分区日志只记「哪个区的哪一行变了」，正文在拉取时按调用者身份从业务表读；日志单独成表。
--   方案 B：分区日志带正文、按区由 RLS 裁决，行换区时把旧区的历史正文置空（改写前的首版写法）。
-- 两套日志挂在同一张业务表上，由同一批写入驱动，逐个场景对比。
--
-- 运行：先起隔离栈（pnpm nx run rxdb-adapter-supabase:test-env），再
--   docker exec -i <db 容器名> psql -U postgres -d postgres -At < <存下来的 SQL 文件>
-- 全部对象建在事务里的 rxdb_spike schema，结尾 ROLLBACK，不留任何对象。
-- 这是试验脚本，不是参考 SQL：函数名、表名与签名都不是定稿。

\set ON_ERROR_STOP on
\pset pager off
BEGIN;

-- ============ 夹具：成员表、可读的区、业务表 ============
CREATE SCHEMA rxdb_spike;
GRANT USAGE ON SCHEMA rxdb_spike TO anon, authenticated;
-- anon 也要能执行筛选求值器（US-225 的生产权限脚本把它从 anon 收回了）
GRANT EXECUTE ON FUNCTION public.rxdb_jsonb_matches_filter(jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.rxdb_jsonb_matches_rule(jsonb, jsonb) TO anon;

CREATE TABLE rxdb_spike.member (
  user_id uuid NOT NULL, tenant_id text NOT NULL, PRIMARY KEY (user_id, tenant_id)
);

CREATE FUNCTION rxdb_spike.caller_buckets() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT 'public'
  UNION ALL SELECT 'user:' || auth.uid()::text WHERE auth.uid() IS NOT NULL
  UNION ALL SELECT 'tenant:' || m.tenant_id FROM rxdb_spike.member m WHERE m.user_id = auth.uid()
$$;
GRANT EXECUTE ON FUNCTION rxdb_spike.caller_buckets() TO anon, authenticated;

CREATE TABLE rxdb_spike.article (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  visibility text NOT NULL DEFAULT 'private',
  title text NOT NULL,
  category text,
  cost numeric,
  rxdb_bucket text GENERATED ALWAYS AS (
    CASE WHEN visibility = 'public' THEN 'public' ELSE 'tenant:' || tenant_id END
  ) STORED
);
CREATE INDEX ON rxdb_spike.article (rxdb_bucket, id);
ALTER TABLE rxdb_spike.article ENABLE ROW LEVEL SECURITY;
CREATE POLICY article_read ON rxdb_spike.article FOR SELECT TO anon, authenticated
  USING (rxdb_bucket IN (SELECT rxdb_spike.caller_buckets()));
-- 列级授权：anon 读不到成本列，authenticated 读得到
GRANT SELECT (id, tenant_id, visibility, title, category, rxdb_bucket) ON rxdb_spike.article TO anon;
GRANT SELECT ON rxdb_spike.article TO authenticated;

-- ============ 方案 M：分区日志不带正文，单独成表 ============
CREATE TABLE rxdb_spike.bucket_change (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  op text NOT NULL CHECK (op IN ('upsert', 'remove')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON rxdb_spike.bucket_change (bucket, entity, id);
CREATE INDEX ON rxdb_spike.bucket_change (bucket, entity, entity_id, id);
ALTER TABLE rxdb_spike.bucket_change ENABLE ROW LEVEL SECURITY;
ALTER TABLE rxdb_spike.bucket_change FORCE ROW LEVEL SECURITY;
CREATE POLICY bucket_change_read ON rxdb_spike.bucket_change FOR SELECT TO anon, authenticated
  USING (bucket IN (SELECT rxdb_spike.caller_buckets()));
GRANT SELECT ON rxdb_spike.bucket_change TO anon, authenticated;

CREATE FUNCTION rxdb_spike.log_meta() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO rxdb_spike.bucket_change (bucket, entity, entity_id, op)
    VALUES (NEW.rxdb_bucket, TG_ARGV[0], NEW.id::text, 'upsert');
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.rxdb_bucket IS DISTINCT FROM OLD.rxdb_bucket THEN
      INSERT INTO rxdb_spike.bucket_change (bucket, entity, entity_id, op)
      VALUES (OLD.rxdb_bucket, TG_ARGV[0], OLD.id::text, 'remove');
    END IF;
    INSERT INTO rxdb_spike.bucket_change (bucket, entity, entity_id, op)
    VALUES (NEW.rxdb_bucket, TG_ARGV[0], NEW.id::text, 'upsert');
  ELSE
    INSERT INTO rxdb_spike.bucket_change (bucket, entity, entity_id, op)
    VALUES (OLD.rxdb_bucket, TG_ARGV[0], OLD.id::text, 'remove');
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER article_meta AFTER INSERT OR UPDATE OR DELETE ON rxdb_spike.article
  FOR EACH ROW EXECUTE FUNCTION rxdb_spike.log_meta('Article');

-- 调用者能读的列（列级授权由业务表裁决）
CREATE FUNCTION rxdb_spike.readable_columns(p_table regclass) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
  SELECT string_agg(format('t.%I', a.attname), ', ' ORDER BY a.attnum)
  FROM pg_attribute a
  WHERE a.attrelid = p_table AND a.attnum > 0 AND NOT a.attisdropped
    AND has_column_privilege(p_table, a.attnum, 'SELECT')
$$;

-- 按区增量：游标之后的日志行按行去重，正文取业务表的当前行（调用者的 RLS 与列权限生效）。
-- 从去重后的行 id 出发逐行按主键取当前行（LATERAL），筛选在取到行之后求值，代价只随变更行数增长
CREATE FUNCTION rxdb_spike.pull_bucket(
  p_table regclass, p_entity text, p_bucket text, p_since bigint, p_limit int, p_filter jsonb DEFAULT NULL
) RETURNS TABLE (entity_id text, change_id bigint, op text, doc jsonb, page_last_id bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_cols text := rxdb_spike.readable_columns(p_table);
  v_id_type text;
BEGIN
  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'no readable column on %', p_table USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_id_type
  FROM pg_attribute a WHERE a.attrelid = p_table AND a.attname = 'id';
  RETURN QUERY EXECUTE format($q$
    WITH page AS (
      SELECT c.id, c.entity_id FROM rxdb_spike.bucket_change c
      WHERE c.bucket = $1 AND c.entity = $2 AND c.id > $3
      ORDER BY c.id LIMIT $4
    ), ids AS (
      SELECT DISTINCT p.entity_id FROM page p
    )
    SELECT i.entity_id,
           (SELECT max(c2.id) FROM rxdb_spike.bucket_change c2
             WHERE c2.bucket = $1 AND c2.entity = $2 AND c2.entity_id = i.entity_id),
           CASE WHEN m.doc IS NULL THEN 'remove' ELSE 'upsert' END,
           m.doc,
           (SELECT max(p.id) FROM page p)
    FROM ids i
    LEFT JOIN LATERAL (
      SELECT d.doc
      FROM (
        SELECT (SELECT to_jsonb(r) FROM (SELECT %1$s) AS r) AS doc
        FROM %2$s AS t
        WHERE t.id = i.entity_id::%3$s AND t.rxdb_bucket = $1
        OFFSET 0
      ) AS d
      WHERE public.rxdb_jsonb_matches_filter(d.doc, $5)
    ) AS m ON true
    ORDER BY 2
  $q$, v_cols, p_table, v_id_type) USING p_bucket, p_entity, p_since, p_limit, p_filter;
END $$;

-- 按区快照：同一套列与筛选，去掉游标条件，按主键分页
CREATE FUNCTION rxdb_spike.snapshot_bucket(
  p_table regclass, p_entity text, p_bucket text, p_after text, p_limit int, p_filter jsonb DEFAULT NULL
) RETURNS TABLE (entity_id text, change_id bigint, doc jsonb)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_cols text := rxdb_spike.readable_columns(p_table);
  v_id_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_id_type
  FROM pg_attribute a WHERE a.attrelid = p_table AND a.attname = 'id';
  RETURN QUERY EXECUTE format($q$
    SELECT s.entity_id,
           COALESCE((SELECT max(c.id) FROM rxdb_spike.bucket_change c
                      WHERE c.bucket = $1 AND c.entity = $2 AND c.entity_id = s.entity_id), 0),
           s.doc
    FROM (
      SELECT t.id::text AS entity_id, (SELECT to_jsonb(r) FROM (SELECT %1$s) AS r) AS doc
      FROM %2$s AS t
      WHERE t.rxdb_bucket = $1 AND ($3 IS NULL OR t.id > $3::%3$s)
      ORDER BY t.id
    ) AS s
    WHERE public.rxdb_jsonb_matches_filter(s.doc, $5)
    LIMIT $4
  $q$, v_cols, p_table, v_id_type) USING p_bucket, p_entity, p_after, p_limit, p_filter;
END $$;

-- ============ 方案 B：分区日志带正文（US-033 首版写法），换区时抹旧区历史正文 ============
CREATE TABLE rxdb_spike.body_change (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  type text NOT NULL,
  before_data jsonb,
  after_data jsonb
);
CREATE INDEX ON rxdb_spike.body_change (bucket, entity, id);
CREATE INDEX ON rxdb_spike.body_change (entity, entity_id);
ALTER TABLE rxdb_spike.body_change ENABLE ROW LEVEL SECURITY;
CREATE POLICY body_change_read ON rxdb_spike.body_change FOR SELECT TO anon, authenticated
  USING (bucket IN (SELECT rxdb_spike.caller_buckets()));
GRANT SELECT ON rxdb_spike.body_change TO anon, authenticated;

CREATE FUNCTION rxdb_spike.log_body() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO rxdb_spike.body_change (bucket, entity, entity_id, type, after_data)
    VALUES (NEW.rxdb_bucket, TG_ARGV[0], NEW.id::text, 'INSERT', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.rxdb_bucket IS DISTINCT FROM OLD.rxdb_bucket THEN
      UPDATE rxdb_spike.body_change SET before_data = NULL, after_data = NULL
      WHERE bucket = OLD.rxdb_bucket AND entity = TG_ARGV[0] AND entity_id = OLD.id::text
        AND (before_data IS NOT NULL OR after_data IS NOT NULL);
      INSERT INTO rxdb_spike.body_change (bucket, entity, entity_id, type)
      VALUES (OLD.rxdb_bucket, TG_ARGV[0], OLD.id::text, 'REMOVE');
      INSERT INTO rxdb_spike.body_change (bucket, entity, entity_id, type, after_data)
      VALUES (NEW.rxdb_bucket, TG_ARGV[0], NEW.id::text, 'INSERT', to_jsonb(NEW));
    ELSE
      INSERT INTO rxdb_spike.body_change (bucket, entity, entity_id, type, before_data, after_data)
      VALUES (NEW.rxdb_bucket, TG_ARGV[0], NEW.id::text, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    END IF;
  ELSE
    INSERT INTO rxdb_spike.body_change (bucket, entity, entity_id, type, before_data)
    VALUES (OLD.rxdb_bucket, TG_ARGV[0], OLD.id::text, 'DELETE', to_jsonb(OLD));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER article_body AFTER INSERT OR UPDATE OR DELETE ON rxdb_spike.article
  FOR EACH ROW EXECUTE FUNCTION rxdb_spike.log_body('Article');

-- ============ 数据 ============
INSERT INTO rxdb_spike.member VALUES
  ('00000000-0000-4000-8000-0000000000a1', 't1'),
  ('00000000-0000-4000-8000-0000000000b2', 't2');
INSERT INTO rxdb_spike.article (id, tenant_id, visibility, title, category, cost) VALUES
  ('00000000-0000-4000-8000-000000000001', 't1', 'public',  'public-1',  'news', 10),
  ('00000000-0000-4000-8000-000000000002', 't2', 'public',  'public-2',  NULL,   20),
  ('00000000-0000-4000-8000-000000000011', 't1', 'private', 'tenant1-a', 'news', 30),
  ('00000000-0000-4000-8000-000000000012', 't1', 'private', 'tenant1-b', 'ops',  31),
  ('00000000-0000-4000-8000-000000000013', 't1', 'private', 'tenant1-c', NULL,   32),
  ('00000000-0000-4000-8000-000000000021', 't2', 'private', 'tenant2-a', 'news', 40);

\echo
\echo '=== M1 anon 从头拉公开区：只有公开行，没有成本列 ==='
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
SELECT op || ' ' || (doc->>'title') || ' has_cost=' || (doc ? 'cost') || ' change_id=' || change_id
FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'public', 0, 100);
\echo '--- anon 拉租户 1 区（期望 0 行） / anon 直读日志能看到的区 ---'
SELECT 'rows=' || count(*) FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'tenant:t1', 0, 100);
SELECT 'visible buckets=' || COALESCE(string_agg(DISTINCT bucket, ','), '(none)') FROM rxdb_spike.bucket_change;
RESET ROLE;

\echo
\echo '=== M2 A（租户 1）与 B（租户 2）各拉各的 ==='
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'A buckets=' || string_agg(b, ',' ORDER BY b) FROM rxdb_spike.caller_buckets() AS b;
SELECT 'A tenant:t1 ' || op || ' ' || (doc->>'title') || ' cost=' || (doc->>'cost')
FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'tenant:t1', 0, 100);
SELECT 'A tenant:t2 rows=' || count(*) FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'tenant:t2', 0, 100);
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'B tenant:t2 ' || op || ' ' || (doc->>'title') || ' cost=' || (doc->>'cost')
FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'tenant:t2', 0, 100);
RESET ROLE;

\echo
\echo '=== M3 把 A 加进租户 2，业务行一行没改：A 的可读区变了，快照能补齐 ==='
INSERT INTO rxdb_spike.member VALUES ('00000000-0000-4000-8000-0000000000a1', 't2');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'A buckets=' || string_agg(b, ',' ORDER BY b) FROM rxdb_spike.caller_buckets() AS b;
SELECT 'A snapshot tenant:t2 ' || (doc->>'title') || ' change_id=' || change_id
FROM rxdb_spike.snapshot_bucket('rxdb_spike.article', 'Article', 'tenant:t2', NULL, 100);
RESET ROLE;

\echo
\echo '=== M5 公开行 public-2 改成租户 2 私有：anon 新设备与旧游标都只拿到移除 ==='
SELECT COALESCE(max(id), 0) AS anon_old_cursor FROM rxdb_spike.bucket_change WHERE bucket = 'public' \gset
UPDATE rxdb_spike.article SET visibility = 'private' WHERE id = '00000000-0000-4000-8000-000000000002';
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
SELECT 'anon 旧游标续拉: ' || op || ' ' || entity_id || ' doc=' || COALESCE(doc::text, 'NULL')
FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'public', :anon_old_cursor, 100);
SELECT 'anon 从头拉: ' || op || ' ' || COALESCE(doc->>'title', entity_id) || ' doc_is_null=' || (doc IS NULL)
FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'public', 0, 100);
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'B tenant:t2 ' || op || ' ' || (doc->>'title') || ' cost=' || (doc->>'cost')
FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'tenant:t2', 0, 100);
RESET ROLE;

\echo
\echo '=== M6 远端删除 tenant2-a：B 续拉得到移除 ==='
SELECT COALESCE(max(id), 0) AS b_cursor FROM rxdb_spike.bucket_change WHERE bucket = 'tenant:t2' \gset
DELETE FROM rxdb_spike.article WHERE id = '00000000-0000-4000-8000-000000000021';
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'B ' || op || ' ' || entity_id FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'tenant:t2', :b_cursor, 100);
RESET ROLE;

\echo
\echo '=== M7 筛选 category = news：行离开条件时增量返回移除，快照同口径 ==='
SELECT COALESCE(max(id), 0) AS a_cursor FROM rxdb_spike.bucket_change WHERE bucket = 'tenant:t1' \gset
UPDATE rxdb_spike.article SET category = 'ops' WHERE id = '00000000-0000-4000-8000-000000000011';
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'A 增量(筛选): ' || op || ' ' || entity_id
FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'tenant:t1', :a_cursor, 100,
  '{"combinator":"and","rules":[{"field":"category","operator":"=","value":"news"}]}');
SELECT 'A 快照(筛选) rows=' || count(*)
FROM rxdb_spike.snapshot_bucket('rxdb_spike.article', 'Article', 'tenant:t1', NULL, 100,
  '{"combinator":"and","rules":[{"field":"category","operator":"=","value":"news"}]}');
\echo '--- 筛选 category != news 的 NULL 口径：快照、增量、SQL 比较 ---'
SELECT 'A 快照 != news: ' || string_agg(doc->>'title', ',' ORDER BY doc->>'title')
FROM rxdb_spike.snapshot_bucket('rxdb_spike.article', 'Article', 'tenant:t1', NULL, 100,
  '{"combinator":"and","rules":[{"field":"category","operator":"!=","value":"news"}]}');
SELECT 'A 增量 != news: ' || string_agg(doc->>'title', ',' ORDER BY doc->>'title')
FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'tenant:t1', 0, 100,
  '{"combinator":"and","rules":[{"field":"category","operator":"!=","value":"news"}]}') WHERE op = 'upsert';
SELECT 'A SQL category <> news: ' || string_agg(title, ',' ORDER BY title)
FROM rxdb_spike.article WHERE rxdb_bucket = 'tenant:t1' AND category <> 'news';
RESET ROLE;

\echo
\echo '=== M8 / B2 历史：改掉敏感标题、删除一行之后，后加入租户 1 的 C 从头拉 ==='
UPDATE rxdb_spike.article SET title = 'SECRET-OLD' WHERE id = '00000000-0000-4000-8000-000000000012';
UPDATE rxdb_spike.article SET title = 'tenant1-b-v3' WHERE id = '00000000-0000-4000-8000-000000000012';
DELETE FROM rxdb_spike.article WHERE id = '00000000-0000-4000-8000-000000000013';
INSERT INTO rxdb_spike.member VALUES ('00000000-0000-4000-8000-0000000000c3', 't1');
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'M: C ' || op || ' ' || COALESCE(doc->>'title', entity_id)
FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'tenant:t1', 0, 100);
SELECT 'M: 读到 SECRET-OLD 的行数=' || count(*) FILTER (WHERE doc::text LIKE '%SECRET-OLD%')
       || ' 读到已删行 tenant1-c 正文的行数=' || count(*) FILTER (WHERE doc::text LIKE '%tenant1-c%')
FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'tenant:t1', 0, 100);
SELECT 'B: 读到 SECRET-OLD 的日志行数=' || count(*) FILTER (WHERE (before_data::text || after_data::text) LIKE '%SECRET-OLD%' OR before_data::text LIKE '%SECRET-OLD%' OR after_data::text LIKE '%SECRET-OLD%')
       || ' 读到已删行 tenant1-c 正文的日志行数=' || count(*) FILTER (WHERE before_data::text LIKE '%tenant1-c%' OR after_data::text LIKE '%tenant1-c%')
FROM rxdb_spike.body_change WHERE bucket = 'tenant:t1';
RESET ROLE;

\echo
\echo '=== B1 带正文的日志：anon 直读公开区日志能看到业务表没授给它的成本列 ==='
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
SELECT 'B: anon 读到带 cost 的日志行数=' || count(*) FILTER (WHERE after_data ? 'cost')
       || '，cost 值=' || COALESCE(string_agg(DISTINCT after_data->>'cost', ','), '')
FROM rxdb_spike.body_change WHERE bucket = 'public';
RESET ROLE;
\echo '--- B: public-2 换区后旧区被置空正文的历史行数 / 旧区留下的行 ---'
SELECT 'B: public-2 在公开区的日志: ' || string_agg(type || CASE WHEN after_data IS NULL AND before_data IS NULL THEN '(无正文)' ELSE '(有正文)' END, ' , ' ORDER BY id)
FROM rxdb_spike.body_change WHERE bucket = 'public' AND entity_id = '00000000-0000-4000-8000-000000000002';

\echo
\echo '=== M9 同一行改 100 次：增量只返回一行 ==='
SELECT COALESCE(max(id), 0) AS a_cursor2 FROM rxdb_spike.bucket_change WHERE bucket = 'tenant:t1' \gset
DO $$ BEGIN FOR i IN 1..100 LOOP
  UPDATE rxdb_spike.article SET title = 'tenant1-b-rev' || i WHERE id = '00000000-0000-4000-8000-000000000012';
END LOOP; END $$;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'M: rows=' || count(*) || ' title=' || max(doc->>'title') || ' change_id=' || max(change_id) || ' page_last_id=' || max(page_last_id)
FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'tenant:t1', :a_cursor2, 1000);
SELECT 'B: 同一段要拉的日志行数=' || count(*) FROM rxdb_spike.body_change WHERE bucket = 'tenant:t1' AND entity_id = '00000000-0000-4000-8000-000000000012' AND type = 'UPDATE' AND after_data->>'title' LIKE 'tenant1-b-rev%';
RESET ROLE;

\echo
\echo '=== M4 把 A 移出租户 1：A 的可读区里没有它了，续拉 0 行 ==='
DELETE FROM rxdb_spike.member WHERE user_id = '00000000-0000-4000-8000-0000000000a1' AND tenant_id = 't1';
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT 'A buckets=' || string_agg(b, ',' ORDER BY b) FROM rxdb_spike.caller_buckets() AS b;
SELECT 'A tenant:t1 rows=' || count(*) FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'tenant:t1', 0, 100);
RESET ROLE;

-- ============ 量级探针 ============
INSERT INTO rxdb_spike.member VALUES ('00000000-0000-4000-8000-0000000000d4', 't9');
INSERT INTO rxdb_spike.article (tenant_id, visibility, title, category, cost)
SELECT 't9', 'private', 'row-' || g, CASE WHEN g % 4 = 0 THEN 'news' WHEN g % 4 = 1 THEN NULL ELSE 'ops' END, g
FROM generate_series(1, 20000) AS g;
ANALYZE rxdb_spike.article; ANALYZE rxdb_spike.bucket_change; ANALYZE rxdb_spike.body_change;

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
\echo '--- P1 快照 2 万行（无筛选） ---'
\timing on
SELECT 'rows=' || count(*) FROM rxdb_spike.snapshot_bucket('rxdb_spike.article', 'Article', 'tenant:t9', NULL, 20000);
\timing off
\echo '--- P1b 快照分页：每页 1000 行，取第一页 ---'
\timing on
SELECT 'rows=' || count(*) FROM rxdb_spike.snapshot_bucket('rxdb_spike.article', 'Article', 'tenant:t9', NULL, 1000);
\timing off
\echo '--- P2 快照 2 万行，筛选 category = news（日志求值器逐行求值） ---'
\timing on
SELECT 'rows=' || count(*) FROM rxdb_spike.snapshot_bucket('rxdb_spike.article', 'Article', 'tenant:t9', NULL, 20000,
  '{"combinator":"and","rules":[{"field":"category","operator":"=","value":"news"}]}');
\timing off
\echo '--- P2b 同一条件写成 SQL 比较（对照） ---'
\timing on
SELECT 'rows=' || count(*) FROM rxdb_spike.article WHERE rxdb_bucket = 'tenant:t9' AND category = 'news';
\timing off
RESET ROLE;

SELECT COALESCE(max(id), 0) AS d_cursor FROM rxdb_spike.bucket_change WHERE bucket = 'tenant:t9' \gset
UPDATE rxdb_spike.article SET title = title || '-touched' WHERE tenant_id = 't9' AND cost <= 1000;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
\echo '--- P3 改 1000 行之后的增量（一页 5000 条日志） ---'
\timing on
SELECT 'rows=' || count(*) || ' upserts=' || count(*) FILTER (WHERE op = 'upsert') FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'tenant:t9', :d_cursor, 5000);
\timing off
\echo '--- P3b 没有变化时的增量 ---'
SELECT COALESCE(max(id), 0) AS d_cursor2 FROM rxdb_spike.bucket_change WHERE bucket = 'tenant:t9' \gset
\timing on
SELECT 'rows=' || count(*) FROM rxdb_spike.pull_bucket('rxdb_spike.article', 'Article', 'tenant:t9', :d_cursor2, 5000);
\timing off
RESET ROLE;

-- 给两组各 2000 行各做 5 次修改，让每行在两份日志里都有 6 条历史
DO $$ BEGIN FOR i IN 1..5 LOOP
  UPDATE rxdb_spike.article SET title = 'rev' || i || '-' || cost WHERE tenant_id = 't9' AND cost BETWEEN 10001 AND 14000;
END LOOP; END $$;

\echo '--- P4 批量换区 2000 行（租户区改公开），只留不带正文的日志触发器 ---'
ALTER TABLE rxdb_spike.article DISABLE TRIGGER article_body;
\timing on
UPDATE rxdb_spike.article SET visibility = 'public' WHERE tenant_id = 't9' AND cost BETWEEN 10001 AND 12000;
\timing off
ALTER TABLE rxdb_spike.article ENABLE TRIGGER article_body;
\echo '--- P4b 批量换区另外 2000 行，只留带正文的日志触发器（要抹旧区历史正文） ---'
ALTER TABLE rxdb_spike.article DISABLE TRIGGER article_meta;
\timing on
UPDATE rxdb_spike.article SET visibility = 'public' WHERE tenant_id = 't9' AND cost BETWEEN 12001 AND 14000;
\timing off
ALTER TABLE rxdb_spike.article ENABLE TRIGGER article_meta;
SELECT 'P4b 被置空正文的历史日志行数=' || count(*) FROM rxdb_spike.body_change
WHERE bucket = 'tenant:t9' AND type <> 'REMOVE' AND before_data IS NULL AND after_data IS NULL;
SELECT '日志体积 不带正文=' || pg_size_pretty(pg_total_relation_size('rxdb_spike.bucket_change'))
       || ' 带正文=' || pg_size_pretty(pg_total_relation_size('rxdb_spike.body_change'))
       || ' 行数 ' || (SELECT count(*) FROM rxdb_spike.bucket_change) || ' / ' || (SELECT count(*) FROM rxdb_spike.body_change);

\echo
\echo '=== Q2 单独成表：旧日志表与旧权限没有被碰到 ==='
SELECT 'rxdb_change 里 Article 的行数=' || count(*) FROM public.rxdb_change WHERE entity = 'Article' AND namespace = 'rxdb_spike';
SELECT 'anon 对 rxdb_change 的读权限=' || has_table_privilege('anon', 'public.rxdb_change', 'SELECT')
       || ' rxdb_change.relrowsecurity=' || (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.rxdb_change'::regclass);
SELECT 'bucket_change relrowsecurity=' || relrowsecurity || ' force=' || relforcerowsecurity FROM pg_class WHERE oid = 'rxdb_spike.bucket_change'::regclass;

ROLLBACK;
```
