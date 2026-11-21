BEGIN;
-- 提交协议切换为平台 working-tree 的交换格式（ADMIN-US-221 第一部分）：提交表存完整的交换记录——有序的父（parent_ids，第 0 个是
-- 第一父）、种类（normal 任务提交 / merge 合并提交 / baseline 共享分支根）、消息、作者（根为 NULL）、记录里的时间与内容指纹，
-- 合并提交另存它依据的候选（产品附加的元数据）；变更表存单元：序号、单元 ID、所属事务、命名空间、实体、记录、操作、两份补丁与来源。
-- 共享分支从初始化写下的 baseline 根起步。只读投影 admin_commits、读取函数与工作区行（多一列 root）随之改写，
-- 新增下发接口 admin_commit_exchange()。
-- 全部语句幂等：
-- - 旧结构（commits 有 parent_id / merge_source / fingerprint）的库：产品尚未部署，旧结构下的协作数据不迁移、整体清空
--   （旧结构的工作区没有根提交，在新结构下无法继续），再改表；
-- - 已是新结构的库：重复执行结果不变。前面的迁移文件也可以在新结构上重跑（它们不再引用被删掉的列）。

-- 1. 旧结构：清空协作数据，再把两张表改成交换格式。表里没有行，新增的 NOT NULL 列不需要默认值。
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'admin_private' AND table_name = 'commits' AND column_name = 'parent_id') THEN
    DELETE FROM public.admin_changes;
    DELETE FROM public.admin_audit;
    DELETE FROM public.admin_workspace_versions;
    DELETE FROM public.admin_shared;
    DELETE FROM admin_private.record_keys;
    DELETE FROM public.shared_records;
    DELETE FROM admin_private.comments;
    DELETE FROM admin_private.notifications;
    DELETE FROM admin_private.threads;
    DELETE FROM admin_private.reviews;
    DELETE FROM admin_private.candidates;
    DELETE FROM admin_private.prs;
    DELETE FROM admin_private.refs;
    DELETE FROM admin_private.tasks;
    DELETE FROM admin_private.commit_changes;
    DELETE FROM admin_private.commits;
    DELETE FROM admin_private.invitations;
    DELETE FROM admin_private.operations;
    DELETE FROM admin_private.policies;
    DELETE FROM admin_private.schemas;
    DELETE FROM admin_private.memberships;
    DELETE FROM admin_private.workspaces;
    -- 投影引用了要删掉的列，先删投影（下文按新结构重建）
    DROP VIEW IF EXISTS public.admin_commits;
    -- 单一父指针、合并来源与旧指纹（连同它们的索引、外键与检查约束）
    ALTER TABLE admin_private.commits DROP COLUMN parent_id, DROP COLUMN merge_source;
    ALTER TABLE admin_private.commits RENAME COLUMN fingerprint TO content_fingerprint;
    ALTER TABLE admin_private.commits
      ADD COLUMN parent_ids text[] NOT NULL,
      ADD COLUMN kind text NOT NULL,
      -- 父按位置展开，各带一条指向提交表的外键：父必须已存在（提交只追加，祖先总先于后代写入）
      ADD COLUMN first_parent text GENERATED ALWAYS AS (parent_ids[1]) STORED,
      ADD COLUMN merge_parent text GENERATED ALWAYS AS (parent_ids[2]) STORED,
      ALTER COLUMN author_id DROP NOT NULL,
      -- 时间取自交换记录（客户端上传的、服务端合成的），不由数据库填
      ALTER COLUMN created_at DROP DEFAULT,
      ADD CONSTRAINT commits_first_parent_fkey FOREIGN KEY (team_id, app_id, first_parent)
        REFERENCES admin_private.commits(team_id, app_id, id),
      ADD CONSTRAINT commits_merge_parent_fkey FOREIGN KEY (team_id, app_id, merge_parent)
        REFERENCES admin_private.commits(team_id, app_id, id),
      -- 协作只产出三种：任务提交恰好一个父；合并提交恰好两个互不相同的父（共享头、任务头）且带候选；根没有父、没有作者
      ADD CONSTRAINT commits_exchange_shape CHECK (
        (kind = 'normal' AND cardinality(parent_ids) = 1 AND author_id IS NOT NULL AND candidate_id IS NULL)
        OR (kind = 'merge' AND cardinality(parent_ids) = 2 AND parent_ids[1] <> parent_ids[2]
          AND author_id IS NOT NULL AND candidate_id IS NOT NULL)
        OR (kind = 'baseline' AND cardinality(parent_ids) = 0 AND author_id IS NULL AND candidate_id IS NULL)
      ),
      ADD CONSTRAINT commits_message_present CHECK (btrim(message) <> '');
    ALTER TABLE admin_private.commit_changes RENAME COLUMN seq TO sequence;
    ALTER TABLE admin_private.commit_changes
      ADD COLUMN unit_id text NOT NULL,
      ADD COLUMN transaction_id text,
      ADD COLUMN origin text NOT NULL,
      ADD CONSTRAINT commit_changes_origin CHECK (origin IN ('local', 'remote_sync'));
  END IF;
