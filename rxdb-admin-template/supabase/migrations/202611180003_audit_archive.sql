BEGIN;
-- 审计归档（ADMIN-US-217 AC#6）：审计只追加，热表 public.admin_audit 随时间增长；满足策略的事件由迁移所有者分批移入归档表
-- admin_private.audit_archive（运维命令 nx run admin-collaboration:audit-archive，按 ADMIN_AUDIT_ARCHIVE_AFTER_DAYS /
-- ADMIN_AUDIT_KEEP_LATEST 调用下文的 admin_private.archive_audit()）。归档只是搬家：每一列（含原 seq、时间与 PR / 线程归属）原样保留，
-- 只读投影 public.admin_audit_events 把两张表合在一起，审计分页与最近一窗照常读得到归档的事件，可见范围仍只属于可读成员。
-- 审计总数（admin_workspace_versions.audit_count）含归档，归档不改它。旧版前端只读热表，归档要在读这个投影的前端上线之后才启用。
-- 全部语句幂等：可在已执行过前面迁移的库上重复执行，也可在它们之前或之后单独重跑，结果不变。

-- 归档表：与热表同列，seq 保留原值（不是自增列），另记归档时间；客户端与协作专用角色都不能直接访问，开着 RLS 且没有任何策略。
CREATE TABLE IF NOT EXISTS admin_private.audit_archive (
  team_id text NOT NULL,
  app_id text NOT NULL,
  id text NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  seq bigint NOT NULL,
  pr_id text,
  thread_id text,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, app_id, id),
  FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id)
);
-- 与热表相同的分页索引：按写入顺序，以及按 PR、按线程筛选
CREATE INDEX IF NOT EXISTS audit_archive_order ON admin_private.audit_archive (team_id, app_id, seq);
CREATE INDEX IF NOT EXISTS audit_archive_pr ON admin_private.audit_archive (team_id, app_id, pr_id, seq)
  WHERE pr_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_archive_thread ON admin_private.audit_archive (team_id, app_id, thread_id, seq)
  WHERE thread_id IS NOT NULL;
ALTER TABLE admin_private.audit_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.audit_archive FROM PUBLIC, anon, authenticated, admin_collaboration;

-- 热表按时间选归档对象：时间索引避免按时间范围全表扫描
CREATE INDEX IF NOT EXISTS admin_audit_age ON public.admin_audit (created_at);

-- 只读投影：热表与归档表合在一起，两支各自按 can_read() 判定成员资格；security_barrier 保证调用方的筛选不会先于这些条件求值。
-- 一个事件同一时刻只在其中一张表里（归档在同一条语句里删除再插入），按 seq 排序、按 seq 游标翻页与归档前完全相同。
CREATE OR REPLACE VIEW public.admin_audit_events WITH (security_barrier = true) AS
  SELECT a.team_id, a.app_id, a.id, a.actor_id, a.action, a.details, a.created_at, a.seq, a.pr_id, a.thread_id
  FROM public.admin_audit a
  WHERE admin_private.can_read(a.team_id, a.app_id)
  UNION ALL
  SELECT r.team_id, r.app_id, r.id, r.actor_id, r.action, r.details, r.created_at, r.seq, r.pr_id, r.thread_id
  FROM admin_private.audit_archive r
  WHERE admin_private.can_read(r.team_id, r.app_id);
-- 授权：Supabase 给 public 下新建的视图默认授予 anon / authenticated 全部权限，这里收回，只给登录用户读；协作专用角色不读审计
REVOKE ALL ON public.admin_audit_events FROM PUBLIC, anon, authenticated, admin_collaboration;
GRANT SELECT ON public.admin_audit_events TO authenticated;

-- 归档函数（只给迁移所有者，以所有者身份执行，不是定义者函数）：事件满足任一条件即归档——
--   p_older_than 非空且 created_at 早于 now() - p_older_than；
--   p_keep_latest 非空且它不在本工作区热表里按 seq 最新的 p_keep_latest 条之内（0 表示一条不留）。
-- 一次至多移动 p_batch 行，按 seq 从旧到新；选行时跳过被其他事务锁住的行（FOR UPDATE SKIP LOCKED），下一次再移。
-- 删除与插入在同一条语句里完成，返回移动的行数；调用方重复调用，直到返回值小于 p_batch。参数不合法时报错，什么都不移。
CREATE OR REPLACE FUNCTION admin_private.archive_audit(
  p_older_than interval DEFAULT NULL, p_keep_latest integer DEFAULT NULL, p_batch integer DEFAULT 5000
) RETURNS integer LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  moved integer;
BEGIN
  IF p_older_than IS NULL AND p_keep_latest IS NULL THEN
    RAISE EXCEPTION 'admin_private.archive_audit needs p_older_than, p_keep_latest or both' USING ERRCODE = '22023';
  END IF;
  IF p_older_than <= interval '0' OR p_keep_latest < 0 OR p_batch IS NULL OR p_batch < 1 THEN
    RAISE EXCEPTION 'admin_private.archive_audit needs a positive age, a non-negative count and a positive batch'
      USING ERRCODE = '22023';
  END IF;
  WITH boundaries AS (
    -- 每个工作区热表里第 p_keep_latest + 1 新的事件的 seq：它与更早的事件都不在保留窗口之内（索引逆序扫描，不读整表）
    SELECT w.team_id, w.app_id,
      (SELECT h.seq FROM public.admin_audit h WHERE h.team_id = w.team_id AND h.app_id = w.app_id
        ORDER BY h.seq DESC OFFSET p_keep_latest LIMIT 1) AS seq
    FROM admin_private.workspaces w
    WHERE p_keep_latest IS NOT NULL
  ), picked AS (
    SELECT a.team_id, a.app_id, a.id
    FROM public.admin_audit a
    LEFT JOIN boundaries b ON b.team_id = a.team_id AND b.app_id = a.app_id
    WHERE (p_older_than IS NOT NULL AND a.created_at < now() - p_older_than)
      OR (b.seq IS NOT NULL AND a.seq <= b.seq)
    ORDER BY a.seq
    LIMIT p_batch
    FOR UPDATE OF a SKIP LOCKED
  ), removed AS (
    DELETE FROM public.admin_audit a USING picked p
    WHERE a.team_id = p.team_id AND a.app_id = p.app_id AND a.id = p.id
    RETURNING a.team_id, a.app_id, a.id, a.actor_id, a.action, a.details, a.created_at, a.seq, a.pr_id, a.thread_id
  )
  INSERT INTO admin_private.audit_archive(team_id, app_id, id, actor_id, action, details, created_at, seq, pr_id, thread_id)
  SELECT r.team_id, r.app_id, r.id, r.actor_id, r.action, r.details, r.created_at, r.seq, r.pr_id, r.thread_id
  FROM removed r;
  GET DIAGNOSTICS moved = ROW_COUNT;
  RETURN moved;
END $$;
REVOKE ALL ON FUNCTION admin_private.archive_audit(interval, integer, integer)
  FROM PUBLIC, anon, authenticated, admin_collaboration;

-- PostgREST 重新加载结构缓存，新投影立即可查
NOTIFY pgrst, 'reload schema';
COMMIT;