END $$;

-- 每个工作区恰好一个共享分支根：初始化时写下，工作区行与命令都按它找根
CREATE UNIQUE INDEX IF NOT EXISTS commits_root ON admin_private.commits (team_id, app_id) WHERE kind = 'baseline';

-- 2. 只读投影（视图以所有者身份读私有表，可见范围写在条件里，security_barrier 防止调用方的筛选先于条件求值）。
-- 工作区行：在 202611170004 的列之后加上共享分支根 root（还没有合并时共享头就是根，界面按「空分支」显示）
CREATE OR REPLACE VIEW public.admin_workspaces WITH (security_barrier = true) AS
  SELECT w.team_id, w.app_id, w.name, w.schema_version, w.policy_version, p.stages AS policy_stages, r.head,
    v.revision, v.audit_count,
    (SELECT c.id FROM admin_private.commits c
      WHERE c.team_id = w.team_id AND c.app_id = w.app_id AND c.kind = 'baseline') AS root
  FROM admin_private.memberships m
  JOIN admin_private.workspaces w ON w.team_id = m.team_id AND w.app_id = m.app_id
  JOIN admin_private.policies p ON p.team_id = w.team_id AND p.app_id = w.app_id AND p.version = w.policy_version
  JOIN admin_private.refs r ON r.team_id = w.team_id AND r.app_id = w.app_id AND r.ref = 'shared'
  JOIN public.admin_workspace_versions v ON v.team_id = w.team_id AND v.app_id = w.app_id
  WHERE m.user_id = auth.uid()::text AND m.can_read;
-- 提交元数据：交换记录去掉单元与内容指纹（指纹只随下发接口交出）；created_at 按 toISOString() 的写法（UTC、毫秒）
CREATE OR REPLACE VIEW public.admin_commits WITH (security_barrier = true) AS
  SELECT c.team_id, c.app_id, c.id, c.parent_ids, c.kind, c.author_id, c.message, c.candidate_id,
    to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at, c.seq
  FROM admin_private.commits c
  WHERE admin_private.can_read(c.team_id, c.app_id);

-- 3. 读取函数（一条语句、一份快照，返回 JSON 以免受 PostgREST 行数上限截断）：不可读的工作区返回 NULL；只读、不加锁。
-- 行形状与 server/pg-store.ts 的查询一致，由同一段 TypeScript（src/derive.ts）还原路径。推导内容只沿第一父走。
CREATE OR REPLACE FUNCTION public.admin_commit_path(p_team_id text, p_app_id text, p_from text, p_until text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (
    WITH RECURSIVE chain AS (
      SELECT c.id, c.first_parent AS parent_id, c.kind FROM admin_private.commits c
      WHERE c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = p_from AND c.id IS DISTINCT FROM p_until
      UNION
      SELECT c.id, c.first_parent, c.kind FROM chain
      JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = chain.parent_id
      WHERE c.id IS DISTINCT FROM p_until
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'parent_id', parent_id, 'kind', kind)), '[]'::jsonb)
    FROM chain
  )
  WHERE admin_private.can_read(p_team_id, p_app_id)
$$;
-- 任务提交的血缘：沿第一父走到第一个共享分支上的提交（合并提交或根）为止，含它
CREATE OR REPLACE FUNCTION public.admin_commit_lineage(p_team_id text, p_app_id text, p_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (
    WITH RECURSIVE chain AS (
      SELECT c.id, c.first_parent AS parent_id, c.kind FROM admin_private.commits c
      WHERE c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = p_id
      UNION
      SELECT c.id, c.first_parent, c.kind FROM chain
      JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = chain.parent_id
      WHERE chain.kind = 'normal'
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'parent_id', parent_id, 'kind', kind)), '[]'::jsonb)
    FROM chain
  )
  WHERE admin_private.can_read(p_team_id, p_app_id)
$$;
CREATE OR REPLACE FUNCTION public.admin_commit_history(
  p_team_id text, p_app_id text, p_from text, p_until text, p_limit integer
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (
    WITH RECURSIVE chain AS (
      SELECT c.id, c.first_parent, 1 AS depth FROM admin_private.commits c
      WHERE c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = p_from AND p_limit >= 1
        AND c.id IS DISTINCT FROM p_until
      UNION ALL
      SELECT c.id, c.first_parent, chain.depth + 1 FROM chain
      JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = chain.first_parent
      WHERE chain.depth < least(p_limit, 101) AND c.id IS DISTINCT FROM p_until
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'parent_ids', to_jsonb(c.parent_ids), 'kind', c.kind,
        'author_id', c.author_id, 'message', c.message, 'candidate_id', c.candidate_id,
        'created_at', to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY chain.depth),
      '[]'::jsonb)
    FROM chain
    JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = chain.id
  )
  WHERE admin_private.can_read(p_team_id, p_app_id)
$$;
CREATE OR REPLACE FUNCTION public.admin_commit_changes(
  p_team_id text, p_app_id text, p_commit_ids text[], p_record_ids text[] DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (
    SELECT coalesce(jsonb_agg(jsonb_build_object('commit_id', x.commit_id, 'sequence', x.sequence,
        'unit_id', x.unit_id, 'transaction_id', x.transaction_id, 'namespace', x.namespace, 'entity', x.entity,
        'entity_id', x.entity_id, 'operation', x.operation, 'patch', x.patch, 'inverse_patch', x.inverse_patch,
        'origin', x.origin) ORDER BY x.commit_id, x.sequence), '[]'::jsonb)
    FROM admin_private.commit_changes x
    WHERE x.team_id = p_team_id AND x.app_id = p_app_id AND x.commit_id = ANY (p_commit_ids)
      AND (p_record_ids IS NULL OR x.entity_id = ANY (p_record_ids))
  )
  WHERE admin_private.can_read(p_team_id, p_app_id)
$$;

-- 4. 下发接口：客户端已知的提交（p_known，连同它们的全部祖先）之后、到分支 p_ref（'shared' 或 'tasks/<任务 ID>'）的头为止的
-- 交换记录，形状就是平台 importCommits() 收的批次：父先于子，最后一个是这一页的头，侧枝提交（合并提交的第二父带进来的任务提交）
-- 随把它带进来的那个合并提交一起下发、排在它前面。分页：每页最多 p_limit 个提交（1～100），只在分支第一父链上的提交处断开——
-- 合并提交与它的侧枝不拆开，一组本身超过上限时这一页就是这一组。不认识的已知提交忽略（它们只可能是客户端还没上传的提交）。
-- 结果是 { head, more, commits }：head 是分支此刻的头（分支不存在时为 null），more 表示这一页之后还有。
-- 与其余读取函数一样只对可读成员开放（不可读返回 NULL），只读、不加锁。
CREATE OR REPLACE FUNCTION public.admin_commit_exchange(
  p_team_id text, p_app_id text, p_ref text, p_known text[], p_limit integer
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH RECURSIVE
  branch AS (
    SELECT r.head FROM admin_private.refs r
    WHERE r.team_id = p_team_id AND r.app_id = p_app_id AND r.ref = p_ref
  ),
  known AS (
    SELECT c.id, c.parent_ids FROM admin_private.commits c
    WHERE c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = ANY (coalesce(p_known, '{}'::text[]))
    UNION
    SELECT c.id, c.parent_ids FROM known k
    CROSS JOIN LATERAL unnest(k.parent_ids) AS parent(id)
    JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = parent.id
  ),
  mainline AS (
    SELECT c.id, c.parent_ids, 0 AS depth FROM admin_private.commits c
    JOIN branch ON c.id = branch.head
    WHERE c.team_id = p_team_id AND c.app_id = p_app_id AND NOT EXISTS (SELECT 1 FROM known WHERE known.id = c.id)
    UNION ALL
    SELECT c.id, c.parent_ids, m.depth + 1 FROM mainline m
    JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = m.parent_ids[1]
    WHERE NOT EXISTS (SELECT 1 FROM known WHERE known.id = c.id)
  ),
  side AS (
    SELECT m.depth AS owner, c.id, c.parent_ids, 1 AS step FROM mainline m
    CROSS JOIN LATERAL unnest(m.parent_ids[2:]) AS parent(id)
    JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = parent.id
    WHERE NOT EXISTS (SELECT 1 FROM known WHERE known.id = c.id)
      AND NOT EXISTS (SELECT 1 FROM mainline x WHERE x.id = c.id)
    UNION
    SELECT s.owner, c.id, c.parent_ids, s.step + 1 FROM side s
    CROSS JOIN LATERAL unnest(s.parent_ids) AS parent(id)
    JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = parent.id
    WHERE NOT EXISTS (SELECT 1 FROM known WHERE known.id = c.id)
      AND NOT EXISTS (SELECT 1 FROM mainline x WHERE x.id = c.id)
  ),
  -- 侧枝提交归到最早把它带进来的主线提交（离头最远，depth 最大）；组内按到那个合并提交的最长距离由远到近，父因此先于子
  side_group AS (
    SELECT id, max(owner) AS owner FROM side GROUP BY id
  ),
  ordered AS (
    SELECT s.id, g.owner AS grp, max(s.step) AS rank FROM side s
    JOIN side_group g ON g.id = s.id AND g.owner = s.owner
    GROUP BY s.id, g.owner
    UNION ALL
    SELECT id, depth, 0 FROM mainline
  ),
  numbered AS (
    SELECT id, row_number() OVER (ORDER BY grp DESC, rank DESC) AS position,
      count(*) OVER (ORDER BY grp DESC) AS through_group
    FROM ordered
  ),
  page AS (
    SELECT id, position FROM numbered
    WHERE through_group <= greatest(greatest(1, least(p_limit, 100)), (SELECT min(through_group) FROM numbered))
  )
  SELECT jsonb_build_object(
    'head', (SELECT head FROM branch),
    'more', (SELECT count(*) FROM numbered) > (SELECT count(*) FROM page),
    'commits', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'commitId', c.id, 'parentIds', to_jsonb(c.parent_ids), 'kind', c.kind, 'message', c.message,
          'authorId', c.author_id,
          'createdAt', to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'contentFingerprint', c.content_fingerprint,
          'units', coalesce((
            SELECT jsonb_agg(jsonb_build_object('unitId', x.unit_id, 'transactionId', x.transaction_id,
                'namespace', x.namespace, 'entity', x.entity, 'entityId', x.entity_id, 'operation', x.operation,
                'patch', x.patch, 'inversePatch', x.inverse_patch, 'origin', x.origin) ORDER BY x.sequence)
            FROM admin_private.commit_changes x
            WHERE x.team_id = p_team_id AND x.app_id = p_app_id AND x.commit_id = c.id), '[]'::jsonb))
        ORDER BY page.position)
      FROM page
      JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = page.id), '[]'::jsonb))
  WHERE admin_private.can_read(p_team_id, p_app_id)
$$;

-- 5. 授权：Supabase 给 public 下新建的视图与函数默认授予 anon / authenticated 全部权限，这里收回，只给登录用户读。
-- 协作专用角色（admin_collaboration）不读投影、不调读取函数。
REVOKE ALL ON public.admin_workspaces, public.admin_commits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_workspaces, public.admin_commits TO authenticated;
REVOKE ALL ON FUNCTION public.admin_commit_path(text, text, text, text),
  public.admin_commit_lineage(text, text, text), public.admin_commit_history(text, text, text, text, integer),
  public.admin_commit_changes(text, text, text[], text[]),
  public.admin_commit_exchange(text, text, text, text[], integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_commit_path(text, text, text, text),
  public.admin_commit_lineage(text, text, text), public.admin_commit_history(text, text, text, text, integer),
  public.admin_commit_changes(text, text, text[], text[]),
  public.admin_commit_exchange(text, text, text, text[], integer)
  TO authenticated;

-- PostgREST 重新加载结构缓存，新视图与函数立即可查
NOTIFY pgrst, 'reload schema';
COMMIT;
